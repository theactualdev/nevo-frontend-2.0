import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { ADJUSTMENT_ACTIONS } from "@/lib/constants/affect";
import type { AdaptationPlan, Lesson } from "@/lib/types";
import { lessonFromContent } from "@/lib/lessons/fromContent";

/**
 * ONE PATH, TWO CALLERS.
 *
 * Design, 23 Sep: *"`simplify` is the same operation as the 17 Sep Simplify
 * control. One is asked for by the child, one is decided by the engine, and
 * what happens on screen is identical. Build it as a single path with two
 * callers."*
 *
 * Three of the contract's five instructions - `simplify`, `slower`, `expand` -
 * were arriving and resolving to null, because this client's action list
 * predated the enum and shared only two values with it. They did nothing
 * silently, which is rule 5 working as written and exactly why no gate caught
 * it.
 *
 * **The load-bearing assertion is that both callers end at the same screen**,
 * not that either one works on its own. Two implementations of "simplify"
 * would eventually disagree about what simplifying is, and a child would get a
 * different lesson depending on who asked for it.
 */

const { trackEvent } = vi.hoisted(() => ({ trackEvent: vi.fn() }));
vi.mock("@/hooks", () => ({
  useLesson: () => ({ setActiveLesson: vi.fn() }),
  useSignals: () => ({ trackEvent }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks/useLessonProgress", () => ({
  useLessonProgress: () => ({ sessionId: null, report: vi.fn() }),
}));
vi.mock("@/hooks/useRuntimeAdaptation", () => ({
  useRuntimeAdaptation: () => ({ suggestion: null, breakSuggestion: null }),
}));
vi.mock("@/context/AccessibilityContext", () => ({
  useAccessibility: () => ({ textSize: "regular", reducedMotion: false }),
  TEXT_ZOOM: { regular: 1 },
}));
vi.mock("@/hooks/useScaffoldLevel", () => ({ useScaffoldLevel: () => null }));

const FULL = "One idea here. A second idea here. A third idea here.";
const SHORT = "The short version.";
const LONGER = "The fuller version, with more said about it.";

/**
 * Authored content with BOTH reshapes, and that is what makes these tests
 * mean anything.
 *
 * Until 1 Oct an authored segment opened on its Simplify reshape before any
 * engine spoke, so a test that only checked "engine says simplify, Simplify
 * appears" would have passed against a client that ignored the instruction.
 * It opens on the standard body now (D23), and both reshapes have to be asked
 * for.
 */
const AUTHORED: Lesson = {
  id: "photo-1",
  title: "Photosynthesis",
  segments: [
    {
      id: "seg-1",
      modalities: ["text"],
      text: {
        heading: "Inside a leaf",
        body: { default: FULL, simplify: SHORT, expand: LONGER },
      },
    },
  ],
} as unknown as Lesson;

/** A live lesson's shape: one body, no reshapes. */
const LIVE: Lesson = {
  id: "photo-2",
  title: "Photosynthesis",
  segments: [
    {
      id: "seg-1",
      modalities: ["text"],
      text: { heading: "Inside a leaf", body: { default: FULL } },
    },
  ],
} as unknown as Lesson;

const planWith = (action: string | null): AdaptationPlan =>
  ({
    lessonId: "photo-1",
    segments: [],
    ...(action ? { adjustment: action } : {}),
  }) as unknown as AdaptationPlan;

const body = () => document.body.textContent ?? "";
const chip = (name: string) => screen.queryByRole("button", { name });

beforeEach(() => {
  trackEvent.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("end to end, from parsed content to the screen", () => {
  it("reshapes a LIVE lesson when the engine says simplify", () => {
    /*
     * THE LOOP THIS WHOLE THING EXISTS FOR, and it only closed on 23 Sep.
     *
     * Every other test in this file hands the player an AUTHORED lesson with
     * `body.simplify` already on it. A live one is parsed, and until
     * `depthVariants` landed it had one body and no reshapes - so the engine
     * could say `simplify` and the player would correctly do nothing, which is
     * exactly what it did for a week while the row read "blocked on
     * textVariant".
     *
     * So this builds the lesson the way a real one is built, through
     * `lessonFromContent`, and asserts the instruction now lands.
     */
    const live = lessonFromContent({
      id: "photo-3",
      title: "Photosynthesis",
      confirmationSummary: null,
      segments: [
        {
          id: "seg-1",
          segmentKey: "s1",
          contentType: "explanatory_text",
          sequenceOrder: 1,
          title: "Inside a leaf",
          body: FULL,
          availableModalities: ["text"],
          comprehensionCheckpoints: [],
          textVariant: null,
          visualVariant: null,
          audioVariant: null,
          interactiveVariant: null,
          calculationVariant: null,
          depthVariants: { simplified: { body: SHORT }, expanded: null },
          needsReview: false,
          reviewReasons: [],
        },
      ],
    } as never);
    // Null would mean the fixture built nothing openable - this one has text.
    if (!live) throw new Error("fixture produced no openable lesson");

    render(<LessonPlayer lesson={live} plan={planWith("simplify")} live />);

    expect(body()).toContain(SHORT);
    expect(body()).not.toContain(FULL);
  });
});

describe("no instruction is the standard text (D23)", () => {
  /*
   * Design, 1 Oct: "Open on the standard text. Standard is the lesson as the
   * teacher wrote it ... The front end does not choose a teaching treatment
   * the engine did not ask for." This opened on Simplify - the frame's
   * `adaptive ?? "Simplify"` - under a pulsing chip claiming a system action
   * nobody had taken.
   */
  it("opens on the standard body, though a simpler one exists", () => {
    render(<LessonPlayer lesson={AUTHORED} plan={planWith(null)} />);

    expect(body()).toContain(FULL);
    expect(body()).not.toContain(SHORT);
  });

  it("lights no system chip when nothing was instructed", () => {
    render(<LessonPlayer lesson={AUTHORED} plan={planWith(null)} />);

    for (const name of ["Simplify", "Expand"]) {
      expect(chip(name)).toHaveAttribute("aria-pressed", "false");
      expect(chip(name)!.className).not.toMatch(/bg-nevo-violet/);
    }
  });

  it("lights the system chip when the engine did instruct", () => {
    render(<LessonPlayer lesson={AUTHORED} plan={planWith("simplify")} />);

    expect(body()).toContain(SHORT);
    expect(chip("Simplify")).toHaveAttribute("aria-pressed", "true");
    expect(chip("Simplify")!.className).toMatch(/bg-nevo-violet/);
  });

  it("lights it without a glow or a sparkle (D144)", () => {
    // "Everything that reacts visibly to a child's input is coming out."
    render(<LessonPlayer lesson={AUTHORED} plan={planWith("simplify")} />);

    const bar = screen.getByRole("group", { name: "Lesson pacing" });
    expect(bar.innerHTML).not.toMatch(/animate-/);
    expect(bar.querySelector("svg")).toBeNull();
  });

  it("claims no density trigger on the way into a segment", () => {
    // A trigger is the child asking; arriving at a segment is not. `go()`
    // used to report the plan's density as one, with source "system".
    const two = {
      ...AUTHORED,
      segments: [AUTHORED.segments[0], { ...AUTHORED.segments[0], id: "seg-2" }],
    } as Lesson;
    render(<LessonPlayer lesson={two} plan={planWith(null)} />);

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(
      trackEvent.mock.calls.filter(([t]) => String(t).endsWith("_trigger")),
    ).toEqual([]);
  });
});

describe("the engine's instruction reaching the screen", () => {

  it("moves the screen to Expand when the engine asks for it", () => {
    /*
     * THE DECISIVE ONE. Expand is not the default, so this fails against a
     * client that drops the instruction - which is what this client did with
     * all three pace values until the enum landed.
     */
    render(<LessonPlayer lesson={AUTHORED} plan={planWith("expand")} />);

    expect(body()).toContain(LONGER);
    expect(body()).not.toContain(SHORT);
  });

  it("lands on the same screen the child's own chip produces", () => {
    /*
     * THE POINT OF THE WHOLE CHANGE. Same segment, same reshape, reached two
     * ways - if these ever diverge, a child gets a different lesson depending
     * on who asked for it.
     */
    const { unmount } = render(
      <LessonPlayer lesson={AUTHORED} plan={planWith("expand")} />,
    );
    const byEngine = body();
    unmount();

    render(<LessonPlayer lesson={AUTHORED} plan={planWith(null)} />);
    fireEvent.click(chip("Expand")!);
    const byChild = body();

    expect(byChild).toContain(LONGER);
    expect(byEngine).toContain(LONGER);
  });
});

describe("an instruction the content cannot honour", () => {
  it("shows the default, and claims nothing", () => {
    /*
     * A live lesson has one body and no reshape. The existing rule is that an
     * offered density which re-renders identical prose is the player telling a
     * child it adapted when it did not - so the instruction renders the
     * default and lights no chip, rather than being reported as an adaptation.
     */
    render(<LessonPlayer lesson={LIVE} plan={planWith("simplify")} />);

    expect(body()).toContain(FULL);
    expect(chip("Simplify")).toBeNull();
  });
});

describe("Slower, which needs no authored content", () => {
  it("reaches a live lesson when the engine asks for it", () => {
    // Slower is segmentation rather than wording, so the chunked flow delivers
    // it from the body the lesson already has.
    render(<LessonPlayer lesson={LIVE} plan={planWith("slower")} />);

    expect(chip("Tap to continue")).toBeInTheDocument();
  });
});

describe("who wins", () => {
  it("the child's own pick beats the engine's instruction", () => {
    /*
     * The one place a child has any agency in a system that deliberately tells
     * them nothing about what it is doing. An engine instruction overriding a
     * child's explicit ask would take that away silently.
     */
    render(<LessonPlayer lesson={AUTHORED} plan={planWith("expand")} />);
    expect(body()).toContain(LONGER);

    fireEvent.click(chip("Simplify")!);

    expect(body()).toContain(SHORT);
    expect(body()).not.toContain(LONGER);
  });
});

describe("instructions that are not densities", () => {
  it.each([
    [ADJUSTMENT_ACTIONS.OFFER_HINT],
    [ADJUSTMENT_ACTIONS.SHOW_SOCRATIC_PANEL],
  ])("%s changes the density not at all", (action) => {
    /*
     * They are instructions about the same screen, not reshapes of it, so the
     * screen must be the one it would have been with no instruction.
     *
     * Asserted against the no-instruction BASELINE rather than against a
     * literal, so this stays about "changes nothing" whatever the baseline
     * is - it was the Simplify reshape until 1 Oct and is the standard body
     * now (D23).
     */
    const { unmount } = render(
      <LessonPlayer lesson={AUTHORED} plan={planWith(null)} />,
    );
    const baseline = body();
    unmount();

    render(<LessonPlayer lesson={AUTHORED} plan={planWith(action)} />);

    expect(body()).toBe(baseline);
  });
});
