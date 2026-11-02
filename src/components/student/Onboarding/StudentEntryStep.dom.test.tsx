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
  clearEntryHandBack,
  handEntryBack,
  peekEntryHandBack,
} from "@/lib/auth/entryHandBack";
import {
  clearOnboardingDraft,
  forgetOnboardingDraft,
  getOnboardingDraft,
  startOnboardingDraft,
} from "@/lib/auth/onboarding";
import {
  clearSession,
  getRememberedProfile,
  getSession,
} from "@/lib/auth/session";
import {
  clearSignInHandoff,
  peekSignInHandoff,
} from "@/lib/auth/signInHandoff";
import { STUDENT_PIN_LENGTH } from "@/lib/constants";

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

const { push, lookup, entrySetPin, authSetPin, myConsentGate, signOut } =
  vi.hoisted(() => ({
    push: vi.fn(),
    lookup: vi.fn(),
    entrySetPin: vi.fn(),
    authSetPin: vi.fn(),
    myConsentGate: vi.fn(),
    signOut: vi.fn(),
  }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks", () => ({
  useSignals: () => ({ trackEvent: vi.fn(), flush: vi.fn() }),
  // 00d's Back (D189), and 00e's (Lydia, 17 Oct). A child held here has no
  // session to end.
  useAuth: () => ({ signOut }),
}));
vi.mock("@/lib/api/studentEntry", () => ({
  studentEntryApi: { lookup, setPin: entrySetPin },
}));
// The signed-in store, which a cleared child must never reach.
vi.mock("@/lib/api", () => ({ authApi: { setPin: authSetPin } }));
vi.mock("@/lib/api/consents", () => ({ consentsApi: { myConsentGate } }));

/** The frame's beat on "Found you" before moving on. */
const MATCH_BEAT_MS = 900;

const matched = (over: Record<string, unknown> = {}) => ({
  firstName: "Amara",
  className: "JSS 1B",
  consentState: "given",
  age: 11,
  ageBand: "junior_secondary",
  yearGroup: "JSS 1",
  accountReady: false,
  ageCheckPending: false,
  ...over,
});

