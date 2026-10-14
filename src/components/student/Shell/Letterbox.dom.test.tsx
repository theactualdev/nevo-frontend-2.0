import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { Letterbox } from "./Letterbox";
import { StudentEntryStep } from "@/components/student/Onboarding/StudentEntryStep";
import {
  classSelector,
  compiledCss,
  ruleOrder,
  styleAt,
  type Viewport,
} from "@/test/compiledCss";

/**
 * D207, design's reference: the child's pre-login flow "is tablet-only and
 * letterboxes at desktop width (≥1024) - by design, not as a fallback ... At
 * desktop widths these screens centre the tablet frame on the near-black
 * field; they do not reflow to a wide layout."
 *
 * A DESKTOP, not a width: the reference's reason is that "a school desktop is
 * a teacher's machine or a lab workstation, neither of which is a shared child
 * device". So the frame is drawn at 1024 or wider with a fine pointer that
 * hovers, and a touch screen of any size keeps its own layouts - 28c's
 * landscape ones included, drawn because "tray-mounted tablets cannot be
 * rotated".
 *
 * jsdom applies no stylesheet and answers no media query, so what the frame
 * does at 1023 and at 1024, by mouse and by touch, is read from `globals.css`
 * as Tailwind compiles it, by `compiledCss`.
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
];

let css: string;
beforeAll(async () => {
  css = await compiledCss(["contents", ...SCREEN_CLASSES]);
});

afterEach(() => {
  cleanup();
});

/** A window: its size and the pointer that drives it. */
type Window = Omit<Viewport, "inLetterbox">;
/** A desk: a mouse or a trackpad, which hovers. */
const desk = (width: number, height = 832): Window => ({
  width,
  height,
  pointer: "fine",
});
/** A touch screen of any size, which does not hover. */
const touch = (width: number, height: number): Window => ({
  width,
  height,
  pointer: "coarse",
});

/** The letterbox's two boxes in a window: their class and their attribute. */
const field = (at: Window) => styleAt(css, [".contents", FIELD], at);
const frame = (at: Window) => styleAt(css, [".contents", FRAME], at);

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
    "are not there on a desk %ipx wide, under 1024",
    (width) => {
      expect(field(desk(width))).toEqual({ display: "contents" });
      expect(frame(desk(width))).toEqual({ display: "contents" });
    },
  );

  it.each([1024, 1280, 1920])(
    "centre a 768px tablet frame on near-black on a desk %ipx wide",
    (width) => {
      expect(field(desk(width))).toMatchObject({
        display: "flex",
        "justify-content": "center",
        width: "100%",
        "min-height": "100dvh",
        "background-color": "var(--color-nevo-near-black)",
      });
      // The frame: the tablet canvas's width, the window's height (design's
      // desktop canvas is 832 tall, too short for 1024), cream.
      expect(frame(desk(width))).toMatchObject({
        display: "flex",
        "flex-direction": "column",
        width: "768px",
        "min-height": "100dvh",
        "background-color": "var(--color-nevo-cream)",
        contain: "layout",
      });
      expect(css).toMatch(/--color-nevo-near-black: #2b2b2f;/);
    },
  );

  it.each<[string, Window]>([
    // The same 1280 as the desk above, by touch.
    ["a touch screen 1280 wide", touch(1280, 800)],
    // Classroom iPads held sideways, and an iPad Pro held upright.
    ["an iPad held sideways, 1080 x 810", touch(1080, 810)],
    ["an iPad held sideways, 1180 x 820", touch(1180, 820)],
    ["an iPad Pro held upright, 1024 x 1366", touch(1024, 1366)],
    // A fine pointer that cannot hover is not a desk's.
    [
      "a fine pointer that cannot hover",
      { width: 1280, height: 832, pointer: "fine", hover: "none" },
    ],
  ])("are not there on %s, which keeps its own layouts", (_, at) => {
    expect(field(at)).toEqual({ display: "contents" });
    expect(frame(at)).toEqual({ display: "contents" });
  });

  it("lays the near-black field under the whole page on a desk, not cream past the frame", () => {
    const page = (at: Window) =>
      styleAt(css, ["html:has([data-nevo-letterbox]) body"], at);

    expect(page(desk(1280))["background-color"]).toBe(
      "var(--color-nevo-near-black)",
    );
    expect(page(desk(1023))).toEqual({});
    expect(page(touch(1280, 800))).toEqual({});
  });

  it("keeps a sheet's scrim on the frame rather than the field", () => {
    const scrim = (at: Window) =>
      styleAt(
        css,
        ['html:has([data-nevo-letterbox]) [data-slot="sheet-overlay"]'],
        at,
      );

    expect(scrim(desk(1280))).toEqual({
      left: "calc(50% - 384px)",
      right: "calc(50% - 384px)",
    });
    expect(scrim(desk(1023))).toEqual({});
    expect(scrim(touch(1280, 800))).toEqual({});
  });
});

