import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * NO BROWSER DROPDOWN IN THE ADMIN CONSOLE (Olayinka's TO-DO item 2). Every
 * picker is `NevoSelect`, which draws Nevo's own list where a native <select>
 * draws the system's colours and type over a Nevo screen.
 *
 * WHY A SOURCE SCAN. The invite modal's class picker survived the conversion
 * because the scan that found the rest looked for "<select" followed by a
 * space or ">", and that tag broke the line. This one matches the tag however
 * it continues. The admin console only: the parent date check keeps the
 * phone's own month picker on purpose (the Hub, 24 Nov).
 */
const ROOTS = ["src/components/admin", "src/app/admin"].map((r) => join(process.cwd(), r));

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
  });
}

/** The 1-based lines of every native <select> tag, whatever follows the name. */
export function nativeSelects(text: string): number[] {
  const src = text.replace(/\r\n/g, "\n");
  return [...src.matchAll(/<select(?![A-Za-z0-9_-])/g)].map(
    (m) => src.slice(0, m.index).split("\n").length,
  );
}

describe("native selects in the admin console", () => {
  it("finds the tag however it continues, a line break included", () => {
    expect(nativeSelects('<select\n  id="x"\n>')).toEqual([1]);
    expect(nativeSelects("a\n<select>")).toEqual([2]);
    expect(nativeSelects('<select value="a">')).toEqual([1]);
    expect(nativeSelects("<selectAll /> <NevoSelect />")).toEqual([]);
  });

  it("has none: every picker is NevoSelect", () => {
    const found = ROOTS.flatMap((root) =>
      sources(root).flatMap((path) =>
        nativeSelects(readFileSync(path, "utf8")).map(
          (line) => `${relative(process.cwd(), path)}:${line}`,
        ),
      ),
    );
    expect(found).toEqual([]);
  });
});