/** A miss, as the live lookup answers one (declared since 13 Oct, B124). */
const notFound = () =>
  new ApiError(404, "not found", {
    detail: {
      code: "entry_not_found",
      message: "That did not match. Check the code and the ID with your teacher.",
    },
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
  signOut.mockReset();
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
  it("keeps the tray in capitals, as both fields are", () => {
    // The one-shot shift dropped the keys to lowercase after the first letter
    // while the cells and the Student ID upper-cased whatever arrived.
    render(<StudentEntryStep framing="school" />);
    act(() => cells()[0].focus());

    fireEvent.click(screen.getByRole("button", { name: "K" }));

    expect(cells()[0].value).toBe("K");
    expect(screen.getByRole("button", { name: "D" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "d" })).toBeNull();
  });

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
    lookup.mockRejectedValue(notFound());
    render(<StudentEntryStep framing="school" />);

    await enterAndSubmit();

    expect(message()).toBe(ENTRY_NO_MATCH_COPY);
    // Not the code, not the ID, and not whether that ID exists anywhere.
    expect(message()).not.toMatch(/school code|student id|admission|exist/i);
  });

  it("keeps both values as typed and offers Try again", async () => {
    lookup.mockRejectedValue(notFound());
    render(<StudentEntryStep framing="school" />);

    await enterAndSubmit();

    expect(cells().map((c) => c.value)).toEqual(["K", "7", "D", "Q"]);
    expect(idField().value).toBe("BGA/2031");
    expect(continueButton()).toHaveTextContent("Try again");
    expect(continueButton()).toBeEnabled();
  });

  it("asks again on Try again", async () => {
    lookup.mockRejectedValueOnce(notFound());
    lookup.mockResolvedValueOnce(matched());
    render(<StudentEntryStep framing="school" />);
    await enterAndSubmit();

    fireEvent.click(continueButton());
    await act(async () => {});

    expect(lookup).toHaveBeenCalledTimes(2);
    expect(message()).toBe(ENTRY_MATCHED_COPY);
  });

  it("goes back to Continue once the child changes what they typed", async () => {
    lookup.mockRejectedValue(notFound());
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

  /*
   * The frame's "unreachable" state (root entry frame, 29af2a4): its own
   * words, the fields NOT tinted, and the button still "Continue". It used to
   * look exactly like a miss but for the line.
   */
  it("says nothing typed is wrong, in the frame's words, and leaves the fields and Continue alone", async () => {
    lookup.mockRejectedValue(new ApiError(503, "cold start"));
    render(<StudentEntryStep framing="school" />);

    await enterAndSubmit();

    expect(message()).toBe(
      "We couldn't check just now. Nothing you typed is wrong - press Continue to try again.",
    );
    expect(continueButton()).toHaveTextContent("Continue");
    expect(continueButton()).toBeEnabled();
    expect(idField().parentElement?.className).not.toContain("border-nevo-violet");
    expect(cells()[0].className).not.toContain("border-nevo-violet");
  });

  it("asks again on Continue after a lookup we could not run", async () => {
    lookup.mockRejectedValueOnce(new ApiError(503, "cold start"));
    lookup.mockResolvedValueOnce(matched());
    render(<StudentEntryStep framing="school" />);
    await enterAndSubmit();

    fireEvent.click(continueButton());
    await act(async () => {});

    expect(lookup).toHaveBeenCalledTimes(2);
    expect(message()).toBe(ENTRY_MATCHED_COPY);
  });

  it("still tints the fields for a real miss", async () => {
    lookup.mockRejectedValue(notFound());
    render(<StudentEntryStep framing="school" />);

    await enterAndSubmit();

    expect(idField().parentElement?.className).toContain("border-nevo-violet");
    expect(cells()[0].className).toContain("border-nevo-violet");
  });

  /*
   * B124: the miss is 404 `entry_not_found`, by code. Any 4xx used to be read
   * as one, so a 404 from a lost route sent a child to their teacher to
   * re-check two things that were right.
   */
  it("reads only entry_not_found as a miss, not any 4xx", async () => {
    for (const err of [
      new ApiError(404, "Not Found", { detail: "Not Found" }),
      new ApiError(422, "invalid", { detail: [{ msg: "too short" }] }),
      new ApiError(409, "refused", { detail: { code: "something_else" } }),
    ]) {
      lookup.mockReset().mockRejectedValue(err);
      render(<StudentEntryStep framing="school" />);

      await enterAndSubmit();

      expect(message(), String(err.status)).toBe(ENTRY_UNCHECKED_COPY);
      expect(continueButton()).toHaveTextContent("Continue");
      cleanup();
    }
  });

  it("reads a dropped network as a lookup we could not run", async () => {
    lookup.mockRejectedValue(new Error("offline"));
    render(<StudentEntryStep framing="school" />);

    await enterAndSubmit();

    expect(message()).toBe(ENTRY_UNCHECKED_COPY);
  });
});

/*
 * The lookup's 429 `too_many_attempts` (declared 13 Oct) is D154's pause, in
 * D156's words: "One wording everywhere a pause is shown". It said "press
 * Continue to try again", which sends a child further into the lockout.
 */
