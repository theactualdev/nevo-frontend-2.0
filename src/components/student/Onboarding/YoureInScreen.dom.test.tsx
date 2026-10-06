import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { YoureInScreen } from "./YoureInScreen";

/**
 * "You're all set" was not always true.
 *
 * A child who joins by invite link finishes onboarding with a real account and
 * no school code — the join endpoints return a `schoolName` and never a code —
 * so `rememberOnboardedStudent` refuses to remember the device. That refusal is
 * correct: a remembered profile the server cannot authenticate is worse than
 * none, because it turns a child who has no way in into a child who believes
 * they are locked out.
 *
 * But the caller discarded the answer, so the refusal was silent. This screen
 * told the child they were all set, and the next morning the same tablet had
 * never heard of them — with no school code to sign back in with, and nobody
 * having told them or their teacher.
 *
 * The tests below are about which children are told what, and about the pacing,
 * because an extra line a child cannot finish reading is not an improvement.
 */

const THE_HONEST_LINE = /ask your teacher to help you sign in/i;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("YoureInScreen", () => {
  it("celebrates, and says nothing else, when the device knows the child", () => {
    // The overwhelmingly common path: school code or class code. Adding a
    // caveat here would worry a child about a problem they do not have.
    render(<YoureInScreen onDone={() => {}} deviceRemembered />);

    expect(screen.getByText(/You’re all set/)).toBeVisible();
    expect(screen.queryByText(THE_HONEST_LINE)).toBeNull();
  });

  it("tells a child whose device cannot remember them", () => {
    render(<YoureInScreen onDone={() => {}} deviceRemembered={false} />);

    expect(screen.getByText(THE_HONEST_LINE)).toBeVisible();
  });

  it("still celebrates — the account is real, only the return trip is not", () => {
    // They did the work and they have an account. The caveat sits under the
    // celebration; it does not replace it.
    render(<YoureInScreen onDone={() => {}} deviceRemembered={false} />);

    expect(screen.getByText(/You’re all set/)).toBeVisible();
  });

  it("points at a person, not at a procedure", () => {
    // Nothing here is a child's to fix. Their teacher has both the school code
    // and their username; the child has neither and cannot get them.
    render(<YoureInScreen onDone={() => {}} deviceRemembered={false} />);

    const body = document.body.textContent ?? "";
    expect(body).toMatch(/teacher/i);
    for (const jargon of ["school code", "username", "identifier", "error"]) {
      expect(body.toLowerCase()).not.toContain(jargon);
    }
  });

  it("holds long enough to read the extra line", () => {
    // 2400ms is paced for six words. A child reading that they will need help
    // next time gets the time to read it — for a SEND learner that is not a
    // rounding error.
    const onDone = vi.fn();
    render(<YoureInScreen onDone={onDone} deviceRemembered={false} />);

    act(() => void vi.advanceTimersByTime(2400));
    expect(onDone).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(2600));
    expect(onDone).toHaveBeenCalled();
  });

  it("does not slow the ordinary path down", () => {
    const onDone = vi.fn();
    render(<YoureInScreen onDone={onDone} deviceRemembered />);

    act(() => void vi.advanceTimersByTime(2400));

    expect(onDone).toHaveBeenCalled();
  });

  it("assumes the device is fine when nobody says otherwise", () => {
    // The prop defaults to true, so an existing caller that has not been
    // updated cannot accidentally start warning every child.
    const onDone = vi.fn();
    render(<YoureInScreen onDone={onDone} />);

    expect(screen.queryByText(THE_HONEST_LINE)).toBeNull();
    act(() => void vi.advanceTimersByTime(2400));
    expect(onDone).toHaveBeenCalled();
  });
});

describe("the hold, as the engine is told it", () => {
  it("is one system_busy, sent as the screen goes, with how long it held", () => {
    /*
     * The catalogue's `{ reason, durationMs }`, so the stillness on this
     * screen is never read as hesitation. It went up as a start and an end,
     * each `{ reason, phase }` - two events and no length on either.
     */
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const track = vi.fn();
    const { unmount } = render(
      <YoureInScreen onDone={() => {}} track={track} />,
    );
    expect(track).not.toHaveBeenCalled();

    now = 2_400;
    unmount();

    expect(track.mock.calls).toEqual([
      ["system_busy", { reason: "transition_screen", durationMs: 2_400 }],
    ]);
  });
});
