import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GHOST_BTN, PRIMARY_BTN, TEXT_ACTION } from "./primitives";

/**
 * D14 Interaction States - "the single source of truth for button and control
 * behaviour". The admin console had no focus ring on buttons, pills, icon
 * buttons or toggles, fields showed focus by a border colour alone, and
 * neither button kind had a pressed state.
 *
 * jsdom cannot evaluate `:focus-visible` against a stylesheet, so the ring is
 * pinned at the source: the rule exists, carries D14's values, is scoped to
 * this console, and the admin layout both loads it and provides the scope.
 */

const root = process.cwd();
const css = readFileSync(join(root, "src/app/admin/admin.css"), "utf8");
const layout = readFileSync(join(root, "src/app/admin/layout.tsx"), "utf8");

describe("D14's focus ring", () => {
  it("is D14's cream-then-violet ring, on keyboard focus", () => {
    expect(css).toMatch(/:focus-visible\s*\{[^}]*0 0 0 3px #f7f1e6,\s*0 0 0 5px #9a9ccb/);
  });

  it("gives fields D14's navy border and violet halo", () => {
    expect(css).toMatch(/border-color:\s*#3b3f6e;\s*box-shadow:\s*0 0 0 3px rgba\(154, 156, 203, 0\.35\)/);
  });

  it("is scoped to the admin console, never the student or teacher ones", () => {
    const selectors = css
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("}")
      .map((block) => block.split("{")[0].trim())
      .filter(Boolean);
    expect(selectors.length).toBeGreaterThan(0);
    for (const s of selectors) expect(s.startsWith('[data-console="admin"]')).toBe(true);
  });

  it("is loaded by the admin layout, which provides the scope", () => {
    expect(layout).toMatch(/import "\.\/admin\.css";/);
    expect(layout).toMatch(/data-console="admin"/);
  });
});

describe("D14's pressed and disabled states", () => {
  it("presses the primary button down and darker", () => {
    expect(PRIMARY_BTN).toMatch(/active:translate-y-px/);
    expect(PRIMARY_BTN).toMatch(/active:brightness-90/);
  });

  it("presses the ghost button down and filled", () => {
    expect(GHOST_BTN).toMatch(/active:translate-y-px/);
    expect(GHOST_BTN).toMatch(/active:bg-\[#e5dfd3\]/);
  });

  it("disables both at D14's 40%, and a disabled one never moves", () => {
    for (const btn of [PRIMARY_BTN, GHOST_BTN]) {
      expect(btn).toMatch(/disabled:opacity-40/);
      expect(btn).toMatch(/disabled:active:translate-y-0/);
    }
  });

  it("gives the text action a pressed state too", () => {
    expect(TEXT_ACTION).toMatch(/active:opacity-60/);
  });
});