describe("too many attempts", () => {
  const pauseNote = "Let's wait a little before trying again.";

  it.each([
    ["a 429", new ApiError(429, "slow down")],
    [
      "too_many_attempts on another status",
      new ApiError(401, "refused", {
        detail: { code: "too_many_attempts", message: "said" },
      }),
    ],
  ])("pauses on %s, in the door's words, with no way to press again", async (_, err) => {
    lookup.mockRejectedValue(err);
    render(<StudentEntryStep framing="school" />);

    await enterAndSubmit();

    expect(
      screen.getByRole("heading", { name: "Let's take a moment" }),
    ).toBeInTheDocument();
    expect(screen.getByText(pauseNote)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/press Continue|Try again/);
    expect(
      screen.queryByRole("button", { name: /^(Continue|Try again)$/ }),
    ).toBeNull();
    // No retry time is sent, so none is named.
    expect(screen.getByText(pauseNote).textContent).not.toMatch(/\d/);
  });

  it("holds what was typed, as the PIN door holds its boxes, until the child leaves", async () => {
    lookup.mockRejectedValue(new ApiError(429, "slow down"));
    render(<StudentEntryStep framing="school" />);
    await enterAndSubmit();

    expect(cells().map((c) => c.value)).toEqual(["K", "7", "D", "Q"]);
    expect(idField().value).toBe("BGA/2031");
    expect(idField().readOnly).toBe(true);
    expect(cells()[0].readOnly).toBe(true);

    // Neither an edit nor Enter asks again, and nothing ends it on a timer.
    typeInto(idField(), "BGA/2013");
    fireEvent.keyDown(idField(), { key: "Enter" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    });

    expect(idField().value).toBe("BGA/2031");
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(screen.getByText(pauseNote)).toBeInTheDocument();
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
      // The server's band (9 Oct), not the age or the year group: the
      // device bands nothing itself.
      ageBand: "junior_secondary",
      // The lookup's consent answer, the only one there is before the
      // account exists: the baseline captures on it and nothing else (19 Oct).
      consent: "given",
    });
  });

  it("carries the server's band for a child with no date of birth, from their class", async () => {
    // No age to band, but the server banded them by their class year.
    lookup.mockResolvedValue(matched({ age: null, ageBand: "upper_primary" }));
    render(<StudentEntryStep framing="school" />);

    await enterAndSubmit();
    await afterTheBeat();

    expect(getOnboardingDraft().ageBand).toBe("upper_primary");
  });

  it("asks nothing the roster could not say: no band is carried when none came", async () => {
    lookup.mockResolvedValue(matched({ age: null, ageBand: null }));
    render(<StudentEntryStep framing="school" />);

    await enterAndSubmit();
    await afterTheBeat();

    expect(getOnboardingDraft()).not.toHaveProperty("ageBand");
    expect(getOnboardingDraft()).not.toHaveProperty("age");
  });

  it("starts a fresh draft, not one an earlier child left", async () => {
    startOnboardingDraft({ name: "Someone Else", ageBand: "early_primary" });
    lookup.mockResolvedValue(matched({ age: null, ageBand: null }));
    render(<StudentEntryStep framing="school" />);

    await enterAndSubmit();
    await afterTheBeat();

    expect(getOnboardingDraft().name).toBe("Amara");
    expect(getOnboardingDraft()).not.toHaveProperty("ageBand");
  });

  it.each([
    ["pending", { consentState: "pending" }],
    [
      "pending, with a disputed date of birth too",
      { consentState: "pending", ageCheckPending: true },
    ],
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
    // D189: and a way back, so the tablet is not held for everyone else.
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
  });

  /*
   * 00d's Check again (design 5bb9ee2, 28 Oct): "re-checks (if consent has
   * arrived it goes straight to the assessment)".
   */
  it("goes straight on into the run when Check again finds consent has come", async () => {
    lookup
      .mockResolvedValueOnce(matched({ consentState: "pending" }))
      .mockResolvedValueOnce(matched());
    render(<StudentEntryStep framing="school" />);
    await enterAndSubmit();
    await afterTheBeat();

    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await act(async () => {});

    expect(lookup).toHaveBeenCalledTimes(2);
    expect(lookup).toHaveBeenLastCalledWith({
      schoolCode: "K7DQ",
      admissionNumber: "BGA/2031",
    });
    expect(push).toHaveBeenCalledWith("/student/onboarding/sequence");
    expect(getOnboardingDraft().name).toBe("Amara");
  });

  it("stays on 00d, as it was, when Check again finds consent still waiting", async () => {
    lookup.mockResolvedValue(matched({ consentState: "pending" }));
    render(<StudentEntryStep framing="school" />);
    await enterAndSubmit();
    await afterTheBeat();

    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await act(async () => {});

    expect(lookup).toHaveBeenCalledTimes(2);
    expect(push).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "Nevo isn't quite ready for you yet" }),
    ).toBeInTheDocument();
  });

  it("stays on 00d when the lookup behind Check again does not answer", async () => {
    lookup
      .mockResolvedValueOnce(matched({ consentState: "pending" }))
      .mockRejectedValueOnce(new ApiError(503, "cold start"));
    render(<StudentEntryStep framing="school" />);
    await enterAndSubmit();
    await afterTheBeat();

    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await act(async () => {});

    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Check again" })).toBeInTheDocument();
  });

  it("holds a child whose consent was withdrawn on 00e, in place, never 00d (D117)", async () => {
    // 00e: "it was there and is gone, so 'soon' would be a lie".
    lookup.mockResolvedValue(
      matched({ consentState: "withdrawn", ageCheckPending: true }),
    );
    render(<StudentEntryStep framing="school" />);

    await enterAndSubmit();
    await afterTheBeat();

    expect(
      screen.getByRole("heading", {
        name: "Nevo isn't available to you at the moment",
      }),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/soon|consent|parent/i);
    expect(push).not.toHaveBeenCalled();
    expect(getOnboardingDraft()).toEqual({});
    // Lydia, 17 Oct: Back, same as 00d - and since design's 28 Oct frame the
    // hand-off to the next child - and nothing else, so the tablet is not held
    // for everyone else. Nobody is signed in to sign out.
    expect(
      screen
        .getAllByRole("button")
        .map((b) => b.getAttribute("aria-label") ?? b.textContent),
    ).toEqual(["Back", "Someone else using this device?"]);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(signOut).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("holds a child whose date of birth is in dispute, in place, with the Entry frame's hold (D121)", async () => {
    // B64: the school and the parent disagree, the child cannot start and can
    // do nothing about it. Never told what or why - and not sent to 00d,
    // whose "It will be soon" is a promise about consent.
    lookup.mockResolvedValue(matched({ ageCheckPending: true }));
    render(<StudentEntryStep framing="school" />);

    await enterAndSubmit();
    await afterTheBeat();

    expect(
      screen.getByRole("heading", {
        name: "Nevo is sorting something out with your school",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("It's nothing you did, and there's nothing for you to fix."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: "Nevo isn't quite ready for you yet",
      }),
    ).toBeNull();
    expect(push).not.toHaveBeenCalled();
    expect(getOnboardingDraft()).toEqual({});
  });

  it("keeps the entry screen's Back on the age-check hold, and nothing else to press (05, state 6)", async () => {
    // It was 00d's screen - a wordmark and no way off it - so on a shared
    // tablet the next child could not get past it. The Entry frame keeps its
    // chevron row: Back to the Welcome is the one control.
    lookup.mockResolvedValue(matched({ ageCheckPending: true }));
    render(<StudentEntryStep framing="school" />);

    await enterAndSubmit();
    await afterTheBeat();

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName("Back");

    fireEvent.click(buttons[0]);

    expect(push).toHaveBeenCalledWith("/student/onboarding");
  });

  it("holds a child at the age check even when they already have a PIN", async () => {
    lookup.mockResolvedValue(
      matched({ ageCheckPending: true, accountReady: true }),
    );
    render(<StudentEntryStep framing="school" />);

    await enterAndSubmit();
    await afterTheBeat();

    expect(
      screen.getByRole("heading", {
        name: "Nevo is sorting something out with your school",
      }),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(peekSignInHandoff()).toBeNull();
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

/**
 * B67: a child whose PIN a teacher cleared. The lookup says so with
 * `pinCleared`, and they choose a new PIN here - not 00c, which 401s on the
 * PIN they remember, and not the first run, which would re-run the baseline.
 */
describe("a child whose PIN a teacher cleared (B67)", () => {
  const PIN = "1234567".slice(0, STUDENT_PIN_LENGTH);

  const SESSION = {
    userId: "student-9",
    loginIdentifier: "NV-A1B2C3",
    session: {
      accessToken: "tok-s",
      tokenType: "bearer",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      userId: "student-9",
      role: "student",
    },
  };

  const refused = (status: number, code: string) =>
    new ApiError(status, "refused", { detail: { code, message: "said" } });

  /** Match a cleared child, and wait out the "Found you" beat. */
  async function matchCleared() {
    lookup.mockResolvedValue(matched({ pinCleared: true }));
    render(<StudentEntryStep framing="school" />);
    await enterAndSubmit();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MATCH_BEAT_MS + 50);
    });
  }

  /** Type the new PIN twice, and wait past the beat before it is written. */
  async function chooseNewPin() {
    for (const digit of [...PIN, ...PIN]) {
      fireEvent.click(screen.getByRole("button", { name: digit }));
    }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
  }

  beforeEach(() => {
    entrySetPin.mockReset();
    authSetPin.mockReset();
    myConsentGate.mockReset();
    myConsentGate.mockResolvedValue({ blocked: false, status: "confirmed" });
    clearSession();
    window.localStorage.clear();
  });

  afterEach(() => {
    clearSession();
    window.localStorage.clear();
  });

  it("opens on choosing a new PIN, in place - not sign-in, not the first run", async () => {
    await matchCleared();

    expect(
      screen.getByRole("heading", { name: "Choose a new PIN" }),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(peekSignInHandoff()).toBeNull();
  });

  it("stores it through the entry PIN route with the pair they typed, never the signed-in setPin", async () => {
    entrySetPin.mockResolvedValue(SESSION);
    await matchCleared();
    await chooseNewPin();

    expect(entrySetPin).toHaveBeenCalledTimes(1);
    expect(entrySetPin).toHaveBeenCalledWith({
      schoolCode: "K7DQ",
      admissionNumber: "BGA/2031",
      pin: PIN,
    });
    expect(authSetPin).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "You're all set" }),
    ).toBeInTheDocument();
    expect(getSession()).toMatchObject({
      token: "tok-s",
      userId: "student-9",
      role: "student",
    });
  });

  it("remembers them on the device and goes Home through the consent gate, not to You're In", async () => {
    entrySetPin.mockResolvedValue(SESSION);
    await matchCleared();
    await chooseNewPin();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1300);
    });

    expect(myConsentGate).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/student/dashboard");
    expect(push).not.toHaveBeenCalledWith("/student/onboarding/sequence");
    expect(getRememberedProfile()).toMatchObject({
      schoolCode: "K7DQ",
      loginIdentifier: "NV-A1B2C3",
      displayName: "Amara",
    });
    // In the roster, and only there: no old single-profile copy (19 Oct).
    expect(window.localStorage.getItem("nevo.auth.profile")).toBeNull();
  });

  it("holds them instead of Home when the server holds them once they are in", async () => {
    entrySetPin.mockResolvedValue(SESSION);
    myConsentGate.mockResolvedValue({ blocked: true, status: "pending" });
    await matchCleared();
    await chooseNewPin();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1300);
    });

    expect(push).toHaveBeenCalledWith("/student/waiting");
    expect(push).not.toHaveBeenCalledWith("/student/dashboard");
  });

  it("is held for consent before the PIN screen, whatever pinCleared says", async () => {
    lookup.mockResolvedValue(
      matched({ pinCleared: true, consentState: "pending" }),
    );
    render(<StudentEntryStep framing="school" />);
    await enterAndSubmit();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MATCH_BEAT_MS + 50);
    });

    expect(
      screen.queryByRole("heading", { name: "Choose a new PIN" }),
    ).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Nevo isn't quite ready for you yet" }),
    ).toBeInTheDocument();
  });

  describe("when the PIN route refuses (B68)", () => {
    it("sends a child who has a PIN after all to sign in, with what they typed", async () => {
      entrySetPin.mockRejectedValue(refused(409, "pin_not_cleared"));
      await matchCleared();
      await chooseNewPin();

      expect(push).toHaveBeenCalledWith("/auth/sign-in");
      expect(peekSignInHandoff()).toEqual({
        schoolCode: "K7DQ",
        identifier: "BGA/2031",
      });
      expect(getOnboardingDraft()).toEqual({});
      expect(getSession()).toBeNull();
    });

    it("goes back to 05's miss, with both values as typed, for a pair that names nobody", async () => {
      entrySetPin.mockRejectedValue(refused(404, "entry_not_found"));
      await matchCleared();
      await chooseNewPin();

      expect(message()).toBe(ENTRY_NO_MATCH_COPY);
      expect(cells().map((c) => c.value).join("")).toBe("K7DQ");
      expect(idField().value).toBe("BGA/2031");
      expect(continueButton()).toHaveTextContent("Try again");
      expect(push).not.toHaveBeenCalled();
      expect(getOnboardingDraft()).toEqual({});
    });

    it.each([
      ["consent_pending", "Nevo isn't quite ready for you yet"],
      ["age_check_pending", "Nevo is sorting something out with your school"],
    ])("holds them in place for %s", async (code, heading) => {
      entrySetPin.mockRejectedValue(refused(403, code));
      await matchCleared();
      await chooseNewPin();

      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
      expect(push).not.toHaveBeenCalled();
      expect(getSession()).toBeNull();
    });

    it("holds them at the age check with the entry screen's Back, not 00d's dead end", async () => {
      entrySetPin.mockRejectedValue(refused(403, "age_check_pending"));
      await matchCleared();
      await chooseNewPin();

      const buttons = screen.getAllByRole("button");
      expect(buttons).toHaveLength(1);
      fireEvent.click(buttons[0]);
      expect(push).toHaveBeenCalledWith("/student/onboarding");
    });

    it("pauses a throttled child, on the PIN screen (D154)", async () => {
      entrySetPin.mockRejectedValue(refused(429, "too_many_attempts"));
      await matchCleared();
      await chooseNewPin();

      expect(
        screen.getByText("Let's wait a little before trying again."),
      ).toBeInTheDocument();
      expect(push).not.toHaveBeenCalled();
    });

    it("keeps the PIN and says it did not save, for anything else", async () => {
      entrySetPin.mockRejectedValue(new ApiError(500, "down"));
      await matchCleared();
      await chooseNewPin();

      expect(
        screen.getByText("That's on us, not you. Try again."),
      ).toBeInTheDocument();
      expect(push).not.toHaveBeenCalled();
      expect(getSession()).toBeNull();
    });
  });
});

