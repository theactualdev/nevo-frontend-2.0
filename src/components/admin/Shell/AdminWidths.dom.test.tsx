import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { classSelector, compiledCss, styleAt } from "@/test/compiledCss";
import { TOO_NARROW_BODY, TOO_NARROW_HEADING, TooNarrow } from "./TooNarrow";

/**
 * THE ADMIN CONSOLE'S WIDTHS (Lydia, 16 Nov, SCRUM-347).
 *
 *  - Desktop starts at 1280 in EVERY console; 1024-1279 is the wide tablet.
 *    Admin had about sixty `lg:` (1024) switches beside its `xl:` (1280) ones,
 *    so a window from 1024 to 1279 got half of each - the ticket's
 *    "lopsided". None may come back.
 *  - 768 is the floor. Below it the console says plainly it isn't supported.
 *
 * jsdom applies no media query, so what each class DOES at a width is read
 * from the stylesheet as Tailwind compiles it (`compiledCss`).
 */

const root = join(process.cwd(), "src/components/admin");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return p.endsWith(".tsx") && !p.endsWith(".test.tsx") ? [p] : [];
  });
/** Source with comments removed: a docblock may still name `lg:`. */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("no admin screen switches at 1024", () => {
  it("uses no lg: or max-lg: class anywhere", () => {
    const offenders = files(root).filter((p) =>
      /(^|[^\w-])(max-)?lg:/.test(code(readFileSync(p, "utf8"))),
    );
    expect(offenders.map((p) => relative(root, p))).toEqual([]);
  });
});

const SHELL = ["flex", "max-md:hidden"];
const FLOOR = ["flex", "md:hidden"];
/** Shown below 1280 only - e.g. Invitations' card (was `lg:hidden`). */
const TABLET_ONLY = ["xl:hidden"];
/** Shown from 1280 only - e.g. Invitations' column headings (was `max-lg:hidden`). */
const DESKTOP_ONLY = ["max-xl:hidden"];
let css = "";
beforeAll(async () => {
  css = await compiledCss([...new Set([...SHELL, ...FLOOR, ...TABLET_ONLY, ...DESKTOP_ONLY])]);
});
const display = (classes: string[], width: number) =>
  styleAt(css, classes.map(classSelector), { width }).display;

describe("the floor at 768", () => {
  it("hides the console and shows the notice below 768", () => {
    expect(display(SHELL, 767)).toBe("none");
    expect(display(FLOOR, 767)).toBe("flex");
  });

  it("shows the console and hides the notice from 768", () => {
    expect(display(SHELL, 768)).toBe("flex");
    expect(display(FLOOR, 768)).toBe("none");
  });

  it("says plainly that the console isn't supported, and offers nowhere to go", () => {
    const { container } = render(<TooNarrow />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(TOO_NARROW_HEADING);
    expect(container).toHaveTextContent(TOO_NARROW_BODY);
    expect(TOO_NARROW_BODY).toMatch(/isn't supported/);
    expect(container.querySelector("a, button")).toBeNull();
  });
});

describe("the desktop line at 1280", () => {
  it("1279 is still the tablet: the tablet form shows, the desktop form hides", () => {
    expect(display(TABLET_ONLY, 1279)).toBe(undefined);
    expect(display(DESKTOP_ONLY, 1279)).toBe("none");
  });

  it("1280 is desktop", () => {
    expect(display(TABLET_ONLY, 1280)).toBe("none");
    expect(display(DESKTOP_ONLY, 1280)).toBe(undefined);
  });

  it("1024 is the wide tablet, not desktop", () => {
    expect(display(TABLET_ONLY, 1024)).toBe(undefined);
    expect(display(DESKTOP_ONLY, 1024)).toBe("none");
  });
});
