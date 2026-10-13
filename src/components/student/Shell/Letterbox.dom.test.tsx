import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { Letterbox } from "./Letterbox";
import { StudentEntryStep } from "@/components/student/Onboarding/StudentEntryStep";
import {
  classSelector,
  compiledCss,
  ruleOrder,
  styleAt,
} from "@/test/compiledCss";

/**
 * D207, design's reference: the child's pre-login flow "is tablet-only and
 * letterboxes at desktop width (≥1024) - by design, not as a fallback ... At
 * desktop widths these screens centre the tablet frame on the near-black
 * field; they do not reflow to a wide layout."
 *
 * jsdom applies no stylesheet and answers no media query, so what the frame
 * does at 1023 and at 1024 is read from `globals.css` as Tailwind compiles
 * it, by `compiledCss`.
 */

vi.setConfig({ testTimeout: 30_000 });

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks", () => ({
  useSignals: () => ({ trackEvent: vi.fn(), flush: vi.fn() }),
}));
vi.mock("@/lib/api/studentEntry", () => ({
  studentEntryApi: { lookup: vi.fn(), setPin: vi.fn() },
}));
vi.mock("@/lib/api", () => ({ authApi: { setPin: vi.fn() } }));
vi.mock("@/lib/api/consents", () => ({
  consentsApi: { myConsentGate: vi.fn() },
}));

const FIELD = "[data-nevo-letterbox]";
const FRAME = "[data-nevo-letterbox-frame]";

/** Class names from the screens these variants decide, as they are written. */
const SCREEN_CLASSES = [
  // 28d's desktop sizes, and the PIN door's sideways grid.
  "lg:px-20",
  "lg:landscape:grid",
  // 28c, the picker: its sideways layout and its upright one.
  "landscape:px-10",
  "portrait:sm:pt-[72px]",
  "xl:px-3",
  "2xl:px-5",
];

let css: string;
beforeAll(async () => {
  css = await compiledCss(["contents", ...SCREEN_CLASSES]);
});

afterEach(() => {
  cleanup();
});

/** The letterbox's two boxes at a width: their class and their attribute. */
const field = (width: number) =>
  styleAt(css, [".contents", FIELD], { width });
const frame = (width: number) =>
  styleAt(css, [".contents", FRAME], { width });

