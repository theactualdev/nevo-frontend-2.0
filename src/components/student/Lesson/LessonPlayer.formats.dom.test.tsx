import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { lessonFromContent } from "@/lib/lessons/fromContent";
import type { LessonDetailResponse } from "@/lib/api/lessons";
import type { AdaptationPlan, Lesson } from "@/lib/types";

/**
 * THE FORMAT GROUP (SCRUM-272; Nevo Lesson Player Frame, 51b9e2a), and the
 * engine's suggestion pill it replaces (SCRUM-271 amended, 21 Oct).
 *
 * The group offers the section's formats as the server lists them; the
 * recommended one carries a quiet marker only where it differs from the one
 * on screen; a single-format section has no group. A child's pick is the
 * format for that section - over the engine, and for that section only.
 */

const { runtime } = vi.hoisted(() => ({
  runtime: {
    value: {
      offeredBreak: null,
      reason: null,
      forSegmentId: null,
      plan: null,
    } as {
      offeredBreak: null;
      reason: null;
      forSegmentId: string | null;
      plan: AdaptationPlan | null;
    },
  },
}));

vi.mock("@/hooks/useLessonProgress", () => ({
  useLessonProgress: () => ({
    report: vi.fn(),
    sessionId: null,
    completionSaved: false,
    completionFailed: false,
    saved: null,
    opened: null,
    localId: "local-1",
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks", () => ({
  useLesson: () => ({ setActiveLesson: vi.fn() }),
  useSignals: () => ({ trackEvent: vi.fn() }),
}));
vi.mock("@/hooks/useRuntimeAdaptation", () => ({
  useRuntimeAdaptation: () => runtime.value,
}));
vi.mock("@/hooks/useScaffoldLevel", () => ({ useScaffoldLevel: () => null }));
vi.mock("@/hooks/useAssignmentNote", () => ({ useAssignmentNote: () => null }));
vi.mock("@/context/AccessibilityContext", () => ({
  useAccessibility: () => ({ textSize: "regular", reducedMotion: false }),
  TEXT_ZOOM: { regular: 1 },
}));

type Fmt = "text" | "audio" | "visual" | "interactive";

/** A section carrying all four channels, offered as `formats` says. */
const seg = (
  id: string,
  formats?: Fmt[],
  recommendedFormat?: Fmt | null,
) => ({
  id,
  modalities: ["text", "audio", "visual", "interactive"],
  ...(formats ? { formats } : {}),
  ...(recommendedFormat !== undefined ? { recommendedFormat } : {}),
  text: { heading: id, body: { default: `Text of ${id}.`, simplify: `Short ${id}.` } },
  audio: { title: id, transcript: `Transcript of ${id}.` },
  visual: {
    heading: id,
    illustration: { src: `https://cdn.example/${id}.png`, alt: `Picture of ${id}` },
  },
  interactive: {
    heading: `Activity ${id}`,
    steps: [`Do ${id}.`],
    outcome: { done: `Done ${id}.` },
  },
});

const lesson = (...segments: ReturnType<typeof seg>[]): Lesson =>
  ({ id: "l-1", title: "Osmosis", segments }) as unknown as Lesson;

const group = () => screen.queryByRole("group", { name: "Lesson format" });
const pill = (name: string) =>
  within(group()!).getByRole("button", { name });
const pills = () =>
  within(group()!)
    .getAllByRole("button")
    .map((b) => b.getAttribute("aria-label"));
/** The pills that carry the marker. */
const marked = () =>
  within(group()!)
    .getAllByRole("button")
    .filter((b) => b.hasAttribute("data-recommended"))
    .map((b) => b.getAttribute("aria-label"));
const pressed = () =>
  within(group()!)
    .getAllByRole("button", { pressed: true })
    .map((b) => b.getAttribute("aria-label"));
const next = () => fireEvent.click(screen.getByRole("button", { name: "Next" }));
const prev = () =>
  fireEvent.click(screen.getByRole("button", { name: "Previous" }));
const text = () => document.body.textContent ?? "";

beforeEach(() => {
  runtime.value = { offeredBreak: null, reason: null, forSegmentId: null, plan: null };
});

afterEach(() => {
  cleanup();
});

describe("the format group", () => {
  it("offers the section's formats, by their names, in the server's order", () => {
    render(
      <LessonPlayer
        lesson={lesson(seg("s1", ["visual", "text", "interactive", "audio"]))}
        plan={null}
      />,
    );

    expect(group()).not.toBeNull();
    expect(pills()).toEqual(["Picture", "Text", "Activity", "Audio"]);
  });

  it("offers only what the server lists, never a greyed-out pill", () => {
    render(<LessonPlayer lesson={lesson(seg("s1", ["text", "audio"]))} plan={null} />);

    expect(pills()).toEqual(["Text", "Audio"]);
    expect(screen.queryByRole("button", { name: "Picture" })).toBeNull();
  });

  it("is not there at all for a section with one format", () => {
    render(
      <LessonPlayer
        lesson={lesson(seg("s1", ["text"], "text"), seg("s2", ["text", "audio"]))}
        plan={null}
      />,
    );

    expect(group()).toBeNull();
    expect(screen.queryByRole("button", { name: "Text" })).toBeNull();
    next();
    expect(group()).not.toBeNull();
  });

  /*
   * Lydia, 26 Oct #7: "Reserve the space only on sections that have more
   * than one format, and drop it entirely on sections with one, where the
   * control can never appear."
   */
  it("holds no space for it on a section with one format, in a lesson that has one", () => {
    render(
      <LessonPlayer
        lesson={lesson(seg("s1", ["text", "audio"]), seg("s2", ["text"]))}
        plan={null}
      />,
    );
    expect(group()).not.toBeNull();

    next();

    expect(group()).toBeNull();
    expect(document.querySelector("header .invisible")).toBeNull();
    expect(document.querySelector("header [inert]")).toBeNull();
  });

  it("falls back to the section's own channels on a payload with no formats list", () => {
    render(<LessonPlayer lesson={lesson(seg("s1"))} plan={null} />);

    expect(pills()).toEqual(["Text", "Audio", "Picture", "Activity"]);
  });

  it("marks the format on screen as pressed, and that one only", () => {
    render(<LessonPlayer lesson={lesson(seg("s1", ["text", "audio"]))} plan={null} />);

    expect(pressed()).toEqual(["Text"]);
  });

  it("shows the depth chips on the text and not over another format", () => {
    render(<LessonPlayer lesson={lesson(seg("s1", ["text", "audio"]))} plan={null} />);
    expect(screen.getByRole("group", { name: "Lesson pacing" })).toBeInTheDocument();

    fireEvent.click(pill("Audio"));

    expect(screen.queryByRole("group", { name: "Lesson pacing" })).toBeNull();
    expect(text()).not.toContain("Text of s1.");
  });
});

describe("the quiet marker", () => {
  it("sits on the recommended format where it differs from the one on screen", () => {
    render(
      <LessonPlayer
        lesson={lesson(seg("s1", ["text", "audio", "visual"], "audio"))}
        plan={null}
      />,
    );

    expect(marked()).toEqual(["Audio"]);
    // A glyph, decorative, and no part of the button's name.
    const audio = pill("Audio");
    expect(audio.querySelector("[aria-hidden='true'] svg")).not.toBeNull();
    expect(audio).toHaveAccessibleName("Audio");
    expect(audio).toHaveAttribute("aria-pressed", "false");
  });

  it("is not there when the recommendation is the format on screen", () => {
    render(
      <LessonPlayer
        lesson={lesson(seg("s1", ["text", "audio"], "text"))}
        plan={null}
      />,
    );

    expect(marked()).toEqual([]);
    expect(pressed()).toEqual(["Text"]);
  });

  it("is not there when the server recommends nothing", () => {
    render(
      <LessonPlayer
        lesson={lesson(seg("s1", ["text", "audio"], null))}
        plan={null}
      />,
    );

    expect(marked()).toEqual([]);
  });

  it("stays where it is when the child picks against it, and neither reads as a correction", () => {
    render(
      <LessonPlayer
        lesson={lesson(seg("s1", ["text", "audio", "visual"], "audio"))}
        plan={null}
      />,
    );

    fireEvent.click(pill("Picture"));

    expect(pressed()).toEqual(["Picture"]);
    expect(marked()).toEqual(["Audio"]);
    // No copy appears for the choice either way.
    expect(text()).not.toMatch(/recommend|suggest|try|instead/i);
  });

  it("follows the recommendation alone, not whether the child took it", () => {
    render(
      <LessonPlayer
        lesson={lesson(seg("s1", ["text", "audio"], "audio"))}
        plan={null}
      />,
    );

    // Taken: the navy pill is both, with no second emphasis.
    fireEvent.click(pill("Audio"));
    expect(marked()).toEqual([]);
    // Left again: it is where the recommendation is, as before.
    fireEvent.click(pill("Text"));
    expect(marked()).toEqual(["Audio"]);
  });

  it("reads the engine's newer answer over the lesson's own", () => {
    runtime.value = {
      ...runtime.value,
      forSegmentId: "s1",
      plan: {
        lessonId: "l-1",
        segments: [
          {
            segmentId: "s1",
            startModality: "text",
            formats: ["text", "audio", "visual"],
            recommendedFormat: "audio",
          },
        ],
      },
    };
    render(
      <LessonPlayer
        lesson={lesson(seg("s1", ["text", "audio", "visual"], "visual"))}
        plan={null}
      />,
    );

    expect(marked()).toEqual(["Audio"]);
  });

  it("is never worked out where the server sent no list to go with it", () => {
    // A mock or an older payload: the pills are the section's own, unmarked.
    render(
      <LessonPlayer
        lesson={lesson({ ...seg("s1"), recommendedFormat: "audio" })}
        plan={null}
      />,
    );

    expect(marked()).toEqual([]);
  });

  it("is a different kind of thing from the support dots, in a different place", () => {
    render(
      <LessonPlayer
        lesson={lesson(seg("s1", ["text", "audio"], "audio"))}
        plan={{
          lessonId: "l-1",
          segments: [{ segmentId: "s1", startModality: "text", scaffold: "moderate" }],
        }}
      />,
    );

    const dots = document.querySelector("[data-scaffold-indicator]")!;
    const titleRow = screen.getByRole("heading", { name: "Osmosis" }).parentElement!;
    // The dots sit beside the title; the marker is a glyph inside a format
    // pill in the column beneath it.
    expect(titleRow.contains(dots)).toBe(true);
    expect(titleRow.contains(group())).toBe(false);
    expect(dots.contains(pill("Audio"))).toBe(false);
    expect(pill("Audio").contains(dots)).toBe(false);
  });
});

describe("the child's pick", () => {
  it("puts the section on screen in that format", () => {
    render(<LessonPlayer lesson={lesson(seg("s1", ["text", "visual"]))} plan={null} />);

    fireEvent.click(pill("Picture"));

    expect(screen.getByRole("img", { name: "Picture of s1" })).toBeInTheDocument();
  });

  it("outranks the engine for that section", () => {
    // The engine names audio for s1, at load and again mid-lesson.
    const plan: AdaptationPlan = {
      lessonId: "l-1",
      segments: [{ segmentId: "s1", startModality: "audio" }],
    };
    runtime.value = { ...runtime.value, forSegmentId: "s1", plan };
    render(
      <LessonPlayer
        lesson={lesson(seg("s1", ["text", "audio", "visual"]), seg("s2", ["text", "audio"]))}
        plan={plan}
      />,
    );
    expect(pressed()).toEqual(["Audio"]);

    fireEvent.click(pill("Picture"));
    next();
    prev();

    // Back on s1: the child's Picture, not the engine's Audio.
    expect(pressed()).toEqual(["Picture"]);
    expect(screen.getByRole("img", { name: "Picture of s1" })).toBeInTheDocument();
  });

  it("is for that section only: the next opens as the plan says", () => {
    const plan: AdaptationPlan = {
      lessonId: "l-1",
      segments: [{ segmentId: "s2", startModality: "text" }],
    };
    render(
      <LessonPlayer
        lesson={lesson(seg("s1", ["text", "audio"]), seg("s2", ["text", "audio"]))}
        plan={plan}
      />,
    );

    fireEvent.click(pill("Audio"));
    next();

    expect(pressed()).toEqual(["Text"]);
    expect(text()).toContain("Text of s2.");
  });

  it("leaves the cold start as it was: the plan's format, else the first", () => {
    render(
      <LessonPlayer
        lesson={lesson(seg("s1", ["text", "audio"]), seg("s2", ["audio", "text"]))}
        plan={{
          lessonId: "l-1",
          segments: [{ segmentId: "s1", startModality: "audio" }],
        }}
      />,
    );
    expect(pressed()).toEqual(["Audio"]);

    next();
    // No plan row for s2: the section's first channel, as before the group.
    expect(pressed()).toEqual(["Text"]);
  });
});

describe("the activity, through the group (SCRUM-268)", () => {
  /** A live Osmosis section 4: text and an activity, read from the wire. */
  const activityLesson = (order: string[]) =>
    lessonFromContent({
      id: "l-1",
      title: "Osmosis",
      confirmationSummary: null,
      segments: [
        {
          id: "s4",
          segmentKey: "s4",
          contentType: "explanatory_text",
          sequenceOrder: 1,
          title: "Osmosis in a potato",
          body: "Water moves into the potato.",
          availableModalities: order,
          availableFormats: order,
          recommendedFormat: null,
          comprehensionCheckpoints: [],
          textVariant: null,
          visualVariant: null,
          audioVariant: null,
          interactiveVariant: {
            type: "activity",
            title: "Watch a potato change",
            introduction: null,
            materials: [],
            steps: [{ id: "a1", instruction: "Put a slice in salt water." }],
            outcome: "The slice goes soft.",
          },
          calculationVariant: null,
          needsReview: false,
          reviewReasons: [],
        },
      ],
    } as unknown as LessonDetailResponse)!;

  it("leaves the opening as it was: never the activity with nothing picked", () => {
    // Listed first, and named by the engine: the section still opens as it
    // did before the activity mapped (Lydia, 21 Oct - the opening is hers).
    render(
      <LessonPlayer
        lesson={activityLesson(["interactive", "text"])}
        plan={{
          lessonId: "l-1",
          segments: [{ segmentId: "s4", startModality: "interactive" }],
        }}
        live
      />,
    );

    expect(pressed()).toEqual(["Text"]);
    expect(pills()).toEqual(["Activity", "Text"]);
  });

  it("opens in it on a reload where the child picked it - the one exception (K4)", () => {
    const picked = activityLesson(["text", "interactive"]);
    picked.segments[0].chosen = { modality: "interactive" };
    render(<LessonPlayer lesson={picked} plan={null} live />);

    expect(pressed()).toEqual(["Activity"]);
    expect(
      screen.getByRole("heading", { name: "Watch a potato change" }),
    ).toBeInTheDocument();
  });

  it("reaches the child from a live lesson that lists it", () => {
    const detail = {
      id: "l-1",
      title: "Osmosis",
      confirmationSummary: null,
      segments: [
        {
          id: "s4",
          segmentKey: "s4",
          contentType: "explanatory_text",
          sequenceOrder: 1,
          title: "Osmosis in a potato",
          body: "Water moves into the potato.",
          availableModalities: ["text", "interactive"],
          availableFormats: ["text", "interactive"],
          recommendedFormat: null,
          comprehensionCheckpoints: [],
          textVariant: null,
          visualVariant: null,
          audioVariant: null,
          interactiveVariant: {
            type: "activity",
            title: "Watch a potato change",
            introduction: null,
            materials: [],
            steps: [{ id: "a1", instruction: "Put a slice in salt water." }],
            outcome: "The slice goes soft.",
          },
          calculationVariant: null,
          needsReview: false,
          reviewReasons: [],
        },
      ],
    } as unknown as LessonDetailResponse;
    render(<LessonPlayer lesson={lessonFromContent(detail)!} plan={null} live />);

    fireEvent.click(pill("Activity"));

    expect(
      screen.getByRole("heading", { name: "Watch a potato change" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Step 1: Put a slice in salt water." }),
    );
    expect(screen.getByText("The slice goes soft.")).toBeInTheDocument();
  });
});
