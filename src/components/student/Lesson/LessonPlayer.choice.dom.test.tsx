import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { ApiError } from "@/lib/api/client";
import { clearSession, setSession } from "@/lib/auth/session";
import type { AdaptationPlan, Lesson } from "@/lib/types";

/**
 * K4 - LYDIA'S RULING, 21 OCT: "A reload keeps the child's chosen version,
 * and that now covers format as well: text, audio, picture or activity.
 * Slower is included. ... The child's choice outranks the engine's
 * instruction for that segment ... It is scoped to the segment ... And it is
 * held server-side rather than in browser storage."
 *
 * So a pick goes to `PUT .../sessions/{sitting}/segments/{segment}/preferences`
 * for the backend's sitting, and a reload opens each section in what the
 * server holds for it, before the first frame.
 */

const SITTING = "4f1c2a9e-8b7d-4c3a-9e2f-1a2b3c4d5e6f";

const progress = vi.hoisted(() => ({
  report: vi.fn(),
  sessionId: null as string | null,
  completionSaved: false,
  completionFailed: false,
  saved: null as unknown,
  opened: null as unknown,
  localId: "local-1",
}));
vi.mock("@/hooks/useLessonProgress", () => ({
  useLessonProgress: () => ({ ...progress }),
}));

const { trackEvent, saveSegmentChoice } = vi.hoisted(() => ({
  trackEvent: vi.fn(),
  saveSegmentChoice: vi.fn(),
}));
vi.mock("@/lib/api/lessons", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/lessons")>();
  return {
    ...actual,
    lessonsApi: { ...actual.lessonsApi, saveSegmentChoice },
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks", () => ({
  useLesson: () => ({ setActiveLesson: vi.fn() }),
  useSignals: () => ({ trackEvent }),
}));
vi.mock("@/hooks/useRuntimeAdaptation", () => ({
  useRuntimeAdaptation: () => ({
    offeredBreak: null,
    reason: null,
    forSegmentId: null,
    plan: null,
  }),
}));
vi.mock("@/hooks/useScaffoldLevel", () => ({ useScaffoldLevel: () => null }));
vi.mock("@/hooks/useAssignmentNote", () => ({ useAssignmentNote: () => null }));
vi.mock("@/context/AccessibilityContext", () => ({
  useAccessibility: () => ({ textSize: "regular", reducedMotion: false }),
  TEXT_ZOOM: { regular: 1 },
}));

type Fmt = "text" | "audio" | "visual";

const seg = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  modalities: ["text", "audio", "visual"],
  formats: ["text", "audio", "visual"] as Fmt[],
  recommendedFormat: null,
  text: {
    heading: id,
    body: {
      default: `Standard ${id}.`,
      simplify: `Simple ${id}.`,
      expand: `Longer ${id}.`,
      slower: `Slow ${id}.`,
    },
  },
  audio: { title: id, transcript: `Transcript of ${id}.` },
  visual: {
    heading: id,
    illustration: { src: `https://cdn.example/${id}.png`, alt: `Picture of ${id}` },
  },
  ...extra,
});

const lesson = (...segments: ReturnType<typeof seg>[]): Lesson =>
  ({ id: "lesson-1", title: "Osmosis", segments }) as unknown as Lesson;

const TWO = lesson(seg("seg-1"), seg("seg-2"));

const group = () => screen.getByRole("group", { name: "Lesson format" });
const pill = (name: string) => within(group()).getByRole("button", { name });
const pressed = () =>
  within(group())
    .getAllByRole("button", { pressed: true })
    .map((b) => b.getAttribute("aria-label"));
const chip = (name: string) =>
  within(screen.getByRole("group", { name: "Lesson pacing" })).getByRole(
    "button",
    { name },
  );
const text = () => document.body.textContent ?? "";
const next = () => fireEvent.click(screen.getByRole("button", { name: "Next" }));
const prev = () =>
  fireEvent.click(screen.getByRole("button", { name: "Previous" }));
