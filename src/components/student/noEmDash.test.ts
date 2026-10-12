import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * NO EM DASH IN ANYTHING A CHILD READS. Design's reference (CLAUDE-reference.md,
 * 12 Oct): "never use em dashes anywhere", a hyphen, colon or semicolon as the
 * sense requires. Comments may use them; copy may not. One slipped through on
 * the teacher's note ("— Ms Adeyemi"), so this reads every student source file
 * with its comments set aside and fails on any that is left.
 */
const ROOT = join(process.cwd(), "src", "components", "student");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** The file with its comments blanked, line numbers kept. */
function withoutComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, (c, lead: string) =>
      lead + " ".repeat(c.length - lead.length),
    );
}

describe("the student console's copy", () => {
  it("carries no em dash outside a comment", () => {
    const found = sources(ROOT).flatMap((file) =>
      withoutComments(readFileSync(file, "utf8"))
        .split("\n")
        .flatMap((line, i) =>
          line.includes("—")
            ? [`${relative(process.cwd(), file)}:${i + 1}`]
            : [],
        ),
    );
    expect(found).toEqual([]);
  });
});
