import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import {
  ENTRY_MATCHED_COPY,
  ENTRY_NO_MATCH_COPY,
  ENTRY_UNCHECKED_COPY,
  StudentEntryStep,
} from "./StudentEntryStep";
import { ApiError } from "@/lib/api/client";
import {
  clearOnboardingDraft,
  getOnboardingDraft,
  startOnboardingDraft,
} from "@/lib/auth/onboarding";
import {
  clearSignInHandoff,
  peekSignInHandoff,
} from "@/lib/auth/signInHandoff";

/**
 * 05 Entry - the one screen that says which child has arrived (SCRUM-208).
 *
 * It replaced three screens and two doors: name and age, school code, class,
 * the class code and the QR scan. What it has to get right is small and every
 * part of it decides something about a child:
 *
 *   - the code is four cells from an alphabet with no 0, O, 1 or I;
 *   - a miss never says which of the two was wrong;
 *   - a match goes where the child's STATE says - held, signed back in, or on
 *     into the first run - and nowhere else.
 */

vi.setConfig({ testTimeout: 30_000 });

const { push, lookup } = vi.hoisted(() => ({
  push: vi.fn(),
  lookup: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks", () => ({
  useSignals: () => ({ trackEvent: vi.fn(), flush: vi.fn() }),
}));
vi.mock("@/lib/api/studentEntry", () => ({ studentEntryApi: { lookup } }));

/** The frame's beat on "Found you" before moving on. */
const MATCH_BEAT_MS = 900;

const matched = (over: Record<string, unknown> = {}) => ({
  firstName: "Amara",
  className: "JSS 1B",
  consentState: "given",
  age: 11,
  accountReady: false,
  ageCheckPending: false,
  ...over,
});

const cells = () =>
  screen.getAllByLabelText(/School code, character/) as HTMLInputElement[];
const idField = () =>
  screen.getByLabelText("Student ID / Admission Number") as HTMLInputElement;
const typeInto = (el: HTMLInputElement, value: string) =>
  fireEvent.change(el, { target: { value } });
const continueButton = () =>
  screen.getByRole("button", { name: /^(Continue|Try again)$/ });
const message = () => document.querySelector('[role="status"]')?.textContent ?? "";

/** Type the demo pair the frame uses, then press Continue. */
async function enterAndSubmit(code = "k7dq", id = "bga/2031") {
  typeInto(cells()[0], code);
  typeInto(idField(), id);
  fireEvent.click(continueButton());
  await act(async () => {});
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  push.mockReset();
  lookup.mockReset();
  clearOnboardingDraft();
  clearSignInHandoff();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  clearOnboardingDraft();
  clearSignInHandoff();
});

describe("the school code cells", () => {
  it("draws four cells and the Student ID field, with the frame's labels", () => {
    render(<StudentEntryStep framing="school" />);

    expect(cells()).toHaveLength(4);
    expect(screen.getByText("School code")).toBeInTheDocument();
    expect(idField()).toBeInTheDocument();
    // No prefix: NEVO- went with the any-length field (D6).
    expect(document.body.textContent).not.toMatch(/NEVO-/);
  });

  it("capitalises what a child types", () => {
    render(<StudentEntryStep framing="school" />);

    typeInto(cells()[0], "k");

    expect(cells()[0].value).toBe("K");
  });

  it("refuses 0, O, 1, I and anything that is not a letter or digit", () => {
    // The four characters a child misreads off a whiteboard are not in any
    // school's code, so typing one is never what they meant.
    render(<StudentEntryStep framing="school" />);
    act(() => cells()[0].focus());

    for (const ch of ["0", "o", "O", "1", "i", "I", "-", "/", " "]) {
      typeInto(cells()[0], ch);
      expect(cells()[0].value, ch).toBe("");
    }
    // And focus did not move on for a character that was not taken.
    expect(document.activeElement).toBe(cells()[0]);
  });

  it("moves to the next cell on each character, then to the Student ID", () => {
    render(<StudentEntryStep framing="school" />);

    typeInto(cells()[0], "K");
    expect(document.activeElement).toBe(cells()[1]);
    typeInto(cells()[1], "7");
    expect(document.activeElement).toBe(cells()[2]);
    typeInto(cells()[2], "D");
    expect(document.activeElement).toBe(cells()[3]);
    typeInto(cells()[3], "Q");

    expect(document.activeElement).toBe(idField());
  });

  it("spreads a pasted code across the cells", () => {
    render(<StudentEntryStep framing="school" />);

    typeInto(cells()[0], "k7dq");

    expect(cells().map((c) => c.value)).toEqual(["K", "7", "D", "Q"]);
    expect(document.activeElement).toBe(idField());
  });

  it("goes back a cell on Backspace in an empty one, clearing it", () => {
    render(<StudentEntryStep framing="school" />);
    typeInto(cells()[0], "K7");
    expect(document.activeElement).toBe(cells()[2]);

    fireEvent.keyDown(cells()[2], { key: "Backspace" });

    expect(cells().map((c) => c.value)).toEqual(["K", "", "", ""]);
    expect(document.activeElement).toBe(cells()[1]);
  });

  it("clears a filled cell in place", () => {
    render(<StudentEntryStep framing="school" />);
    typeInto(cells()[0], "K7D");

    typeInto(cells()[1], "");

    expect(cells().map((c) => c.value)).toEqual(["K", "", "D", ""]);
  });

  it("keeps Continue shut until all four cells and the ID are filled", () => {
    render(<StudentEntryStep framing="school" />);
    expect(continueButton()).toBeDisabled();

    typeInto(cells()[0], "K7D");
    typeInto(idField(), "BGA/2031");
    expect(continueButton()).toBeDisabled();

    typeInto(cells()[3], "Q");
    expect(continueButton()).toBeEnabled();
  });
});

