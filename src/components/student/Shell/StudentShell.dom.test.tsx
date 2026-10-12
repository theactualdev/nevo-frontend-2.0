import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StudentShell, fillsScreen, scalesWithTextSize } from "./StudentShell";
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

  it("stays off Profile, the one tab the app shell frame draws without it", () => {
    // `Nevo Student App`: `showAskFab: TABS.includes(v) && v !== "profile"`.
    at("/student/profile");
    expect(screen.queryByTestId("ask-nevo")).toBeNull();
  });

  it("is still on the other tabs beside Profile", () => {
    // The exclusion is the tab, not everything that starts with its name.
    at("/student/connect");
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
   * it and ask Ask Nevo a question before anyone had consented.
   */
  it("shows no navigation, bell or Ask Nevo around the waiting screen", () => {
    at("/student/waiting");

    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("button", { name: "Notifications" })).toBeNull();
    expect(screen.queryByTestId("ask-nevo")).toBeNull();
    expect(screen.getByText("lesson body")).toBeTruthy();
  });

  it("is bare on 05 Entry too, which draws the hold in place", () => {
    at("/student/onboarding/school");

    expect(screen.queryByRole("navigation")).toBeNull();
  });
});

describe("scalesWithTextSize — Text Size on the full-screen routes", () => {
  /*
   * The baseline was always exempt: its tasks are sized and timed to measure.
   * The daily warm-up runs the same tasks under the child's zoom, so a reading
   * preference changed tile and dot sizes in a calibration.
   */
  it("leaves the daily warm-up unscaled", () => {
    expect(scalesWithTextSize("/student/warm-up")).toBe(false);
  });

  it("leaves onboarding unscaled, as before", () => {
    expect(scalesWithTextSize("/student/onboarding/sequence")).toBe(false);
  });

  it("still scales the lesson player, where the reading happens", () => {
    expect(scalesWithTextSize("/student/lessons/abc-123")).toBe(true);
  });
});

describe("Connect fills the screen between the chrome", () => {
  /*
   * Connect's `h-full` resolved against an unsized wrapper, so the
   * conversation collapsed to its messages: the composer floated under the
   * last one, below the fold on a long thread, and the header scrolled away.
   * jsdom lays nothing out, so this pins the sized box, and that every other
   * tab still scrolls in `<main>` as it did.
   */
  it("gives Connect a sized box to fill", () => {
    at("/student/connect");
    expect(screen.getByText("lesson body").parentElement).toHaveClass("h-full");
  });

  it("leaves the other tabs to scroll in <main>", () => {
    for (const path of [
      "/student/dashboard",
      "/student/lessons",
      "/student/progress",
      "/student/downloads",
    ]) {
      const { unmount } = at(path);
      const box = screen.getByText("lesson body").parentElement;
      expect(box).not.toHaveClass("h-full");
      // A column at least the screen's height, for an empty state to centre
      // in - which a tab that does not grow into it never notices.
      expect(box).toHaveClass("flex", "min-h-full", "flex-col");
      unmount();
    }
  });

  it("is Connect and only Connect", () => {
    expect(fillsScreen("/student/connect")).toBe(true);
    expect(fillsScreen("/student/connections")).toBe(false);
    expect(fillsScreen("/student/dashboard")).toBe(false);
  });
});

describe("a tab's docked keyboard", () => {
  /*
   * The Ask Nevo launcher is `fixed` over the bottom of the screen, which is
   * where a docked keyboard sits, so it covered the keys. It steps aside the
   * way the bottom nav does, and the content region drops the padding that
   * cleared it, so the keyboard reaches the floor.
   */
  it("takes the Ask Nevo launcher out of the way", () => {
    at("/student/connect");
    expect(screen.getByTestId("ask-nevo").parentElement).toHaveClass(
      "not-pointer-fine:group-has-[[data-nevo-hide-nav]]/shell:invisible",
    );
  });

  it("lets the content region reach the floor", () => {
    at("/student/connect");
    expect(screen.getByRole("main")).toHaveClass(
      "not-pointer-fine:group-has-[[data-nevo-hide-nav]]/shell:pb-0",
    );
  });
});

