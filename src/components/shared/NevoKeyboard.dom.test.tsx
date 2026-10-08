import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NevoKeyboard } from "./NevoKeyboard";

/**
 * A child on a large tablet could not type a single character.
 *
 * Every screen that uses this keyboard sets `inputMode="none"` on its field,
 * which suppresses the device's own keyboard — this one replaces it. Each caller
 * then hid this one with `lg:hidden`, assuming 1024px or wider means a desktop
 * with a hardware keyboard.
 *
 * A touch tablet whose PORTRAIT width is 1024px or more — an iPad Pro 12.9" is
 * exactly 1024 — therefore got no device keyboard and no Nevo keyboard. No PIN,
 * no name, no school code. The screens rendered perfectly and would not accept a
 * character, with nothing on screen to explain it.
 *
 * Two things are pinned here, and the second matters more than the first:
 *   1. the keyboard hides on POINTER, not on width;
 *   2. no CALLER can reintroduce a width gate, because ten of them had one and a
 *      an eleventh screen forgot the gate entirely — the call sites are what got
 *      it wrong, so the call sites are what this guards.
 *
 * jsdom does not evaluate media queries, so the class is asserted rather than
 * its effect. That is the honest limit of this test; the browser check that a
 * 1024-wide touch viewport can type lives in the PR.
 */

const noop = () => {};

afterEach(() => cleanup());

/**
 * Shift started on and stayed on, so a child typing their name got "AMARA",
 * and the numbers page's "#+=" key - which offered a symbols page that does
 * not exist - flipped the case of everything typed after it.
 */
describe("NevoKeyboard qwerty case", () => {
  const typeKeys = (...labels: string[]) =>
    labels.forEach((label) =>
      fireEvent.click(screen.getByRole("button", { name: label })),
    );

  it("capitalises the first letter, then drops back to lowercase", () => {
    const onKey = vi.fn();
    render(<NevoKeyboard layout="qwerty" onKey={onKey} onBackspace={noop} />);

    typeKeys("A", "m", "a", "r", "a");

    expect(onKey.mock.calls.map(([c]) => c).join("")).toBe("Amara");
  });

  it("arms shift for one more capital when the child taps it", () => {
    const onKey = vi.fn();
    render(<NevoKeyboard layout="qwerty" onKey={onKey} onBackspace={noop} />);

    typeKeys("A", "d", "a", "space");
    fireEvent.click(screen.getByRole("button", { name: "Uppercase" }));
    typeKeys("O", "b", "i");

    expect(onKey.mock.calls.map(([c]) => c).join("")).toBe("Ada Obi");
  });

  it("offers no key for a symbols page that does not exist", () => {
    render(<NevoKeyboard layout="qwerty" onKey={noop} onBackspace={noop} />);

    fireEvent.click(screen.getByRole("button", { name: "123" }));

    expect(screen.queryByRole("button", { name: "More symbols" })).toBeNull();
    expect(screen.queryByText("#+=")).toBeNull();
  });

  it("comes back from the numbers page in the case it left", () => {
    const onKey = vi.fn();
    render(<NevoKeyboard layout="qwerty" onKey={onKey} onBackspace={noop} />);

    typeKeys("A", "123", "1", "ABC", "b");

    expect(onKey.mock.calls.map(([c]) => c).join("")).toBe("A1b");
  });
});

/**
 * D150: "The Nevo pad, with minus and decimal point." The calculation's number
 * entry took the device's numeric keyboard, and an iPhone's has no minus key.
 */