describe("the letterbox's two boxes", () => {
  it("carry the attributes the stylesheet keys on, and draw nothing of their own", () => {
    render(
      <Letterbox>
        <main>Who&apos;s learning?</main>
      </Letterbox>,
    );

    const inner = screen.getByText("Who's learning?").parentElement!;
    expect(inner).toHaveAttribute("data-nevo-letterbox-frame");
    expect(inner).toHaveClass("contents");
    expect(inner.parentElement).toHaveAttribute("data-nevo-letterbox");
    expect(inner.parentElement).toHaveClass("contents");
  });

  it.each([375, 768, 1023])(
    "are not there at %ipx wide, so a phone or tablet lays the screen out as before",
    (width) => {
      expect(field(width)).toEqual({ display: "contents" });
      expect(frame(width)).toEqual({ display: "contents" });
    },
  );

  it.each([1024, 1280, 1920])(
    "centre a 768px tablet frame on near-black at %ipx wide",
    (width) => {
      expect(field(width)).toMatchObject({
        display: "flex",
        "justify-content": "center",
        width: "100%",
        "min-height": "100dvh",
        "background-color": "var(--color-nevo-near-black)",
      });
      // The frame: the tablet canvas's width, the window's height (design's
      // desktop canvas is 832 tall, too short for 1024), cream.
      expect(frame(width)).toMatchObject({
        display: "flex",
        "flex-direction": "column",
        width: "768px",
        "min-height": "100dvh",
        "background-color": "var(--color-nevo-cream)",
      });
      expect(css).toMatch(/--color-nevo-near-black: #2b2b2f;/);
    },
  );

  it("is the box a fixed tray is placed in, and lends a screen its width in place of the window's", () => {
    expect(frame(1280)).toMatchObject({
      contain: "layout",
      "--nevo-vw": "7.68px",
    });
    expect(frame(1023)).not.toHaveProperty("--nevo-vw");
  });

  it("lays the near-black field under the whole page, not cream past the frame", () => {
    const page = (width: number) =>
      styleAt(css, ["html:has([data-nevo-letterbox]) body"], { width });

    expect(page(1280)["background-color"]).toBe(
      "var(--color-nevo-near-black)",
    );
    expect(page(1023)).toEqual({});
  });

  it("keeps a sheet's scrim on the frame rather than the field", () => {
    const scrim = (width: number) =>
      styleAt(
        css,
        ['html:has([data-nevo-letterbox]) [data-slot="sheet-overlay"]'],
        { width },
      );

    expect(scrim(1280)).toEqual({
      left: "calc(50% - 384px)",
      right: "calc(50% - 384px)",
    });
    expect(scrim(1023)).toEqual({});
  });
});

/** What one class gives an element at a window, inside a letterbox or not. */
const gives = (
  candidate: string,
  at: Parameters<typeof styleAt>[2],
) => styleAt(css, [classSelector(candidate)], at);

describe("inside the frame the screen is an upright tablet, not the window", () => {
  it("draws no desktop size there: lg, xl and 2xl stay off", () => {
    // Out of a frame they are Tailwind's own.
    expect(gives("lg:px-20", { width: 1280 })).toHaveProperty("padding-inline");
    expect(gives("lg:px-20", { width: 1280, inLetterbox: true })).toEqual({});
    expect(gives("lg:px-20", { width: 1000 })).toEqual({});

    expect(gives("xl:px-3", { width: 1920 })).toHaveProperty("padding-inline");
    expect(gives("xl:px-3", { width: 1920, inLetterbox: true })).toEqual({});
    expect(gives("2xl:px-5", { width: 1920 })).toHaveProperty("padding-inline");
    expect(gives("2xl:px-5", { width: 1920, inLetterbox: true })).toEqual({});
  });

  it("draws the picker and the PIN door upright, though the window is wide", () => {
    const desk = { width: 1280, height: 832 } as const;

    // 28c's sideways layout and the PIN door's sideways grid: off in a frame.
    expect(gives("landscape:px-10", desk)).toHaveProperty("padding-inline");
    expect(gives("landscape:px-10", { ...desk, inLetterbox: true })).toEqual({});
    expect(gives("lg:landscape:grid", desk)).toEqual({ display: "grid" });
    expect(gives("lg:landscape:grid", { ...desk, inLetterbox: true })).toEqual(
      {},
    );

    // 28c's upright layout: on in a frame, as on a tablet held upright.
    expect(gives("portrait:sm:pt-[72px]", desk)).toEqual({});
    expect(
      gives("portrait:sm:pt-[72px]", { ...desk, inLetterbox: true }),
    ).toEqual({ "padding-top": "72px" });
    expect(gives("portrait:sm:pt-[72px]", { width: 768, height: 1024 })).toEqual(
      { "padding-top": "72px" },
    );
  });

  it("leaves a tablet under 1024 held sideways its sideways layout", () => {
    // No frame is drawn there, so nothing is answered for one.
    expect(
      gives("landscape:px-10", { width: 1000, height: 700, inLetterbox: true }),
    ).toHaveProperty("padding-inline");
  });

  it("keeps every variant it answers for in the place Tailwind sorts it", () => {
    // A redefined variant that moved would change which rule wins wherever
    // two sit on one element, all across the app.
    const order = [
      "max-lg:px-4",
      "sm:px-0",
      "md:px-1",
      "lg:px-2",
      "xl:px-3",
      "2xl:px-5",
      "portrait:pt-3",
      "landscape:pt-2",
      "dark:px-9",
    ];
    return compiledCss([...order].reverse()).then((built) => {
      expect(ruleOrder(built, order.map(classSelector))).toEqual(
        order.map(classSelector),
      );
    });
  });
});

describe("a docked keyboard in the frame", () => {
  it("docks in the screen's own flow, inside the frame, and is hidden with a mouse", async () => {
    // 05 Entry, whose letter keyboard docks under the fields on a touch
    // screen. Nothing between it and the frame is fixed to the window, and
    // it is not portalled out of the frame.
    render(
      <Letterbox>
        <StudentEntryStep framing="school" />
      </Letterbox>,
    );
    const firstCell = screen.getAllByLabelText(/School code, character/)[0];
    act(() => firstCell.focus());

    const keyboard = screen.getByRole("group", { name: "On-screen keyboard" });
    expect(keyboard.closest(FRAME)).not.toBeNull();
    for (
      let el: HTMLElement | null = keyboard;
      el && !el.matches(FRAME);
      el = el.parentElement
    ) {
      expect(el.className).not.toMatch(/(^|\s)(fixed|absolute)(\s|$)/);
    }

    // At a desk the hardware keyboard types, so the tray is not drawn; a
    // touch screen 1024 or wider, letterboxed too, keeps it.
    const classes = keyboard.className.split(/\s+/).filter(Boolean);
    const built = await compiledCss(classes);
    const at = (pointer: "fine" | "coarse") =>
      styleAt(built, classes.map(classSelector), {
        width: 1280,
        pointer,
        inLetterbox: true,
      }).display;
    expect(at("fine")).toBe("none");
    expect(at("coarse")).toBe("flex");
  });
});