/** What one class gives an element in a window, inside a letterbox or not. */
const gives = (candidate: string, at: Window, inLetterbox = false) =>
  styleAt(css, [classSelector(candidate)], { ...at, inLetterbox });

describe("inside the frame the screen is an upright tablet, not the window", () => {
  it("draws no desktop size there on a desk: lg stays off", () => {
    // Out of a frame it is Tailwind's own.
    expect(gives("lg:px-20", desk(1280))).toHaveProperty("padding-inline");
    expect(gives("lg:px-20", desk(1280), true)).toEqual({});
    expect(gives("lg:px-20", desk(1000))).toEqual({});
  });

  it("draws the picker and the PIN door upright on a desk, though the window is wide", () => {
    // 28c's sideways layout and the PIN door's sideways grid: off in a frame.
    expect(gives("landscape:px-10", desk(1280))).toHaveProperty(
      "padding-inline",
    );
    expect(gives("landscape:px-10", desk(1280), true)).toEqual({});
    expect(gives("lg:landscape:grid", desk(1280))).toEqual({ display: "grid" });
    expect(gives("lg:landscape:grid", desk(1280), true)).toEqual({});

    // 28c's upright layout: on in a frame, as on a tablet held upright.
    expect(gives("portrait:sm:pt-[72px]", desk(1280))).toEqual({});
    expect(gives("portrait:sm:pt-[72px]", desk(1280), true)).toEqual({
      "padding-top": "72px",
    });
  });

  it("leaves a touch screen 1024 or wider exactly as Tailwind has it", () => {
    // A classroom iPad held sideways keeps 28c's landscape layout and the PIN
    // door's sideways grid: "tray-mounted tablets cannot be rotated".
    const sideways = touch(1180, 820);
    expect(gives("landscape:px-10", sideways, true)).toHaveProperty(
      "padding-inline",
    );
    expect(gives("lg:landscape:grid", sideways, true)).toEqual({
      display: "grid",
    });
    expect(gives("portrait:sm:pt-[72px]", sideways, true)).toEqual({});
    expect(gives("lg:px-20", sideways, true)).toHaveProperty("padding-inline");

    // An iPad Pro held upright keeps its own `lg:` and `portrait:` too.
    const upright = touch(1024, 1366);
    expect(gives("lg:px-20", upright, true)).toHaveProperty("padding-inline");
    expect(gives("portrait:sm:pt-[72px]", upright, true)).toEqual({
      "padding-top": "72px",
    });
  });

  it("leaves a tablet under 1024 held sideways its sideways layout", () => {
    expect(gives("landscape:px-10", touch(1000, 700), true)).toHaveProperty(
      "padding-inline",
    );
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
  it("docks in the screen's own flow, inside the frame, and on a desk is not drawn", async () => {
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

    // At a desk the hardware keyboard types, so the tray is not drawn there;
    // a touch screen, never letterboxed, keeps it.
    const classes = keyboard.className.split(/\s+/).filter(Boolean);
    const built = await compiledCss(classes);
    const display = (at: Window) =>
      styleAt(built, classes.map(classSelector), { ...at, inLetterbox: true })
        .display;
    expect(display(desk(1280))).toBe("none");
    expect(display(touch(1180, 820))).toBe("flex");
  });
});