describe("NevoKeyboard calc pad", () => {
  const press = (name: string) =>
    fireEvent.click(screen.getByRole("button", { name }));

  it("types digits, a minus sign and a point", () => {
    const onKey = vi.fn();
    render(<NevoKeyboard layout="calc" onKey={onKey} />);

    for (const key of ["Minus sign", "1", "2", "Point", "0", "5"]) press(key);

    // The hyphen and full stop a stored answer is written with.
    expect(onKey.mock.calls.map(([c]) => c).join("")).toBe("-12.05");
    expect(screen.getByRole("button", { name: "Minus sign" })).toHaveTextContent(
      "\u2212",
    );
  });

  it("is an input surface, not a calculator: no operators, no delete", () => {
    render(<NevoKeyboard layout="calc" onKey={noop} />);

    const keys = screen.getAllByRole("button").map((b) => b.textContent);
    expect(keys).toEqual([
      ...["1", "2", "3", "4", "5", "6", "7", "8", "9"],
      "\u2212",
      "0",
      ".",
    ]);
    // "Delete sits at the field."
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("is shown whatever the pointer, as D150 draws it at desktop", () => {
    render(<NevoKeyboard layout="calc" onKey={noop} />);

    const kb = screen.getByRole("group", { name: "On-screen keyboard" });
    expect(kb.className).not.toContain("[@media(pointer:fine)]:hidden");
  });

  it("never reaches the PIN pad, docked or in the screen", () => {
    for (const presentation of ["docked", "block"] as const) {
      render(
        <NevoKeyboard
          layout="pad"
          presentation={presentation}
          onKey={noop}
          onBackspace={noop}
        />,
      );

      expect(screen.queryByRole("button", { name: "Minus sign" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Point" })).toBeNull();
      expect(screen.queryByText("\u2212")).toBeNull();
      expect(screen.queryByText("-")).toBeNull();
      expect(screen.queryByText(".")).toBeNull();
      cleanup();
    }
  });
});

describe("NevoKeyboard visibility", () => {
  it("hides itself where a real keyboard exists", () => {
    render(<NevoKeyboard layout="pad" onKey={noop} onBackspace={noop} />);

    const kb = screen.getByRole("group", { name: "On-screen keyboard" });
    expect(kb.className).toContain("[@media(pointer:fine)]:hidden");
  });

  it("does not hide itself on a wide touch device", () => {
    // The regression, stated as the thing that must NOT be true: no width
    // breakpoint may decide whether a child can type.
    render(<NevoKeyboard layout="pad" onKey={noop} onBackspace={noop} />);

    const kb = screen.getByRole("group", { name: "On-screen keyboard" });
    expect(kb.className).not.toMatch(/\b(lg|md|xl|sm):hidden\b/);
  });

  it("keeps hiding itself when a caller passes its own classes", () => {
    // Callers position this thing (`fixed inset-x-0 bottom-0 z-40`). The gate
    // must survive being merged with whatever they pass.
    render(
      <NevoKeyboard
        layout="qwerty"
        onKey={noop}
        onBackspace={noop}
        className="fixed inset-x-0 bottom-0 z-40"
      />,
    );

    const kb = screen.getByRole("group", { name: "On-screen keyboard" });
    expect(kb.className).toContain("[@media(pointer:fine)]:hidden");
    expect(kb.className).toContain("fixed");
  });
});

/**
 * The call sites are the actual defect surface: ten of them repeated
 * `lg:hidden`, and a screen added later forgot it and shipped a keyboard that
 * showed on desktop too. Neither mistake is possible if no call site says
 * anything about visibility at all.
 */
function tsxFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsxFilesUnder(full));
    else if (entry.endsWith(".tsx") && !entry.includes(".test."))
      out.push(full);
  }
  return out;
}

describe("no caller decides the keyboard's visibility by width", () => {
  it("has no width-gated NevoKeyboard anywhere in src", () => {
    const offenders: string[] = [];

    for (const file of tsxFilesUnder(join(process.cwd(), "src"))) {
      const source = readFileSync(file, "utf8");
      if (!source.includes("<NevoKeyboard")) continue;

      // The element, from its opening tag to the end of that tag.
      for (const match of source.matchAll(/<NevoKeyboard[\s\S]*?\/>/g)) {
        if (/\b(sm|md|lg|xl|2xl):hidden\b/.test(match[0])) {
          offenders.push(file.replace(process.cwd(), "").replace(/\\/g, "/"));
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

/**
 * The other half of the trap. A field that suppresses the device keyboard and
 * renders no replacement is the same lockout by a different route, so the two
 * are counted together: every screen with `inputMode="none"` must also mount a
 * NevoKeyboard.
 */
describe("no screen suppresses the device keyboard without offering ours", () => {
  it("every inputMode=none screen mounts a NevoKeyboard", () => {
    const offenders: string[] = [];

    for (const file of tsxFilesUnder(join(process.cwd(), "src"))) {
      const source = readFileSync(file, "utf8");
      if (!source.includes('inputMode="none"')) continue;
      if (!source.includes("NevoKeyboard")) {
        offenders.push(file.replace(process.cwd(), "").replace(/\\/g, "/"));
      }
    }

    expect(offenders).toEqual([]);
  });
});