describe("the sidebar's collapse row (Nevo Sidebar Rail)", () => {
  /*
   * The rail draws a 44px row the rail's width, with "Collapse" beside the
   * chevron while it is open. Ours was the chevron alone: 20 wide and 40 high
   * on the collapsed rail. jsdom lays nothing out, so the classes are pinned.
   */
  it("is a full-width 44px row, labelled Collapse while open", () => {
    at("/student/dashboard");

    // jsdom has no wide screen, so the rail starts collapsed.
    const expand = screen.getByRole("button", { name: "Expand sidebar" });
    expect(expand).toHaveClass("h-11", "w-full");
    expect(expand).not.toHaveTextContent("Collapse");

    fireEvent.click(expand);

    const collapse = screen.getByRole("button", { name: "Collapse sidebar" });
    expect(collapse).toHaveClass("h-11", "w-full");
    expect(collapse).toHaveTextContent("Collapse");
  });
});

describe("the student console's focus ring", () => {
  /*
   * Every element had the browser's ring in `--ring` at half strength, a 1px
   * grey that all but vanished on cream. The student console draws a 2px navy
   * outline instead, scoped by `data-nevo-console="student"` so the teacher
   * and admin consoles keep theirs. jsdom applies no CSS, so the scope is
   * pinned here and the rule is read from the stylesheet.
   */
  it("is scoped to every student route, tab or full-screen", () => {
    for (const path of [
      "/student/dashboard",
      "/student/connect",
      "/student/lessons/abc-123",
      "/student/onboarding/sequence",
    ]) {
      const { unmount } = at(path);
      expect(
        screen.getByText("lesson body").closest('[data-nevo-console="student"]'),
      ).not.toBeNull();
      unmount();
    }
  });

  it("is a 2px navy outline in the base layer, which any component's own focus style beats", () => {
    const css = readFileSync(
      join(process.cwd(), "src", "app", "globals.css"),
      "utf8",
    );
    const base = css.slice(css.indexOf("@layer base {"));
    const rule =
      /\[data-nevo-console="student"\] :focus-visible \{([^}]*)\}/.exec(base);
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/outline:\s*2px solid var\(--color-nevo-navy\)/);
    expect(rule![1]).toMatch(/outline-offset:\s*2px/);
    // Inside the base layer's own braces, not after them.
    const layerEnd = base.search(/^}/m);
    expect(base.indexOf('[data-nevo-console="student"]')).toBeLessThan(layerEnd);
  });

  it("takes over the shared Button's pale ring, unlayered so it beats the button's utilities", () => {
    /*
     * `Button` sets `outline-none` and a 3px ring at 35% navy, and a utility
     * beats the base layer - so buttons kept the pale ring beside the navy
     * outline on fields. This rule has to sit outside every layer to win.
     */
    const css = readFileSync(
      join(process.cwd(), "src", "app", "globals.css"),
      "utf8",
    );
    const selector =
      '[data-nevo-console="student"] [data-slot="button"]:focus-visible';
    const at = css.indexOf(selector);
    expect(at).toBeGreaterThan(-1);
    const body = css.slice(css.indexOf("{", at) + 1, css.indexOf("}", at));
    expect(body).toMatch(/outline:\s*2px solid var\(--color-nevo-navy\)/);
    expect(body).toMatch(/outline-offset:\s*2px/);
    // The pale ring is dropped, not drawn alongside.
    expect(body).toMatch(/--tw-ring-shadow:\s*0 0 #0000/);
    // Unlayered: no brace is open around it once comments are set aside.
    const before = css.slice(0, at).replace(/\/\*[\s\S]*?\*\//g, "");
    const depth =
      (before.match(/{/g) ?? []).length - (before.match(/}/g) ?? []).length;
    expect(depth).toBe(0);
  });
});
