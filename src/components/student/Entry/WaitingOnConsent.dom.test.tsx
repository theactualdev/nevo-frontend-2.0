import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  WAITING_WAY_BACK,
  WaitingOnConsent,
  WaitingOnConsentPage,
} from "./WaitingOnConsent";
import { clearSession, setSession } from "@/lib/auth/session";

const { signOut, replace, studentDestination } = vi.hoisted(() => ({
  signOut: vi.fn(),
  replace: vi.fn(),
  studentDestination: vi.fn(),
}));
vi.mock("@/hooks", () => ({ useAuth: () => ({ signOut }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}));
vi.mock("@/lib/auth/entryGate", () => ({
  studentDestination,
  UNCHECKED_ROUTE: "/student/unchecked",
}));

/**
 * MOST OF WHAT MATTERS HERE IS STILL ABSENCES.
 *
 * This screen replaced a consent gate that polled: "no countdown, no door
 * held shut." Design's 28 Oct frame (5bb9ee2) gives it one way forward - a
 * Check again the CHILD presses - and takes away "It will be soon", a promise
 * nobody can keep. A timer, a status line or a polling re-check would still
 * re-create the screen it replaced, so those absences stay pinned.
 */

const LINE =
  "We are waiting for your school to confirm. You can check again, or ask your teacher.";

afterEach(() => {
  cleanup();
  clearSession();
  signOut.mockReset();
  replace.mockReset();
  studentDestination.mockReset();
});

describe("what it says", () => {
  it("says Nevo is waiting for the school, and never that it will be soon", () => {
    render(<WaitingOnConsent />);

    expect(
      screen.getByRole("heading", { name: /isn't quite ready for you yet/i }),
    ).toBeTruthy();
    expect(screen.getByText(LINE)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/soon/i);
  });

  it("says nothing else at all", () => {
    // The wordmark is an image with alt text, so it is counted deliberately.
    render(<WaitingOnConsent />);

    const text = (document.body.textContent ?? "").replace(/\s+/g, " ").trim();

    // No space between the two: `textContent` concatenates block elements
    // without one, so this is the heading and the line and nothing besides.
    expect(text).toBe(`Nevo isn't quite ready for you yet${LINE}`);
  });
});

/**
 * D189 (13 Oct): "Waiting on consent is a genuine dead end and gets fixed ...
 * give it Back, same as the age-check hold. On a shared tablet one child
 * waiting on consent currently holds the device hostage for everyone else
 * until the app is restarted. Back goes to the device picker."
 */
describe("its way back", () => {
  it("is the age-check hold's Back", () => {
    render(<WaitingOnConsent />);

    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Back" }).className).toContain(
      "size-11",
    );
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("goes to the device picker", () => {
    expect(WAITING_WAY_BACK).toBe("/auth/login");
  });

  it("signs a child sent here from a door out first, so the picker is not bounced back here", () => {
    setSession({
      token: "tok",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      userId: "student-1",
      role: "student",
    });
    render(<WaitingOnConsent />);

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("has nobody to sign out for a child held in place on 05 Entry", () => {
    render(<WaitingOnConsent />);

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(signOut).not.toHaveBeenCalled();
  });
});

/*
 * Design 5bb9ee2, 28 Oct: "Check again re-checks (if consent has arrived it
 * goes straight to the assessment) ... never a dead end."
 */
describe("Check again", () => {
  it("is the one way forward, under the line, where the caller can re-check", () => {
    render(
      <WaitingOnConsent onCheckAgain={vi.fn().mockResolvedValue(undefined)} />,
    );

    const check = screen.getByRole("button", { name: "Check again" });
    expect(check.className).toContain("bg-nevo-navy");
    expect(
      screen
        .getAllByRole("button")
        .map((b) => b.getAttribute("aria-label") ?? b.textContent),
    ).toEqual(["Back", "Check again"]);
  });

  it("re-checks once per press, and not again while one is out", async () => {
    let settle: () => void = () => {};
    const onCheckAgain = vi.fn(
      () => new Promise<void>((resolve) => (settle = resolve)),
    );
    render(<WaitingOnConsent onCheckAgain={onCheckAgain} />);
    const check = screen.getByRole("button", { name: "Check again" });

    fireEvent.click(check);
    fireEvent.click(check);
    expect(onCheckAgain).toHaveBeenCalledTimes(1);

    await act(async () => settle());
    fireEvent.click(check);
    expect(onCheckAgain).toHaveBeenCalledTimes(2);
  });

  it("is not there where the caller has nothing to re-check with", () => {
    render(<WaitingOnConsent />);

    expect(screen.queryByRole("button", { name: "Check again" })).toBeNull();
  });

  it("is never on the age check's hold, where nothing a child does moves it (D121)", () => {
    render(<WaitingOnConsent hold="age-check" onCheckAgain={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Check again" })).toBeNull();
  });
});

describe("Check again, for a child signed in and sent here from a door", () => {
  it("goes where the consent gate now says, once consent has come", async () => {
    studentDestination.mockResolvedValue("/student/dashboard");
    render(<WaitingOnConsentPage />);

    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await act(async () => {});

    expect(studentDestination).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/student/dashboard");
  });

  it("goes to 00e if consent has gone", async () => {
    studentDestination.mockResolvedValue("/student/unavailable");
    render(<WaitingOnConsentPage />);

    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await act(async () => {});

    expect(replace).toHaveBeenCalledWith("/student/unavailable");
  });

  it.each([
    ["still waiting", "/student/waiting"],
    [
      "the read did not answer",
      "/student/unchecked?next=%2Fstudent%2Fdashboard",
    ],
  ])("stays here as it was when %s", async (_, to) => {
    studentDestination.mockResolvedValue(to);
    render(<WaitingOnConsentPage />);

    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await act(async () => {});

    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Check again" })).toBeTruthy();
  });
});

describe("what it deliberately does not do", () => {
  it("offers nothing onward but Check again - no link, no start, no continue", () => {
    render(<WaitingOnConsent onCheckAgain={vi.fn()} />);

    expect(
      screen.queryByRole("button", { name: /continue|try|start/i }),
    ).toBeNull();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("shows no progress, countdown or status", () => {
    render(<WaitingOnConsent onCheckAgain={vi.fn()} />);

    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.body.textContent).not.toMatch(
      /refresh|loading|soon|progress|checking|%/i,
    );
  });

  it("sets no timer and re-checks nothing until the child presses, because the gate it replaced polled", () => {
    /*
     * The decisive one. A re-check on an interval is the single change that
     * would turn this back into the screen design removed, and it would look
     * like an improvement in review.
     */
    const setInterval = vi.spyOn(globalThis, "setInterval");
    const setTimeout = vi.spyOn(globalThis, "setTimeout");
    const onCheckAgain = vi.fn();

    render(<WaitingOnConsent onCheckAgain={onCheckAgain} />);

    expect(setInterval).not.toHaveBeenCalled();
    expect(setTimeout).not.toHaveBeenCalled();
    expect(onCheckAgain).not.toHaveBeenCalled();

    setInterval.mockRestore();
    setTimeout.mockRestore();
  });

  it("fetches nothing on its own - it renders a decision already made", () => {
    // The resolve happens at the entry point; Check again is the child's.
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    render(<WaitingOnConsentPage />);

    expect(studentDestination).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("the breathing mark", () => {
  it("is hidden from assistive technology and stops for reduced motion", () => {
    // Ambient, not a progress indicator: it carries no information, so a
    // screen reader loses nothing and a child who asked for less motion
    // loses nothing either.
    render(<WaitingOnConsent />);

    const mark = document.querySelector("span[aria-hidden='true']");

    expect(mark).toBeTruthy();
    expect(mark?.className).toContain("motion-safe:animate-nevo-breathe");
  });
});

/**
 * A date of birth the school and the parent disagree about (backend, B64), in
 * the Entry frame's "On hold" words (D121, 6 Oct): the words change, and
 * nothing else may.
 */
describe("held at the age check", () => {
  it("says the Entry frame's On hold words, verbatim (D121)", () => {
    render(<WaitingOnConsent hold="age-check" />);

    expect(
      screen.getByRole("heading", {
        name: "Nevo is sorting something out with your school",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "It's nothing you did, and there's nothing for you to fix.",
      ),
    ).toBeTruthy();
  });

  it("names no age, date, record, check or verification, and no timeframe", () => {
    // The frame: "It never names age, dates, records, checks or verification,
    // never blames the school", and "no timeframe, because nobody controls
    // one" - which is what backend's "a day or two" stand-in promised.
    render(<WaitingOnConsent hold="age-check" />);

    expect(document.body.textContent).not.toMatch(
      /birth|\bage\b|date|record|check|verif|parent|day|soon|ask/i,
    );
  });

  it("offers no way onward, polls nothing and fetches nothing, like 00d", () => {
    const setInterval = vi.spyOn(globalThis, "setInterval");
    const setTimeout = vi.spyOn(globalThis, "setTimeout");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    render(<WaitingOnConsent hold="age-check" />);

    // Back, and only Back (D189).
    expect(
      screen.getAllByRole("button").map((b) => b.getAttribute("aria-label")),
    ).toEqual(["Back"]);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryByRole("status")).toBeNull();
    expect(setInterval).not.toHaveBeenCalled();
    expect(setTimeout).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();

    setInterval.mockRestore();
    setTimeout.mockRestore();
    fetchSpy.mockRestore();
  });
});