describe("the lookup", () => {
  it("sends the code and the ID together, as the child sees them", async () => {
    lookup.mockResolvedValue(matched());
    render(<StudentEntryStep framing="school" />);

    await enterAndSubmit("k7dq", "  bga/2031 ");

    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith({
      schoolCode: "K7DQ",
      admissionNumber: "BGA/2031",
    });
  });

  it("says it found them while it moves on", async () => {
    lookup.mockResolvedValue(matched());
    render(<StudentEntryStep framing="school" />);

    await enterAndSubmit();

    expect(message()).toBe(ENTRY_MATCHED_COPY);
    expect(push).not.toHaveBeenCalled();
  });

  it("does not say which of the two was wrong when they do not match", async () => {
    lookup.mockRejectedValue(new ApiError(404, "not found"));
    render(<StudentEntryStep framing="school" />);

    await enterAndSubmit();

    expect(message()).toBe(ENTRY_NO_MATCH_COPY);
    // Not the code, not the ID, and not whether that ID exists anywhere.
    expect(message()).not.toMatch(/school code|student id|admission|exist/i);
  });

  it("keeps both values as typed and offers Try again", async () => {
    lookup.mockRejectedValue(new ApiError(404, "not found"));
    render(<StudentEntryStep framing="school" />);

    await enterAndSubmit();

    expect(cells().map((c) => c.value)).toEqual(["K", "7", "D", "Q"]);
    expect(idField().value).toBe("BGA/2031");
    expect(continueButton()).toHaveTextContent("Try again");
    expect(continueButton()).toBeEnabled();
  });

  it("asks again on Try again", async () => {
    lookup.mockRejectedValueOnce(new ApiError(404, "not found"));
    lookup.mockResolvedValueOnce(matched());
    render(<StudentEntryStep framing="school" />);
    await enterAndSubmit();

    fireEvent.click(continueButton());
    await act(async () => {});

    expect(lookup).toHaveBeenCalledTimes(2);
    expect(message()).toBe(ENTRY_MATCHED_COPY);
  });

  it("goes back to Continue once the child changes what they typed", async () => {
    lookup.mockRejectedValue(new ApiError(404, "not found"));
    render(<StudentEntryStep framing="school" />);
    await enterAndSubmit();

    typeInto(idField(), "BGA/2013");

    expect(continueButton()).toHaveTextContent("Continue");
    expect(message()).toBe("");
  });

  it("never blames the child for a lookup we could not run", async () => {
    lookup.mockRejectedValue(new ApiError(503, "cold start"));
    render(<StudentEntryStep framing="school" />);

    await enterAndSubmit();

    expect(message()).toBe(ENTRY_UNCHECKED_COPY);
    expect(message()).not.toBe(ENTRY_NO_MATCH_COPY);
  });

  it("reads a dropped network and a rate limit the same way", async () => {
    for (const err of [new Error("offline"), new ApiError(429, "slow down")]) {
      lookup.mockReset().mockRejectedValue(err);
      render(<StudentEntryStep framing="school" />);

      await enterAndSubmit();

      expect(message()).toBe(ENTRY_UNCHECKED_COPY);
      cleanup();
    }
  });
});

