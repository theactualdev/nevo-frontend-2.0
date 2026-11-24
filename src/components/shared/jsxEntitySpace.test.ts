import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A SPACE THE COMPILER DROPS. Next 16's SWC loses the leading space of a JSX
 * text node when that text follows an expression, contains an HTML entity
 * (`&rsquo;`, `&ndash;`, ...) and runs onto another line - in production
 * builds too. So
 *
 *     {teacher.name} doesn&rsquo;t hold any classes yet.
 *     (then a line break)
 *
 * reached admins as "Kunle Bellodoesn't hold any classes yet", and the 12 Nov
 * dry run's "Chidican't" was this, not the text reader. Tests can't see it:
 * Vitest doesn't compile through SWC, and jsdom keeps the space.
 *
 * The cure is an explicit space - `{teacher.name}{" "}doesn&rsquo;t` - which
 * every compiler keeps. This reads every component and fails on any text left
 * in the shape that loses it (found on screen in the 24 Nov QA pass).
 */
const ROOT = join(process.cwd(), "src");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sources(path);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
  });
}

/** A JSX expression's closing brace, then the text node up to the next { or <. */
const NODE = /\}( [^{}<>]*)(?=[{<])/g;
const ENTITY = /&[a-zA-Z][a-zA-Z0-9]*;|&#\d+;/;

export function droppedSpaces(text: string): number[] {
  const src = text.replace(/\r\n/g, "\n");
  const lines: number[] = [];
  for (const m of src.matchAll(NODE)) {
    const node = m[1];
    if (!node.includes("\n") || !ENTITY.test(node) || !/^ +[A-Za-z&("'0-9]/.test(node)) continue;
    lines.push(src.slice(0, m.index).split("\n").length);
  }
  return lines;
}

describe("JSX text after an expression", () => {
  it("never relies on a leading space SWC drops", () => {
    const found = sources(ROOT).flatMap((file) =>
      droppedSpaces(readFileSync(file, "utf8")).map((line) => `${relative(process.cwd(), file)}:${line}`),
    );
    expect(found, "Write the space as {\" \"} after the expression").toEqual([]);
  });

  it("recognises the shape it guards against, and leaves the safe ones alone", () => {
    expect(droppedSpaces("<p>\n  {a} isn&rsquo;t here\n</p>")).toEqual([2]);
    expect(droppedSpaces("<p>\n  {a}{\" \"}isn&rsquo;t here\n</p>")).toEqual([]);
    // One line, or no entity, or a typed apostrophe: SWC keeps the space.
    expect(droppedSpaces("<p>{a} isn&rsquo;t here</p>")).toEqual([]);
    expect(droppedSpaces("<p>\n  {a} is here\n</p>")).toEqual([]);
    expect(droppedSpaces("<p>\n  {a} isn’t here\n</p>")).toEqual([]);
  });
});
