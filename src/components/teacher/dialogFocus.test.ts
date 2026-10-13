import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every teacher dialog moves focus in, keeps it, and gives it back (C07).
 *
 * Twelve `role="dialog"` elements shipped with none of the three, one sheet at
 * a time, so the check is on every dialog rather than on the ones that were
 * fixed: each must carry the ref `useDialogFocus` works through, and
 * `tabIndex={-1}` so a dialog with nothing to press can still take focus.
 */

const root = join(process.cwd(), "src/components/teacher");

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return p.endsWith(".tsx") && !p.endsWith(".test.tsx") ? [p] : [];
  });

/** The opening tag around each `role="dialog"`. */
const dialogTags = (src: string): string[] => {
  const tags: string[] = [];
  let at = src.indexOf('role="dialog"');
  while (at >= 0) {
    const start = src.lastIndexOf("<", at);
    const end = src.indexOf(">", at);
    tags.push(src.slice(start, end + 1));
    at = src.indexOf('role="dialog"', at + 1);
  }
  return tags;
};

const withDialogs = files(root).filter((p) => readFileSync(p, "utf8").includes('role="dialog"'));

describe("teacher dialogs", () => {
  it("are all found", () => {
    // A rename that hid every dialog from the scan would pass the rest.
    expect(withDialogs.length).toBeGreaterThanOrEqual(12);
  });

  it("each manage focus through useDialogFocus", () => {
    const offenders = withDialogs.filter((p) => !readFileSync(p, "utf8").includes("useDialogFocus("));

    expect(offenders.map((p) => relative(root, p))).toEqual([]);
  });

  it("each carry the ref and a tabIndex to fall back on", () => {
    const offenders = withDialogs.flatMap((p) =>
      dialogTags(readFileSync(p, "utf8"))
        .filter((tag) => !/\bref=\{\w+\}/.test(tag) || !tag.includes("tabIndex={-1}"))
        .map(() => relative(root, p)),
    );

    expect(offenders).toEqual([]);
  });
});
