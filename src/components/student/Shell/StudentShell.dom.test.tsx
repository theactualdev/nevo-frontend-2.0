import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { StudentShell } from "./StudentShell";
import { clearSession, setSession } from "@/lib/auth/session";
import { AccessibilityProvider } from "@/context/AccessibilityContext";

/**
 * WHICH SURFACES CAN A CHILD ASK FOR HELP FROM.
 *
 * Frame 26 governs Ask Nevo: "always reachable, never interruptive". It was
 * mounted below the shell's full-screen early return, so it appeared on every
 * tab and was absent from the lesson player - the one screen where a child gets
 * stuck. This pins both halves, because the exclusions are as deliberate as the
 * inclusion and a later reader would otherwise be right to "fix" them:
 *
 * - the daily warm-up is a CALIBRATED baseline activity, and offering help
 *   inside it would contaminate what it measures
 * - onboarding has no lesson to ask about and no session to ask with
 */

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => router,
}));
// Real everywhere except the one question a fresh page load answers.
const lost = vi.hoisted(() => ({ value: false }));
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  arrivedWithoutSession: () => lost.value,
}));
// Ask Nevo itself is heavy (sheet, keyboard, signals); this is about WHERE the
// shell mounts it, not what it renders.
vi.mock("@/components/student/AskNevo/AskNevo", () => ({
  AskNevo: () => <div data-testid="ask-nevo" />,
}));
vi.mock("@/hooks", () => ({
  useBehaviouralCapture: vi.fn(),
  // The in-shell tabs render the notification bell; it reads the network and
  // decides nothing about where Ask Nevo goes.
  useNotifications: () => ({
    notifications: [],
    unreadCount: 0,
    failed: false,
  }),
}));
vi.mock("@/hooks/useSessionRefresh", () => ({ useSessionRefresh: vi.fn() }));

let pathname = "/student/dashboard";

const signIn = () =>
  setSession({
    token: "tok-test",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId: "student-1",
    role: "student",
  });

const at = (path: string) => {
  pathname = path;
  return render(
    <AccessibilityProvider>
      <StudentShell>
        <p>lesson body</p>
      </StudentShell>
    </AccessibilityProvider>,
  );
};

beforeEach(() => {
  clearSession();
  signIn();
  router.replace.mockClear();
  lost.value = false;
});

afterEach(() => {
  cleanup();
  clearSession();
});

describe("StudentShell — where Ask Nevo is reachable", () => {
  /*
   * THE SHELL NO LONGER RENDERS IT ON A LESSON ROUTE, as of 21 Sep, and these
   * two cases moved rather than disappeared.
   *
   * As a sibling of `{children}` the shell's copy sat OUTSIDE the lesson
   * route's `LessonProvider`, so the lesson id Ask Nevo already reads and
   * already sends resolved to null - every question asked from inside a lesson
   * arrived unattached to one. It is rendered by the lesson layout now, and
   * `app/student/lessons/[lessonId]/LessonAskNevo.dom.test.tsx` covers both
   * that it appears there and that the id survives.
   *
   * What is asserted here is the half this file still owns: the shell stays
   * out of the way on those routes.
   */
  it("leaves the lesson player to the layout that scopes it", () => {
    at("/student/lessons/abc-123");
    expect(screen.queryByTestId("ask-nevo")).toBeNull();
  });

  it("leaves the review session to it too, which reuses the player", () => {
    at("/student/lessons/abc-123/review-session");
    expect(screen.queryByTestId("ask-nevo")).toBeNull();
  });

  it("is reachable from the ordinary tabs", () => {
    at("/student/dashboard");
    expect(screen.getByTestId("ask-nevo")).toBeTruthy();
  });

  it("stays out of the daily warm-up, which is a measurement", () => {
    at("/student/warm-up");
    expect(screen.queryByTestId("ask-nevo")).toBeNull();
  });

  it("stays out of onboarding, where there is no lesson and no session", () => {
    at("/student/onboarding/sequence");
    expect(screen.queryByTestId("ask-nevo")).toBeNull();
  });

  it("keeps the lesson player free of the sidebar and bottom nav", () => {
    at("/student/lessons/abc-123");
    // The player is immersive: Ask Nevo joins it, chrome does not.
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.getByText("lesson body")).toBeTruthy();
  });
});

