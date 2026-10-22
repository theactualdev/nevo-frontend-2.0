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
import type { SegmentChoice } from "@/lib/api/lessons";
import { chosenFrom } from "@/lib/lessons/segmentChoice";
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

describe("a reload opens each section in what the server holds for it", () => {
  const stored = lesson(
    seg("seg-1", { chosen: { modality: "audio" } }),
    seg("seg-2", { chosen: { density: "simplify" } }),
    seg("seg-3"),
  );

  it("in its chosen format, from the first frame", () => {
    render(<LessonPlayer lesson={stored} plan={null} live />);

    expect(pressed()).toEqual(["Audio"]);
    expect(text()).not.toContain("Standard seg-1.");
  });

  it("over the engine's own format for it", () => {
    const plan: AdaptationPlan = {
      lessonId: "lesson-1",
      segments: [{ segmentId: "seg-1", startModality: "visual" }],
    };
    render(<LessonPlayer lesson={stored} plan={plan} live />);

    expect(pressed()).toEqual(["Audio"]);
  });

  it("in its chosen pace, from the first frame", () => {
    render(<LessonPlayer lesson={stored} plan={null} live startAt={1} />);

    expect(chip("Simplify")).toHaveAttribute("aria-pressed", "true");
    expect(text()).toContain("Simple seg-2.");
  });

  it("and each section in its own: none carries to the next", () => {
    render(<LessonPlayer lesson={stored} plan={null} live />);

    next();
    expect(pressed()).toEqual(["Text"]);
    expect(text()).toContain("Simple seg-2.");
    next();
    expect(pressed()).toEqual(["Text"]);
    expect(text()).toContain("Standard seg-3.");
  });

  it("leaves a section with nothing chosen to open as it always has", () => {
    const plan: AdaptationPlan = {
      lessonId: "lesson-1",
      segments: [{ segmentId: "seg-3", startModality: "visual" }],
    };
    render(<LessonPlayer lesson={stored} plan={plan} live startAt={2} />);

    expect(pressed()).toEqual(["Picture"]);
  });

  it("but not a review or a finished lesson, whose sitting has ended", () => {
    render(<LessonPlayer lesson={stored} plan={null} live finished />);
    expect(pressed()).toEqual(["Text"]);
    cleanup();

    render(<LessonPlayer lesson={stored} plan={null} live review />);
    fireEvent.click(screen.getByRole("button", { name: "Begin review" }));
    expect(pressed()).toEqual(["Text"]);
  });

  it("nor the rerouted sitting 'Let's try it another way' opens", () => {
    render(<LessonPlayer lesson={stored} plan={null} live depth="standard" />);

    expect(pressed()).toEqual(["Text"]);
  });

  it("takes the sitting's own word for the sections after the one on screen", () => {
    const view = render(<LessonPlayer lesson={stored} plan={null} live />);
    expect(pressed()).toEqual(["Audio"]);

    // `POST /session` answers: the sitting holds Picture for seg-1 and
    // Expand for seg-3, and nothing for seg-2.
    progress.opened = {
      sessionId: SITTING,
      resumed: true,
      deliveryState: {
        engineConfig: {},
        accommodations: [],
        capturedAt: "2026-10-21T10:00:00Z",
        segmentChoices: {
          "seg-1": { modality: "visual" },
          "seg-3": { depth: "expanded" },
        },
      },
    };
    view.rerender(<LessonPlayer lesson={stored} plan={null} live />);

    // The section on screen is not flipped under the child.
    expect(pressed()).toEqual(["Audio"]);
    next();
    expect(text()).toContain("Standard seg-2.");
    next();
    expect(text()).toContain("Longer seg-3.");
  });

  it("never changes the version on screen as the sitting's word lands", () => {
    const view = render(
      <LessonPlayer lesson={stored} plan={null} live startAt={1} />,
    );
    expect(text()).toContain("Simple seg-2.");

    progress.opened = {
      sessionId: SITTING,
      resumed: true,
      deliveryState: {
        engineConfig: {},
        accommodations: [],
        capturedAt: "2026-10-21T10:00:00Z",
        segmentChoices: { "seg-2": { depth: "expanded" } },
      },
    };
    view.rerender(
      <LessonPlayer lesson={stored} plan={null} live startAt={1} />,
    );

    expect(text()).toContain("Simple seg-2.");
    expect(chip("Simplify")).toHaveAttribute("aria-pressed", "true");
  });
});

