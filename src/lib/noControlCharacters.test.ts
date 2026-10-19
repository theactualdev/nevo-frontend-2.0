import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * NO CONTROL CHARACTERS IN SOURCE.
 *
 * A patch script once wrote `\b` through a shell that read it as an escape, so
 * five regexes carried a literal backspace (U+0008) where a word boundary was
 * meant: `/\bdone\b/` became a pattern no rendered text can contain. Four were
 * test assertions that therefore could never fail, and one was the
 * architecture check's own sufficiency rule, which silently stopped matching.
 * Nothing looked wrong in an editor, because the character draws as nothing.
 *
 * So the whole tree is checked: any C0 control character other than tab, line
 * feed and carriage return fails, with the file and line named.
 */

const roots = ["src", "scripts", "e2e"].map((d) => join(process.cwd(), d));
const CODE = /\.(ts|tsx|mjs|cjs|js|jsx|css)$/;
// Tab, LF and CR are ordinary whitespace; every other C0 control is not.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;

const files = (dir: string): string[] => {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.flatMap((name) => {
    if (name === "node_modules" || name.startsWith(".")) return [];
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return CODE.test(p) ? [p] : [];
  });
};

describe("source files", () => {
  // The whole tree is read, which takes several seconds on a busy machine.
  it("carry no control characters, such as a backspace where \\b was meant", { timeout: 60_000 }, () => {
    const offenders: string[] = [];
    for (const p of roots.flatMap(files)) {
      const text = readFileSync(p, "utf8");
      if (!CONTROL.test(text)) continue;
      text.split("\n").forEach((line, i) => {
        if (CONTROL.test(line)) offenders.push(`${relative(process.cwd(), p)}:${i + 1}`);
      });
    }

    expect(offenders).toEqual([]);
  });
});
