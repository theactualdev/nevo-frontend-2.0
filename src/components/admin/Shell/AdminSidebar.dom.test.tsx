import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { AdminSidebar } from "./AdminSidebar";
import { SAMPLE_ATTR } from "@/lib/sampleData";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * The sidebar's signed-out persona is a FIXTURE - "Mrs. Adebayo" is nobody -
 * and this is the identity block, so a fallback here means the console is
 * showing an invented person to a real one.
 *
 * The end-to-end suite's whole value is one assertion: no sample mark anywhere
 * once signed in. An UNMARKED fallback is invisible to it, so the test walks
 * past reporting success. That is worse than having no test, which is why the
 * mark is asserted here at the component level too rather than trusted to a
 * suite that does not exist yet.
 */

vi.mock("next/navigation", () => ({ usePathname: () => "/admin/dashboard" }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    scopes: ["oversight"],
    resolved: true,
    status: "ready",
    refresh: vi.fn(),
    hasScope: () => true,
  }),
}));
vi.mock("@/lib/api", () => ({
  notificationsApi: { unreadExists: async () => ({ unreadExists: false }) },
}));

/*
 * THESE TESTS RUN ON THE DESKTOP RAIL, and say so.
 *
 * The rail collapses below 1280px, and `vitest.setup.ts` supplies a
 * `matchMedia` that answers `matches: false` to everything - so without this
 * every DOM test silently renders the TABLET rail, where the identity block is
 * initials and the persona's name never appears. The assertions below are
 * about that name, so the viewport has to be stated rather than inherited.
 */
let wide = true;
beforeEach(() => {
  wide = true;
  window.matchMedia = ((query: string) =>
    ({
      matches: wide,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
});

const marks = (c: HTMLElement) =>
  Array.from(c.querySelectorAll(`[${SAMPLE_ATTR}]`)).map((el) =>
    el.getAttribute(SAMPLE_ATTR),
  );

beforeEach(() => clearSession());

describe("AdminSidebar sample marking", () => {
  it("marks the fixture persona when nobody is signed in", () => {
    const { container } = render(<AdminSidebar />);
    expect(container.textContent).toMatch(/Mrs\. Adebayo/);
    expect(marks(container)).toContain("admin:sidebar-identity");
  });

  it("shows no fixture, and no mark, once signed in", () => {
    setSession({
      token: "tok",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      userId: "a1",
      role: "senco_admin",
    });
    const { container } = render(<AdminSidebar />);
    expect(container.textContent).not.toMatch(/Mrs\. Adebayo/);
    // The assertion the E2E will make across the whole page.
    expect(marks(container)).toHaveLength(0);
    // The signed-in branch was restructured to lift the fixture out; it must
    // still say what the real admin's scopes are rather than nothing at all.
    expect(container.textContent).toMatch(/oversight|General oversight/i);
  });
});

/**
 * The rail follows the viewport, which `AdminShell`'s docblock had claimed
 * since it was written while nothing implemented it. Every admin frame is
 * drawn at 1024 with a 64px rail, so the content columns were laid out against
 * 960px and given 776px.
 */
describe("the rail and the viewport", () => {
  it("opens expanded on a desktop viewport", () => {
    const { container } = render(<AdminSidebar />);
    expect(container.querySelector("aside")?.className).toMatch(/w-\[248px\]/);
    // The wordmark, not the icon.
    expect(container.querySelector("img")?.getAttribute("src")).toMatch(
      /logo-wordmark-purple/,
    );
  });

  it("opens collapsed on a tablet viewport", () => {
    wide = false;
    const { container } = render(<AdminSidebar />);
    expect(container.querySelector("aside")?.className).toMatch(/w-16/);
    expect(container.querySelector("img")?.getAttribute("src")).toMatch(
      /logo-icon-purple/,
    );
  });

  it("carries the real brand mark at both widths, never a substitute", () => {
    for (const w of [true, false]) {
      wide = w;
      const { container } = render(<AdminSidebar />);
      const src = container.querySelector("img")?.getAttribute("src") ?? "";
      expect(src.startsWith("/brand/")).toBe(true);
    }
  });
});

/**
 * SCRUM-347: the rail asks the question the `xl:` classes ask, in their unit
 * (as the teacher rail does since fbececfc). Tailwind 4's `xl` is `80rem`;
 * asked as `1280px`, a browser with larger text drew the wide rail beside a
 * page still laid out for a tablet.
 */
describe("the width the rail widens at", () => {
  it("is the xl breakpoint, in rem", () => {
    const asked: string[] = [];
    const base = window.matchMedia;
    window.matchMedia = ((q: string) => {
      asked.push(q);
      return base(q);
    }) as typeof window.matchMedia;
    render(<AdminSidebar />);
    expect(asked).toContain("(min-width: 80rem)");
    expect(asked).not.toContain("(min-width: 1280px)");
  });
});
