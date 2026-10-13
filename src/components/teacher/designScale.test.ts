import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The teacher console's radii and dashes, checked across every component.
 *
 * RADII. `rounded-xl` and `rounded-2xl` resolve to 14px and 18px here, because
 * the shared `--radius` is 10px and Tailwind scales from it. The frames draw
 * cards at 12px and sheets at 16px, so the console uses those values
 * explicitly. The token is shared with admin and student, which is why this
 * is not fixed there.
 *
 * DASHES. No em dash in rendered teacher copy (D1); the frames write " - ".
 * Comments may still use them, so only JSX text and string literals are read.
 */

const root = join(process.cwd(), "src/components/teacher");

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return p.endsWith(".tsx") && !p.endsWith(".test.tsx") ? [p] : [];
  });

/** Source with comments removed, so a docblock's dash is not copy. */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("the teacher console's design scale", () => {
  it("uses no 14px or 18px radius classes", () => {
    const offenders = files(root).filter((p) =>
      /\brounded-(t-|b-|l-|r-)?2?xl\b/.test(readFileSync(p, "utf8")),
    );

    expect(offenders.map((p) => relative(root, p))).toEqual([]);
  });

  it("renders no em dash", () => {
    const offenders = files(root).filter((p) =>
      /—|&mdash;|\u2014/.test(code(readFileSync(p, "utf8"))),
    );

    expect(offenders.map((p) => relative(root, p))).toEqual([]);
  });
});

describe("the teacher console's scrims", () => {
  it("blur what they cover, as C10b draws, and do not only dim it (T172)", () => {
    // A class string that covers the screen in the near-black wash is a
    // scrim; a click-catcher with no wash is not, and needs no blur.
    const offenders = files(root).flatMap((p) =>
      (readFileSync(p, "utf8").match(/"[^"]*\bfixed inset-0\b[^"]*"/g) ?? [])
        .filter((cls) => /bg-nevo-near-black\//.test(cls) && !/backdrop-blur/.test(cls))
        .map(() => relative(root, p)),
    );

    expect(offenders).toEqual([]);
  });
});