describe("where a match goes", () => {
  const afterTheBeat = () =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(MATCH_BEAT_MS + 50);
    });

  it("takes a consented child into the first run, carrying what the roster said", async () => {
    lookup.mockResolvedValue(matched());
    render(<StudentEntryStep framing="school" />);

    await enterAndSubmit();
    await afterTheBeat();

    expect(push).toHaveBeenCalledWith("/student/onboarding/sequence");
    expect(getOnboardingDraft()).toEqual({
      schoolCode: "K7DQ",
      admissionNumber: "BGA/2031",
      name: "Amara",
      age: 11,
    });
  });

  it("asks nothing the roster could not say: no age is carried when none came", async () => {
    lookup.mockResolvedValue(matched({ age: null }));
    render(<StudentEntryStep framing="school" />);

    await enterAndSubmit();
    await afterTheBeat();

    expect(getOnboardingDraft()).not.toHaveProperty("age");
  });

  it("starts a fresh draft, not one an earlier child left", async () => {
    startOnboardingDraft({ name: "Someone Else", age: 7 });
    lookup.mockResolvedValue(matched({ age: null }));
    render(<StudentEntryStep framing="school" />);

    await enterAndSubmit();
    await afterTheBeat();

    expect(getOnboardingDraft().name).toBe("Amara");
    expect(getOnboardingDraft()).not.toHaveProperty("age");
  });

  it.each([
    ["pending", { consentState: "pending" }],
    ["withdrawn", { consentState: "withdrawn" }],
    ["a disputed date of birth", { ageCheckPending: true }],
  ])("holds a child at 00d, in place, when consent is %s", async (_, over) => {
    lookup.mockResolvedValue(matched(over));
    render(<StudentEntryStep framing="school" />);

    await enterAndSubmit();
    await afterTheBeat();

    expect(
      screen.getByRole("heading", { name: "Nevo isn't quite ready for you yet" }),
    ).toBeInTheDocument();
    // Not a route a signed-out child would be bounced from, and nothing of
    // theirs kept for a flow they are not starting.
    expect(push).not.toHaveBeenCalled();
    expect(getOnboardingDraft()).toEqual({});
  });

  it("holds on an accountReady child too, when their consent is not in", async () => {
    // One screen per state, whichever door: a held child meets 00d even if
    // they would otherwise have been sent to sign back in.
    lookup.mockResolvedValue(
      matched({ consentState: "pending", accountReady: true }),
    );
    render(<StudentEntryStep framing="school" />);

    await enterAndSubmit();
    await afterTheBeat();

    expect(push).not.toHaveBeenCalled();
    expect(peekSignInHandoff()).toBeNull();
  });

  it("sends a child who already has a PIN to sign back in, with what they typed", async () => {
    lookup.mockResolvedValue(matched({ accountReady: true }));
    render(<StudentEntryStep framing="school" />);

    await enterAndSubmit();
    await afterTheBeat();

    expect(push).toHaveBeenCalledWith("/auth/sign-in");
    expect(push).not.toHaveBeenCalledWith("/student/onboarding/sequence");
    expect(peekSignInHandoff()).toEqual({
      schoolCode: "K7DQ",
      identifier: "BGA/2031",
    });
    // Not a second account's draft.
    expect(getOnboardingDraft()).toEqual({});
  });
});

describe("the two doors", () => {
  it("frames 05 as finding your school", () => {
    render(<StudentEntryStep framing="school" />);

    expect(
      screen.getByRole("heading", { name: "Find your school" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Your school gives you both of these."),
    ).toBeInTheDocument();
  });

  it("frames 03 for a code the teacher reads out, on the same screen", () => {
    render(<StudentEntryStep framing="teacher" />);

    expect(
      screen.getByRole("heading", { name: "Join your school" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Your teacher will read out the school code."),
    ).toBeInTheDocument();
    expect(cells()).toHaveLength(4);
    // No class code and no QR scan: both were retired on 30 Sep.
    expect(document.body.textContent).not.toMatch(/class code|QR/i);
  });
});