/** Lets a write's answer land. */
const settle = () => act(async () => {});

/** A write that waits until the test answers it. */
const held = () => {
  let answer!: (v: unknown) => void;
  let refuse!: (e: unknown) => void;
  saveSegmentChoice.mockImplementationOnce(
    () =>
      new Promise((res, rej) => {
        answer = res;
        refuse = rej;
      }),
  );
  return {
    answer: (v: unknown = { availableFormats: ["text", "audio", "visual"] }) =>
      act(async () => answer(v)),
    refuse: (e: unknown) => act(async () => refuse(e)),
  };
};

const conflict = (code: string) =>
  new ApiError(409, "Conflict", { detail: { code } });

const signIn = () =>
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    userId: "stu-1",
    role: "student",
  });

beforeEach(() => {
  progress.sessionId = SITTING;
  progress.opened = null;
  trackEvent.mockReset();
  saveSegmentChoice.mockReset();
  saveSegmentChoice.mockResolvedValue({ availableFormats: ["text"] });
  signIn();
});

afterEach(() => {
  cleanup();
  clearSession();
  vi.useRealTimers();
});

describe("a format the child picks is held on the server", () => {
  it("for the backend's sitting and the segment's own id, the format alone", async () => {
    render(<LessonPlayer lesson={TWO} plan={null} live />);

    fireEvent.click(pill("Audio"));
    await settle();

    expect(saveSegmentChoice).toHaveBeenCalledExactlyOnceWith(
      "lesson-1",
      SITTING,
      "seg-1",
      { modality: "audio" },
    );
  });

  it("shows the frame's 'One moment' while it is on its way, the picked pill selected", async () => {
    const write = held();
    render(<LessonPlayer lesson={TWO} plan={null} live />);

    fireEvent.click(pill("Audio"));
    await settle();

    expect(screen.getByRole("status")).toHaveTextContent("One moment");
    expect(pressed()).toEqual(["Audio"]);
    expect(group()).toHaveAttribute("aria-busy", "true");
    // The content holds its place, dimmed - nothing takes it over.
    expect(text()).toContain("Standard seg-1.");
    expect(
      screen.getByText("Standard seg-1.").closest(".opacity-45"),
    ).not.toBeNull();

    await write.answer();

    expect(screen.queryByRole("status")).toBeNull();
    expect(pressed()).toEqual(["Audio"]);
    expect(text()).not.toContain("Standard seg-1.");
    expect(document.querySelector(".opacity-45")).toBeNull();
  });

  it("stays put, and the format leaves the group, when the server says it is not there", async () => {
    const write = held();
    render(<LessonPlayer lesson={TWO} plan={null} live />);

    fireEvent.click(pill("Audio"));
    await settle();
    await write.refuse(conflict("format_unavailable"));

    expect(pressed()).toEqual(["Text"]);
    expect(text()).toContain("Standard seg-1.");
    expect(within(group()).queryByRole("button", { name: "Audio" })).toBeNull();
    // No message about it.
    expect(screen.queryByRole("status")).toBeNull();
    expect(text()).not.toMatch(/unavailable|isn't|not available|sorry/i);
  });

  it.each([
    ["a closed sitting", conflict("lesson_session_ended")],
    ["no connection", new ApiError(0, "offline")],
    ["a server fault", new ApiError(503, "down")],
  ])("goes on screen anyway after %s, with no message", async (_, cause) => {
    const write = held();
    render(<LessonPlayer lesson={TWO} plan={null} live />);

    fireEvent.click(pill("Picture"));
    await settle();
    await write.refuse(cause);

    expect(pressed()).toEqual(["Picture"]);
    expect(screen.getByRole("img", { name: "Picture of seg-1" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("goes on screen anyway when the server never answers", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    held();
    render(<LessonPlayer lesson={TWO} plan={null} live />);

    fireEvent.click(pill("Picture"));
    await settle();
    expect(screen.getByRole("status")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("img", { name: "Picture of seg-1" })).toBeInTheDocument();
  });

  it("is not written with no sitting yet, and shows at once", async () => {
    progress.sessionId = null;
    render(<LessonPlayer lesson={TWO} plan={null} live />);

    fireEvent.click(pill("Audio"));
    await settle();

    expect(saveSegmentChoice).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
    expect(pressed()).toEqual(["Audio"]);
  });

  it.each([
    ["a review", { review: true }],
    ["a finished lesson opened again", { finished: true }],
    ["the signed-out walkthrough", { live: false }],
  ])("is never written in %s", async (_, mode) => {
    render(<LessonPlayer lesson={TWO} plan={null} live {...mode} />);
    if ("review" in mode) {
      fireEvent.click(screen.getByRole("button", { name: "Begin review" }));
    }

    fireEvent.click(chip("Simplify"));
    fireEvent.click(pill("Audio"));
    await settle();

    // Both shown, neither written.
    expect(pressed()).toEqual(["Audio"]);

    expect(saveSegmentChoice).not.toHaveBeenCalled();
  });

  it("sends no manual-switch event of its own: the server writes that", async () => {
    render(<LessonPlayer lesson={TWO} plan={null} live />);

    fireEvent.click(pill("Audio"));
    await settle();

    expect(trackEvent.mock.calls.map(([t]) => t)).not.toContain(
      "modality_manual_switch",
    );
  });

  it("is a system-owned wait while it is on its way (SCRUM-94.9)", async () => {
    let now = 1_000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const write = held();
    render(<LessonPlayer lesson={TWO} plan={null} live />);

    fireEvent.click(pill("Audio"));
    await settle();
    now = 1_250;
    await write.answer();

    expect(
      trackEvent.mock.calls.filter(([t]) => t === "system_busy").map(([, p]) => p),
    ).toEqual([{ reason: "modality_switch", durationMs: 250 }]);
  });

  it("stays with its segment when the child moves on before it lands", async () => {
    const write = held();
    render(<LessonPlayer lesson={TWO} plan={null} live />);

    fireEvent.click(pill("Audio"));
    await settle();
    next();
    expect(screen.queryByRole("status")).toBeNull();
    await write.answer();

    // seg-2 is untouched; seg-1 opens in what was stored for it.
    expect(pressed()).toEqual(["Text"]);
    prev();
    expect(pressed()).toEqual(["Audio"]);
  });

  it("keeps nothing in the browser's storage", async () => {
    const keys = () => [
      ...Object.keys(window.localStorage),
      ...Object.keys(window.sessionStorage),
    ];
    const before = keys();
    render(<LessonPlayer lesson={TWO} plan={null} live />);

    fireEvent.click(pill("Audio"));
    fireEvent.click(pill("Text"));
    fireEvent.click(chip("Slower"));
    await settle();

    expect(keys()).toEqual(before);
    for (const k of keys()) {
      const v =
        window.localStorage.getItem(k) ?? window.sessionStorage.getItem(k) ?? "";
      expect(v).not.toMatch(/slower|audio|preferences/i);
    }
  });
});

describe("a pace the child picks is held on the server", () => {
  const writes = () => saveSegmentChoice.mock.calls.map((c) => c[3]);

  it("sends the depth, and a clear back to the standard text", async () => {
    render(<LessonPlayer lesson={TWO} plan={null} live />);

    fireEvent.click(chip("Simplify"));
    await settle();
    fireEvent.click(chip("Simplify"));
    await settle();

    expect(writes()).toEqual([{ depth: "simplified" }, { depth: null }]);
  });

  it("sends Slower on and off, off as a clear", async () => {
    render(<LessonPlayer lesson={TWO} plan={null} live />);

    fireEvent.click(chip("Slower"));
    await settle();
    fireEvent.click(chip("Slower"));
    await settle();

    expect(writes()).toEqual([{ slower: true }, { slower: null }]);
  });

  it("sends both halves when the pick moves between a depth and Slower", async () => {
    render(<LessonPlayer lesson={TWO} plan={null} live />);

    fireEvent.click(chip("Expand"));
    await settle();
    fireEvent.click(chip("Slower"));
    await settle();

    expect(writes()).toEqual([
      { depth: "expanded" },
      { depth: null, slower: true },
    ]);
  });

  it("switches at once, as the chips always have", async () => {
    held();
    render(<LessonPlayer lesson={TWO} plan={null} live />);

    fireEvent.click(chip("Simplify"));

    expect(text()).toContain("Simple seg-1.");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("goes back to the pace it had when the server refuses that version", async () => {
    const write = held();
    render(<LessonPlayer lesson={TWO} plan={null} live />);

    fireEvent.click(chip("Simplify"));
    await settle();
    await write.refuse(conflict("depth_unavailable"));

    expect(chip("Simplify")).toHaveAttribute("aria-pressed", "false");
    expect(text()).toContain("Standard seg-1.");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("is honoured on screen when the write fails any other way", async () => {
    const write = held();
    render(<LessonPlayer lesson={TWO} plan={null} live />);

    fireEvent.click(chip("Simplify"));
    await settle();
    await write.refuse(new ApiError(0, "offline"));

    expect(text()).toContain("Simple seg-1.");
  });
});

/**
 * TWO SCOPES (Lydia, 22 Oct: "depth holds for the lesson, format is per
 * section"; the server since 741685e). A section's `deliveryPreference`
 * carries its own format and the SITTING's depth and Slower as they take
 * effect there - `original` on a section with no approved rewrite, while
 * the sitting keeps the target. `POST /session`'s `segmentChoices` carry the
 * format alone, and its `lessonPreferences` the sitting's depth and Slower.
 */
const opened = (state: Record<string, unknown>) => ({
  sessionId: SITTING,
  resumed: true,
  deliveryState: {
    engineConfig: {},
    accommodations: [],
    capturedAt: "2026-10-22T14:00:00Z",
    ...state,
  },
});
let shownLesson: Lesson;
/** `POST /session` answers, a moment after the first frame. */
const lands = (
  view: ReturnType<typeof render>,
  state: Record<string, unknown>,
  props: Partial<Parameters<typeof LessonPlayer>[0]> = {},
) => {
  progress.opened = opened(state);
  view.rerender(
    <LessonPlayer lesson={shownLesson} plan={null} live {...props} />,
  );
};
const play = (
  l: Lesson,
  props: Partial<Parameters<typeof LessonPlayer>[0]> = {},
) => {
  shownLesson = l;
  return render(<LessonPlayer lesson={l} plan={null} live {...props} />);
};

describe("a reload opens each section in what the server holds", () => {
  /** Simplify for the sitting: every section with an approved rewrite shows it. */
  const simplified = lesson(
    seg("seg-1", { chosen: { modality: "audio", density: "simplify" } }),
    seg("seg-2", { chosen: { density: "simplify" } }),
    seg("seg-3", { chosen: { density: "simplify" } }),
  );

  it("in its chosen format, from the first frame", () => {
    play(simplified);

    expect(pressed()).toEqual(["Audio"]);
    expect(text()).not.toContain("Standard seg-1.");
  });

  it("over the engine's own format for it", () => {
    const plan: AdaptationPlan = {
      lessonId: "lesson-1",
      segments: [{ segmentId: "seg-1", startModality: "visual" }],
    };
    render(<LessonPlayer lesson={simplified} plan={plan} live />);

    expect(pressed()).toEqual(["Audio"]);
  });

  it("in the lesson's pace, from the first frame", () => {
    play(simplified, { startAt: 1 });

    expect(chip("Simplify")).toHaveAttribute("aria-pressed", "true");
    expect(text()).toContain("Simple seg-2.");
  });

  it("the format on its own section, the pace through the lesson", () => {
    play(simplified);

    next();
    expect(pressed()).toEqual(["Text"]);
    expect(text()).toContain("Simple seg-2.");
    next();
    expect(pressed()).toEqual(["Text"]);
    expect(text()).toContain("Simple seg-3.");
  });

  it("leaves a section with nothing chosen to open as it always has", () => {
    const plan: AdaptationPlan = {
      lessonId: "lesson-1",
      segments: [{ segmentId: "seg-3", startModality: "visual" }],
    };
    const stored = lesson(
      seg("seg-1", { chosen: { modality: "audio" } }),
      seg("seg-2"),
      seg("seg-3"),
    );
    render(<LessonPlayer lesson={stored} plan={plan} live startAt={2} />);

    expect(pressed()).toEqual(["Picture"]);
    expect(text()).not.toContain("Simple seg-3.");
  });

  it("but not a review or a finished lesson, whose sitting has ended", () => {
    render(<LessonPlayer lesson={simplified} plan={null} live finished />);
    expect(pressed()).toEqual(["Text"]);
    cleanup();

    render(<LessonPlayer lesson={simplified} plan={null} live review />);
    fireEvent.click(screen.getByRole("button", { name: "Begin review" }));
    expect(pressed()).toEqual(["Text"]);
    expect(text()).toContain("Standard seg-1.");
  });

  it("nor the rerouted sitting 'Let's try it another way' opens", () => {
    play(simplified, { depth: "standard" });

    expect(pressed()).toEqual(["Text"]);
    next();
    expect(text()).toContain("Standard seg-2.");
  });

  it("a section showing the standard text for want of an approved rewrite does not clear the lesson's pace", () => {
    // seg-1 has no Simplify of its own, so the server reads `original` there.
    const l = lesson(
      seg("seg-1", {
        chosen: { density: null },
        text: {
          heading: "seg-1",
          body: { default: "Standard seg-1.", slower: "Slow seg-1." },
        },
      }),
      seg("seg-2", { chosen: { density: "simplify" } }),
    );
    play(l);

    expect(text()).toContain("Standard seg-1.");
    next();
    expect(chip("Simplify")).toHaveAttribute("aria-pressed", "true");
    expect(text()).toContain("Simple seg-2.");
  });
});

describe("the sitting's word, as POST /session lands (741685e)", () => {
  const four = () =>
    lesson(
      seg("seg-1", { chosen: { density: "simplify" } }),
      seg("seg-2", { chosen: { density: "simplify" } }),
      seg("seg-3", { chosen: { density: "simplify" } }),
      seg("seg-4"),
    );

  it.each([
    ["with the sitting's Simplify", { lessonPreferences: { depth: "simplified", slower: null } }],
    ["from a server that sends no lessonPreferences", {}],
  ])(
    "keeps the read's Simplify on sections 1-3 when segmentChoices carry only the format, %s",
    (_, prefs) => {
      const view = play(four());
      expect(text()).toContain("Simple seg-1.");

      lands(view, {
        segmentChoices: {
          "seg-1": { modality: "text", updatedAt: "2026-10-22T13:59:00Z" },
          "seg-2": { modality: "text", updatedAt: "2026-10-22T13:59:00Z" },
          "seg-3": { modality: "text", updatedAt: "2026-10-22T13:59:00Z" },
        },
        ...prefs,
      });

      expect(text()).toContain("Simple seg-1.");
      next();
      expect(chip("Simplify")).toHaveAttribute("aria-pressed", "true");
      expect(text()).toContain("Simple seg-2.");
      next();
      expect(text()).toContain("Simple seg-3.");
      next();
      expect(text()).toContain("Simple seg-4.");
    },
  );

  it.each([
    ["Expand", { depth: "expanded", slower: null }, "Longer seg-2."],
    ["Slower", { depth: null, slower: true }, null],
  ])(
    "takes the sitting's %s as the lesson's pace from its lessonPreferences",
    (name, lessonPreferences, shown) => {
      // A read that shows no pace - the sitting's word is all there is.
      const view = play(lesson(seg("seg-1"), seg("seg-2"), seg("seg-3")));

      lands(view, { segmentChoices: {}, lessonPreferences });

      // The section on screen is not flipped under the child (rule 7).
      expect(text()).toContain("Standard seg-1.");
      expect(chip(name)).toHaveAttribute("aria-pressed", "false");
      next();
      expect(chip(name)).toHaveAttribute("aria-pressed", "true");
      if (shown) expect(text()).toContain(shown);
      // And on the section that was on screen, once it is opened again.
      prev();
      expect(chip(name)).toHaveAttribute("aria-pressed", "true");
    },
  );

  it("wins over the read's pace from the next section on: a new sitting inherits nothing", () => {
    const view = play(four());

    lands(view, { segmentChoices: {}, lessonPreferences: {} });

    expect(text()).toContain("Simple seg-1.");
    expect(chip("Simplify")).toHaveAttribute("aria-pressed", "true");
    next();
    expect(chip("Simplify")).toHaveAttribute("aria-pressed", "false");
    expect(text()).toContain("Standard seg-2.");
  });

  it("keeps the format per section: the sitting's own for each, none carried", async () => {
    const view = play(
      lesson(
        seg("seg-1", { chosen: { modality: "audio" } }),
        seg("seg-2"),
        seg("seg-3"),
      ),
    );

    lands(view, {
      segmentChoices: {
        "seg-1": { modality: "visual" },
        "seg-3": { modality: "visual" },
      },
      lessonPreferences: { depth: "simplified", slower: null },
    });

    // seg-1 is on screen: not flipped.
    expect(pressed()).toEqual(["Audio"]);
    next();
    expect(pressed()).toEqual(["Text"]);
    expect(text()).toContain("Simple seg-2.");
    fireEvent.click(pill("Audio"));
    await settle();
    next();
    expect(pressed()).toEqual(["Picture"]);
    prev();
    expect(pressed()).toEqual(["Audio"]);
  });

  it("never overrides a pace the child picked before it landed", () => {
    progress.sessionId = null;
    const view = play(lesson(seg("seg-1"), seg("seg-2")));

    fireEvent.click(chip("Expand"));
    lands(view, {
      segmentChoices: {},
      lessonPreferences: { depth: "simplified", slower: null },
    });

    expect(text()).toContain("Longer seg-1.");
    next();
    expect(chip("Expand")).toHaveAttribute("aria-pressed", "true");
    expect(text()).toContain("Longer seg-2.");
  });
});

describe("a pace picked after a reload is the lesson's", () => {
  const writes = () => saveSegmentChoice.mock.calls.map((c) => c[3]);

  it("holds on every section, over the pace the read showed on each", () => {
    play(
      lesson(
        seg("seg-1", { chosen: { density: "simplify" } }),
        seg("seg-2", { chosen: { density: "simplify" } }),
      ),
    );

    fireEvent.click(chip("Expand"));
    next();

    expect(chip("Expand")).toHaveAttribute("aria-pressed", "true");
    expect(text()).toContain("Longer seg-2.");
  });

  it("is written against the sitting's pace, not what one section showed", async () => {
    // seg-1 shows the standard text for want of a Simplify rewrite, while the
    // sitting holds Simplify: Slower must clear that depth for the lesson.
    play(
      lesson(
        seg("seg-1", {
          chosen: { density: null },
          text: {
            heading: "seg-1",
            body: { default: "Standard seg-1.", slower: "Slow seg-1." },
          },
        }),
        seg("seg-2", { chosen: { density: "simplify" } }),
      ),
    );

    fireEvent.click(chip("Slower"));
    await settle();

    expect(writes()).toEqual([{ depth: null, slower: true }]);
  });
});