/*
 * A PACE PICK STAYS ON ITS OWN SECTION. Lydia, 21 Oct, her newest written
 * rule: the choice "is scoped to the segment, so a choice on one segment
 * does not carry to the next". That is what the server holds, too, so a
 * visit and a reload open every section the same. It replaces the carry
 * through the lesson (17 Oct: "holds for the lesson and resets after"),
 * which showed a pace on the next section that a reload then took away. The
 * hub has asked her to confirm; the demo does not hold on it.
 */
describe("a pace pick stays on its own section", () => {
  const PACES = [
    ["Simplify", "Simple"],
    ["Expand", "Longer"],
    ["Slower", "Slow"],
  ] as const;
  const VERSIONS = ["Standard", "Simple", "Longer", "Slow"];
  const pacing = () =>
    within(screen.getByRole("group", { name: "Lesson pacing" })).getAllByRole(
      "button",
    );
  /** The pacing chips that are on, navy or violet. */
  const chipsOn = () =>
    pacing()
      .filter((b) => b.getAttribute("aria-pressed") === "true")
      .map((b) => b.textContent);
  /** Which version of a section's text is on screen, and the chips that are on. */
  const onScreen = (id: string) => ({
    version: VERSIONS.filter((v) => text().includes(`${v} ${id}.`)),
    chips: chipsOn(),
  });

  it.each(PACES)(
    "%s on section 1, then Next: section 2 opens in the standard text, its chips off",
    async (name, word) => {
      render(<LessonPlayer lesson={TWO} plan={null} live />);
      fireEvent.click(chip(name));
      await settle();
      expect(text()).toContain(`${word} seg-1.`);

      next();

      expect(onScreen("seg-2")).toEqual({ version: ["Standard"], chips: [] });
      // Nothing is held for section 2: the pick was made on section 1 alone.
      expect(saveSegmentChoice.mock.calls.map((c) => c[2])).toEqual(["seg-1"]);
    },
  );

  it.each(PACES)(
    "%s is still on when the child comes back to section 1",
    async (name, word) => {
      render(<LessonPlayer lesson={TWO} plan={null} live />);
      fireEvent.click(chip(name));
      await settle();
      next();
      expect(chip(name)).toHaveAttribute("aria-pressed", "false");

      prev();

      expect(onScreen("seg-1")).toEqual({ version: [word], chips: [name] });
    },
  );

  it.each(PACES)(
    "%s: a visit and a reload open both sections the same",
    async (name) => {
      render(<LessonPlayer lesson={TWO} plan={null} live />);
      fireEvent.click(chip(name));
      await settle();
      const visit1 = onScreen("seg-1");
      next();
      const visit2 = onScreen("seg-2");
      prev();
      expect(onScreen("seg-1")).toEqual(visit1);

      // What the server now holds for each section, as the lesson read
      // brings it back after a reload: the pick for section 1, and nothing
      // for section 2.
      const held = new Map(
        saveSegmentChoice.mock.calls.map((c) => [
          c[2] as string,
          chosenFrom(c[3] as SegmentChoice),
        ]),
      );
      const reloaded = lesson(
        seg("seg-1", { chosen: held.get("seg-1") }),
        seg("seg-2", { chosen: held.get("seg-2") }),
      );
      cleanup();
      render(<LessonPlayer lesson={reloaded} plan={null} live />);
      expect(onScreen("seg-1")).toEqual(visit1);
      next();
      expect(onScreen("seg-2")).toEqual(visit2);

      // And a reload while on section 2 opens it as the visit showed it.
      cleanup();
      render(<LessonPlayer lesson={reloaded} plan={null} live startAt={1} />);
      expect(onScreen("seg-2")).toEqual(visit2);
    },
  );

  it("leaves the engine's own density on the next section as it was (D23)", async () => {
    // The violet chip is the engine's instruction, not a pick: it reaches
    // section 2 whatever the child picked on section 1, and alone.
    const plan: AdaptationPlan = {
      lessonId: "lesson-1",
      segments: [{ segmentId: "seg-2", startModality: "text", density: "expand" }],
    };
    render(<LessonPlayer lesson={TWO} plan={plan} live />);
    fireEvent.click(chip("Simplify"));
    await settle();

    next();

    expect(onScreen("seg-2")).toEqual({ version: ["Longer"], chips: ["Expand"] });
    expect(chip("Expand").className).toMatch(/bg-nevo-violet/);
  });
});