describe("the way into Profile", () => {
  it("is the child's own disc, in the top bar and the sidebar", () => {
    /*
     * The top-bar avatar was an inert `span`, and so was the sidebar's user
     * row - the one row `Nevo Sidebar Rail` draws AS the Profile link. Both
     * looked like a way into a profile and answered a tap with nothing.
     */
    at("/student/dashboard");

    const links = screen.getAllByRole("link", { name: "Profile" });

    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/student/profile");
    }
  });

  it("is not a tab: the nav carries the frames' five and no more", () => {
    // `Nevo Bottom Nav` and `Nevo Sidebar Rail` draw Home, Lessons, Progress,
    // Downloads and Connect. A sixth "Profile" tab sat beside the disc that
    // already led there.
    at("/student/dashboard");

    const navs = screen.getAllByRole("navigation");
    // The sidebar and the bottom nav.
    expect(navs).toHaveLength(2);
    for (const nav of navs) {
      // Every link but the disc's (which is labelled, not a tab).
      const tabs = Array.from(nav.querySelectorAll("a"))
        .filter((a) => a.getAttribute("aria-label") !== "Profile")
        .map((a) => a.getAttribute("href"));
      expect(tabs).toEqual([
        "/student/dashboard",
        "/student/lessons",
        "/student/progress",
        "/student/downloads",
        "/student/connect",
      ]);
    }
  });

  it("marks the sidebar's disc as where the child is, on Profile", () => {
    at("/student/profile");

    const current = screen
      .getAllByRole("link", { name: "Profile" })
      .filter((link) => link.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    // And no tab claims to be the page instead.
    for (const nav of screen.getAllByRole("navigation")) {
      const tabsCurrent = Array.from(
        nav.querySelectorAll('a[aria-current="page"]'),
      ).filter((a) => a.getAttribute("aria-label") !== "Profile");
      expect(tabsCurrent).toHaveLength(0);
    }
  });
});

describe("a page that loaded on a cookie whose session was gone", () => {
  /*
   * The guard let it through on the cookie, so the server sent the signed-out
   * walkthrough - another child's name, another child's lessons - to a child
   * who believed they were signed in. The shell sends them to the door.
   */
  it("goes to the PIN door, and back to this screen after", () => {
    clearSession();
    lost.value = true;
    at("/student/lessons");

    expect(router.replace).toHaveBeenCalledWith(
      "/auth/login?next=%2Fstudent%2Flessons",
    );
  });

  it("stays put on an ordinary load", () => {
    at("/student/lessons");

    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe("the consent hold", () => {
  /*
   * A HOLD IS NOT A TAB. The waiting screen rendered inside the full app, so
   * a child the server said may not proceed could tap the nav straight past
   * it and ask Ask Nevo a question before anyone had consented - and every
   * tap was captured while they waited.
   */
  it("shows no navigation, bell or Ask Nevo around the waiting screen", () => {
    at("/student/waiting");

    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("button", { name: "Notifications" })).toBeNull();
    expect(screen.queryByTestId("ask-nevo")).toBeNull();
    expect(screen.getByText("lesson body")).toBeTruthy();
  });

  it("is bare on the school-link door too, which can end on the hold", () => {
    at("/student/entry/tok-1");

    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("captures nothing while the child waits", async () => {
    const { useBehaviouralCapture } = await import("@/hooks");
    vi.mocked(useBehaviouralCapture).mockClear();

    at("/student/waiting");

    expect(vi.mocked(useBehaviouralCapture)).toHaveBeenCalled();
    expect(
      vi.mocked(useBehaviouralCapture).mock.calls.every(([on]) => on === false),
    ).toBe(true);
  });

  it("still captures on an ordinary tab", async () => {
    const { useBehaviouralCapture } = await import("@/hooks");
    vi.mocked(useBehaviouralCapture).mockClear();

    at("/student/dashboard");

    expect(vi.mocked(useBehaviouralCapture)).toHaveBeenCalledWith(true);
  });
});
