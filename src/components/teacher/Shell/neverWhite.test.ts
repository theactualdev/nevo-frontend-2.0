import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Design's reference (12 Oct): "NEVER white (#ffffff) anywhere." The page
 * under every teacher screen was `--background`, the component library's
 * white, and it showed wherever a screen did not paint its own cream.
 */
const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

describe("the teacher console's canvas", () => {
  it("is cream under anything marked as the teacher console", () => {
    const css = read("src", "app", "globals.css");
    for (const selector of [
      'html:has([data-nevo-console="teacher"]),',
      'html:has([data-nevo-console="teacher"]) body {',
    ]) {
      expect(css).toContain(selector);
    }
    const at = css.indexOf('html:has([data-nevo-console="teacher"]) body {');
    expect(css.slice(at, at + 160)).toMatch(/background-color:\s*var\(--color-nevo-cream\)/);
  });

  it("is marked on the shell, the bare onboarding route and the sign-in pages", () => {
    const shell = read("src", "components", "teacher", "Shell", "TeacherShell.tsx");
    expect(shell.match(/data-nevo-console="teacher"/g)?.length).toBe(2);
    expect(read("src", "app", "auth", "teacher", "layout.tsx")).toContain('data-nevo-console="teacher"');
  });
});
