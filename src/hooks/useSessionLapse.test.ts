import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSessionLapse } from "./useSessionLapse";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * A session that runs out mid-lesson used to be completely silent.
 *
 * `getSession()` clears itself at `expiresAt`, so from that moment
 * `useLessonProgress.report()` returns at its `!getToken()` guard and every
 * position the child reaches is discarded. Nothing 401s, because with no token
 * we stop making requests - so the 401-driven redirect never fires. The route
 * guard would catch them, but only on a navigation, and a child reading one
 * segment does not navigate.
 *
 * The half of this that can be WRONG is not "does it redirect" - it is "does it
 * redirect the right person". A deliberate sign-out also clears the session,
 * and telling that child their session expired would be both false and
 * alarming. So the tests below are mostly about the cases that must stay quiet.
 */

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn() }),
}));

const MINUTE = 60 * 1000;

const signIn = (overrides: Partial<Parameters<typeof setSession>[0]> = {}) =>
  setSession({
    token: "tok-test",
    expiresAt: new Date(Date.now() + 30 * MINUTE).toISOString(),
    userId: "student-1",
    role: "student",
    ...overrides,
  });

beforeEach(() => {
  vi.useFakeTimers();
  replace.mockReset();
  clearSession();
});

afterEach(() => {
  vi.useRealTimers();
  clearSession();
});

describe("useSessionLapse", () => {
  it("sends a child to their door when the session runs out under them", async () => {
    signIn();
    renderHook(() => useSessionLapse());
    // Nothing yet: the session is alive and the child is working.
    expect(replace).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(30 * MINUTE + 1000);

    expect(replace).toHaveBeenCalledWith("/auth/session-expired");
  });

  it("does not wait for a re-render to notice", async () => {
    // The regression this hook exists for. `useHasSession` re-reads its
    // snapshot every render, so the flip does land in place - but only once
    // something else re-renders, and on a still screen nothing does. The
    // `renderHook` result is never re-rendered here, deliberately.
    signIn();
    renderHook(() => useSessionLapse());

    await vi.advanceTimersByTimeAsync(30 * MINUTE + 1000);

    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("stays quiet when a child signs out on purpose", async () => {
    // Sign-out clears the session BEFORE its expiry and navigates itself.
    signIn();
    const { rerender } = renderHook(() => useSessionLapse());

    clearSession();
    rerender();
    await vi.advanceTimersByTimeAsync(MINUTE);

    expect(replace).not.toHaveBeenCalled();
  });

  it("stays quiet for someone who was never signed in", async () => {
    // The designed walkthrough, and a child partway through onboarding who has
    // no account yet. Neither has lost anything to say sorry about.
    renderHook(() => useSessionLapse());

    await vi.advanceTimersByTimeAsync(60 * MINUTE);

    expect(replace).not.toHaveBeenCalled();
  });

  it("re-arms when a refresh extends the session", async () => {
    // `useSessionRefresh` renews in place, so the instant we armed for stops
    // being the expiry. Arming once would fire early, find a live session, and
    // then never look again.
    signIn();
    renderHook(() => useSessionLapse());

    await vi.advanceTimersByTimeAsync(29 * MINUTE);
    signIn({ expiresAt: new Date(Date.now() + 30 * MINUTE).toISOString() });
    await vi.advanceTimersByTimeAsync(2 * MINUTE);
    // Past the original expiry, and the child is still working.
    expect(replace).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(29 * MINUTE + 1000);
    expect(replace).toHaveBeenCalledWith("/auth/session-expired");
  });

  it("checks again when a slept device comes back", async () => {
    // A closed lid does not fire timers. The child opens it an hour later to a
    // session that died forty minutes ago.
    signIn();
    renderHook(() => useSessionLapse());

    vi.setSystemTime(Date.now() + 70 * MINUTE);
    document.dispatchEvent(new Event("visibilitychange"));

    expect(replace).toHaveBeenCalledWith("/auth/session-expired");
  });

  it("sends a teacher to the teacher door, not the child's", async () => {
    // The shell this mounts in is the student one, but the hook takes the role
    // from the session rather than assuming - the same mistake `#?` fixed in
    // `handleAuthFailure`, where a race sent teachers to the child's screen.
    signIn({ role: "teacher" });
    renderHook(() => useSessionLapse());

    await vi.advanceTimersByTimeAsync(30 * MINUTE + 1000);

    expect(replace).toHaveBeenCalledWith("/auth/teacher/session-expired");
  });

  it("remembers the lesson they were in, so signing back in returns them to it", async () => {
    // IA 31: "lesson position preserved". The door used to carry nothing, so a
    // lapse mid-lesson signed the child back in to Home. `pushState` moves
    // jsdom's address without redefining `window.location`.
    window.history.pushState({}, "", "/student/lessons/frac-3");
    signIn();
    renderHook(() => useSessionLapse());

    await vi.advanceTimersByTimeAsync(30 * MINUTE + 1000);

    expect(replace).toHaveBeenCalledWith(
      "/auth/session-expired?next=%2Fstudent%2Flessons%2Ffrac-3",
    );
    window.history.pushState({}, "", "/");
  });

  it("leaves a child alone when the expiry is unreadable", async () => {
    // A malformed date gives us no instant to arm for. The session is present
    // and readable nonsense is not grounds for evicting someone mid-lesson.
    signIn({ expiresAt: "not-a-date" });
    renderHook(() => useSessionLapse());

    await vi.advanceTimersByTimeAsync(60 * MINUTE);

    expect(replace).not.toHaveBeenCalled();
  });
});
