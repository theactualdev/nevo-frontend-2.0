import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ usePathname: () => "/teacher/dashboard" }));
vi.mock("@/hooks/useHydrated", () => ({ useHydrated: () => false }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => false }));
vi.mock("@/hooks/useCurrentUser", () => ({ useCurrentUser: () => null }));
vi.mock("@/hooks/useTeacherNotifications", () => ({
  useTeacherNotifications: () => ({
    notes: [],
    unreadCount: 0,
    failed: false,
    markAllRead: vi.fn(),
    markRead: vi.fn(),
    archive: vi.fn(),
    undoArchive: vi.fn(),
    lastArchived: null,
  }),
}));

import { TeacherSidebar } from "./TeacherSidebar";

/**
 * THE RAIL'S FIRST FRAME. It started expanded, so the server markup - and
 * every hard load on a 1024px tablet - drew the 240px desktop rail and then
 * animated it shut once the client measured. The server cannot know the
 * width, so until the client answers, the `xl:` breakpoint decides.
 */

const asideOf = (html: string) => {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host.querySelector("aside")!;
};

const atWidth = (wide: boolean) =>
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: wide,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );

afterEach(() => {
  vi.restoreAllMocks();
});

describe("before the client has measured", () => {
  const aside = () => asideOf(renderToStaticMarkup(<TeacherSidebar />));

  it("is narrow below 1280px and wide from it - decided in CSS, not guessed", () => {
    const cls = aside().className.split(" ");

    expect(cls).toEqual(expect.arrayContaining(["w-16", "px-3", "xl:w-60", "xl:px-4"]));
    expect(cls).not.toContain("w-60");
  });

  it("keeps the tab names, but hides them below 1280px", () => {
    const home = [...aside().querySelectorAll("nav a span")].find(
      (s) => s.textContent === "Home",
    );

    expect(home?.className).toMatch(/(^| )hidden( |$)/);
    expect(home?.className).toContain("xl:inline");
  });

  it("draws the icon crop below 1280px and the wordmark from it", () => {
    const crops = [...aside().querySelectorAll("img")].map((img) => ({
      src: img.getAttribute("src"),
      cls: img.parentElement!.className,
    }));

    expect(crops).toEqual([
      { src: "/brand/logo-wordmark-purple.png", cls: expect.stringMatching(/hidden xl:block/) },
      { src: "/brand/logo-icon-purple.png", cls: expect.stringContaining("xl:hidden") },
    ]);
  });
});

describe("once the client has measured", () => {
  it("takes over at tablet width with the same narrow rail", () => {
    atWidth(false);
    const { container } = render(<TeacherSidebar />);
    const cls = container.querySelector("aside")!.className.split(" ");

    expect(cls).toEqual(expect.arrayContaining(["w-16", "px-3"]));
    expect(cls.some((c) => c.startsWith("xl:"))).toBe(false);
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });

  it("takes over at desktop width with the wide one", () => {
    atWidth(true);
    const { container, getByText } = render(<TeacherSidebar />);
    const cls = container.querySelector("aside")!.className.split(" ");

    expect(cls).toEqual(expect.arrayContaining(["w-60", "px-4"]));
    expect(cls.some((c) => c.startsWith("xl:"))).toBe(false);
    expect(getByText("Home").className).not.toMatch(/(^| )hidden( |$)/);
  });
});
