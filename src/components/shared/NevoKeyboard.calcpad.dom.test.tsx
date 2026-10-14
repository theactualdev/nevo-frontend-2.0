import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { NevoKeyboard } from "./NevoKeyboard";
import {
  classSelector,
  compiledCss,
  styleAt,
  type Viewport,
} from "@/test/compiledCss";

/**
 * The calculation pad's compact form, once the step adds keys of its own
 * (B108). A pad two rows taller kept D150's 56px keys on a 375 x 812 phone,
 * where the standard pad has room, and left the column 263px; at 375 x 667 on
 * the largest text size the step's six keys took two rows of the compact pad
 * and the field was clipped under the first key typed.
 *
 * jsdom applies no media query, so the stylesheet is compiled and asked what
 * the pad gets at each window (`compiledCss`), and the pad is asked which
 * rows it says it has.
 */

const STEP_KEYS_CLASS =
  "[grid-template-columns:var(--calc-step-cols,repeat(3,minmax(0,1fr)))]";

let css: string;
beforeAll(async () => {
  css = await compiledCss([STEP_KEYS_CLASS]);
});
afterEach(cleanup);

const noop = () => {};
const PHONE = { width: 375, pointer: "coarse" } as const;

/** What a pad with `rows` rows of the step's keys gets at a text size. */
const pad = (
  rows: number | null,
  size: "m" | "l" | "xl",
  at: Viewport,
) => {
  const own = [".nevo-calc-pad"];
  if (size !== "m") own.push(`html[data-text-size="${size}"] .nevo-calc-pad`);
  const targets = rows
    ? [...own, ...own.map((s) => `${s}[data-step-rows="${rows}"]`)]
    : own;
  return styleAt(css, targets, at);
};

describe("how many rows the step's keys add", () => {
  const rowsFor = (keys: string[]) => {
    render(<NevoKeyboard layout="calc" keys={keys} onKey={noop} />);
    const tray = document.querySelector(".nevo-calc-pad");
    const rows = tray?.getAttribute("data-step-rows") ?? null;
    cleanup();
    return rows;
  };

  it("counts the rows the keys take where there is room, three to a row", () => {
    expect(rowsFor([])).toBeNull();
    expect(rowsFor(["x"])).toBe("1");
    expect(rowsFor(["x", "+", "(", ")"])).toBe("2");
    expect(rowsFor(["x", "+", "(", ")", "*", "/"])).toBe("2");
    // Three stands for three or more.
    expect(rowsFor([..."abcdefghij"])).toBe("3");
  });

  it("does not count a key the pad already carries", () => {
    expect(rowsFor(["-", ".", "7"])).toBeNull();
    expect(rowsFor(["-", "x"])).toBe("1");
  });
});

describe("when the pad goes compact", () => {
  it("goes compact sooner for every row of the step's keys", () => {
    const at = (height: number) => ({ ...PHONE, height });
    // The standard pad has room at 812 and keeps D150's keys; two rows more
    // do not (the case that left a 263px column).
    expect(pad(null, "m", at(812))["--calc-key"]).toBeUndefined();
    expect(pad(2, "m", at(812))["--calc-key"]).toBe("44px");
    // Each row is one roomy row's 66px: 760, then 826, 892 and 958.
    expect(pad(1, "m", at(850))["--calc-key"]).toBeUndefined();
    expect(pad(2, "m", at(850))["--calc-key"]).toBe("44px");
    expect(pad(2, "m", at(950))["--calc-key"]).toBeUndefined();
    expect(pad(3, "m", at(950))["--calc-key"]).toBe("44px");
  });

  it("counts the rows at the larger text sizes and from 640 wide too", () => {
    expect(pad(1, "l", { ...PHONE, height: 900 })["--calc-key"]).toBe("44px");
    expect(pad(null, "l", { ...PHONE, height: 900 })["--calc-key"]).toBeUndefined();
    expect(pad(2, "xl", { ...PHONE, height: 1060 })["--calc-key"]).toBe("44px");
    const tablet = { width: 820, height: 950, pointer: "coarse" } as const;
    expect(pad(2, "m", tablet)["--calc-key"]).toBe("44px");
    expect(pad(null, "m", tablet)["--calc-key"]).toBeUndefined();
  });

  it("keeps D150's pad, and the step's keys three to a row, where there is room", () => {
    const tall = pad(1, "m", { width: 820, height: 1180, pointer: "coarse" });
    expect(tall["--calc-key"]).toBeUndefined();
    expect(tall["--calc-step-cols"]).toBeUndefined();
  });

  it("packs the step's keys as tightly as 44px keys allow once compact", () => {
    // 375 x 667 at "xl", six keys: 296.5px across the tray, 5px apart, holds
    // six 44px keys - one row where three to a row took two.
    const short = pad(2, "xl", { ...PHONE, height: 667 });
    expect(short["--calc-key"]).toBe("44px");
    expect(short["--calc-step-cols"]).toBe("repeat(auto-fit, minmax(44px, 1fr))");
    expect(short["--calc-step-gap"]).toBe("5px");
  });

  it("lays the step's keys out by those columns", () => {
    render(<NevoKeyboard layout="calc" keys={["x"]} onKey={noop} />);
    const grid = document.querySelector("[data-step-keys]");

    expect(grid?.className.split(" ")).toContain(STEP_KEYS_CLASS);
    expect(
      styleAt(css, [classSelector(STEP_KEYS_CLASS)], PHONE)["grid-template-columns"],
    ).toBe("var(--calc-step-cols,repeat(3,minmax(0,1fr)))");
  });
});