describe("a pair handed back from the end of a first run (B68)", () => {
  afterEach(() => clearEntryHandBack());

  it("opens on 05's miss with the pair as typed, once", () => {
    handEntryBack({ schoolCode: "K7DQ", admissionNumber: "BGA/2031" });
    render(<StudentEntryStep framing="school" />);

    expect(message()).toBe(ENTRY_NO_MATCH_COPY);
    expect(cells().map((c) => c.value).join("")).toBe("K7DQ");
    expect(idField().value).toBe("BGA/2031");
    expect(continueButton()).toHaveTextContent("Try again");
    // Spent: the next visit to 05 starts empty.
    expect(peekEntryHandBack()).toBeNull();
  });

  it("opens empty when nothing was handed back", () => {
    render(<StudentEntryStep framing="school" />);

    expect(message()).toBe("");
    expect(idField().value).toBe("");
    expect(continueButton()).toHaveTextContent("Continue");
  });
});

describe("05 Entry - where the keyboard is typing", () => {
  it("lets every field show focus, never suppressing the outline", () => {
    // The four cells and the ID field all set `outline-none`, so nothing but
    // a caret said which one the keyboard was typing into.
    render(<StudentEntryStep framing="school" />);

    for (const el of [...cells(), idField()])
      expect(el.className).not.toMatch(/(^| )outline-(none|hidden|0)( |$)/);
  });
});

/*
 * A SESSION ENDING TAKES THE ONBOARDING DRAFT (19 Oct browser-storage audit),
 * but not from a child on 05 right now: the last child's session lapsing
 * under them, or their own new PIN replacing it, must leave what 05 matched.
 */
describe("the onboarding draft while 05 is open", () => {
  it("is not taken by a session ending under it, and is once 05 has closed", () => {
    render(<StudentEntryStep framing="school" />);
    startOnboardingDraft({
      schoolCode: "K7DQ",
      admissionNumber: "BGA/2031",
      name: "Amara",
      consent: "given",
    });

    forgetOnboardingDraft();
    expect(getOnboardingDraft()).toMatchObject({
      schoolCode: "K7DQ",
      consent: "given",
    });

    cleanup();
    forgetOnboardingDraft();
    expect(getOnboardingDraft()).toEqual({});
  });
});
