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
import { LESSON_STATUS } from "@/lib/api/lessons";
import { clearSession, setSession } from "@/lib/auth/session";
import type { Lesson } from "@/lib/types";

/**
 * A FINISHED LESSON REOPENS IN TESLIM'S REVIEW MODE (21 Oct; SCRUM-275 #3
 * with SCRUM-146).
 *
 * `POST /session` on a completed lesson hands back the completed sitting with
 * `reviewMode: true` and `segmentPosition: 0`, and the lesson stays completed.
 * His ask: "use review mode rather than sending in-lesson adaptation calls
 * against that ended sitting". The player takes the sitting as a finished
 * lesson reopened (D22) - `finished`, not 37d's spaced-retrieval `review`.
 *
 * The runtime hook is the real one here, so what is asked of the engine is
 * what the player would really ask; only the network and the session open
 * are stood in for.
 */

const SITTING = "5b1e0c3a-aaaa-4bbb-8ccc-ddddeeeeffff";

const { getAdaptation, saveSegmentChoice, push, progress } = vi.hoisted(
  () => ({
    getAdaptation: vi.fn(),
    saveSegmentChoice: vi.fn(),
    push: vi.fn(),
    progress: {
      report: vi.fn(),
      sessionId: null as string | null,
      completionSaved: false,
      completionFailed: false,
      saved: null as unknown,
      opened: null as unknown,
      unavailable: false,
      localId: "local-1",
    },
  }),
);

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  intelligenceApi: { getAdaptation },
}));
vi.mock("@/lib/api/lessons", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/lessons")>();
  return {
    ...actual,
    lessonsApi: { ...actual.lessonsApi, saveSegmentChoice },
  };
});
vi.mock("@/hooks", () => ({
  useLesson: () => ({ setActiveLesson: vi.fn() }),
  useSignals: () => ({ trackEvent: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks/useLessonProgress", () => ({
  useLessonProgress: () => ({ ...progress }),
}));
vi.mock("@/context/AccessibilityContext", () => ({
  useAccessibility: () => ({ textSize: "regular", reducedMotion: false }),
  TEXT_ZOOM: { regular: 1 },
}));
vi.mock("@/hooks/useScaffoldLevel", () => ({ useScaffoldLevel: () => null }));
vi.mock("@/hooks/useAssignmentNote", () => ({ useAssignmentNote: () => null }));

const segment = (id: string, heading: string) => ({
  id,
  modalities: ["text", "audio"],
  formats: ["text", "audio"],
  recommendedFormat: null,
  text: { heading, body: { default: `Body of ${heading}.` } },
  audio: { title: heading, transcript: `Transcript of ${heading}.` },
});

const LESSON = {
  id: "9c1e77aa-1111-4222-8333-444455556666",
  title: "Osmosis",
  segments: [
    segment("seg-1", "Water moves"),
    segment("seg-2", "Membranes"),
    segment("seg-3", "Concentration"),
  ],
} as unknown as Lesson;
const SEGMENTS = LESSON.segments.map((s) => ({
  id: s.id,
  segmentType: "explanation" as const,
  availableModalities: ["text", "audio"],
}));

const answer = {
  lessonId: LESSON.id,
  source: "rule_based",
  segments: [],
  breakSuggestion: { breakType: null, reason: null },
  proactiveAdjustment: null,
  modalitySuggestion: null,
};

/** What `POST /session` answers on a completed lesson (acc5b27). */
const REVIEW_SITTING = {
  sessionId: SITTING,
  resumed: true,
  reviewMode: true,
  reviewOfSessionId: SITTING,
  completedAt: "2026-10-21T15:00:00Z",
  segmentPosition: 0,
  depth: "standard",
};

type Props = Partial<Parameters<typeof LessonPlayer>[0]>;
const player = (props: Props = {}) => (
  <LessonPlayer
    lesson={LESSON}
    plan={null}
    live
    adaptSegments={SEGMENTS}
    {...props}
  />
);

/** The 201 lands: the sitting, and what the server said about it. */
const sessionOpens = (
  view: ReturnType<typeof render>,
  opened: Record<string, unknown>,
  props: Props = {},
) => {
  progress.sessionId = SITTING;
  progress.opened = opened;
  view.rerender(player(props));
};

const heading = () => screen.getByRole("heading", { level: 2 }).textContent;
const next = () => fireEvent.click(screen.getByRole("button", { name: "Next" }));
const statuses = () => progress.report.mock.calls.map((c) => c[0]);
/** Past the microtask the runtime hook builds its request in. */
const settle = () => act(async () => {});

beforeEach(() => {
  setSession({
    token: "tok-test",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId: "student-1",
    role: "student",
  });
  getAdaptation.mockResolvedValue(answer);
  saveSegmentChoice.mockResolvedValue({ availableFormats: ["text", "audio"] });
});

afterEach(() => {
  cleanup();
  clearSession();
  getAdaptation.mockReset();
  saveSegmentChoice.mockReset();
  push.mockReset();
  progress.report.mockReset();
  progress.sessionId = null;
  progress.opened = null;
  progress.unavailable = false;
});

describe("a review sitting (reviewMode: true)", () => {
  it("is never asked about in_lesson, at the opening or as the child moves", async () => {
    const view = render(player());
    sessionOpens(view, REVIEW_SITTING);
    await settle();
    next();
    await settle();

    expect(getAdaptation).not.toHaveBeenCalled();
  });

  it("writes nothing that would demote the lesson as the child moves through it", async () => {
    const view = render(player());
    sessionOpens(view, REVIEW_SITTING);
    progress.report.mockClear();

    next();
    fireEvent.click(screen.getByRole("button", { name: "Exit lesson" }));
    fireEvent.click(screen.getByRole("button", { name: /leave for now/i }));

    expect(statuses()).not.toContain(LESSON_STATUS.IN_PROGRESS);
    expect(statuses()).not.toContain(LESSON_STATUS.EXITED);
  });

  it("holds no choice on the ended sitting", async () => {
    const view = render(player());
    sessionOpens(view, REVIEW_SITTING);

    fireEvent.click(
      within(screen.getByRole("group", { name: "Lesson format" })).getByRole(
        "button",
        { name: "Audio" },
      ),
    );
    await settle();

    expect(saveSegmentChoice).not.toHaveBeenCalled();
  });

  it("is still asked about for an ordinary sitting", async () => {
    // The other half: without it, a hook that never asked would pass above.
    const view = render(player());
    sessionOpens(view, { ...REVIEW_SITTING, reviewMode: false });

    await vi.waitFor(() => expect(getAdaptation).toHaveBeenCalledTimes(1));
    expect(getAdaptation.mock.calls[0]![2]).toMatchObject({
      mode: "in_lesson",
      sessionId: SITTING,
    });
  });
});

describe("a finished lesson reopened (the dashboard said so)", () => {
  it("asks the engine nothing in_lesson against its sitting", async () => {
    // Before acc5b27 the sitting was not even marked review, and every ask
    // the player made against it was refused 409 `lesson_session_required`.
    const view = render(player({ finished: true }));
    sessionOpens(view, { sessionId: SITTING, resumed: true }, { finished: true });
    await settle();
    next();
    await settle();

    expect(getAdaptation).not.toHaveBeenCalled();
  });

  it("opens at the top, never at its saved place (D22, D100)", () => {
    render(player({ finished: true, startAt: 2 }));

    expect(heading()).toBe("Water moves");
  });

  it("while a lesson still to do opens where the child left it", () => {
    render(player({ startAt: 2 }));

    expect(heading()).toBe("Concentration");
  });
});

describe("a completed lesson with no sitting to reopen (409 completed_session_unavailable)", () => {
  it("is frame 28's nothing-state, with its one way back and no retry", () => {
    const view = render(player({ finished: true }));
    progress.unavailable = true;
    view.rerender(player({ finished: true }));

    expect(
      screen.getByRole("heading", { name: "We couldn't open that lesson." }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByText(/try again/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Back to lessons" }));
    expect(push).toHaveBeenCalledWith("/student/lessons");
  });

  it("is not drawn while the session simply has not answered", () => {
    render(player({ finished: true }));

    expect(screen.queryByText("We couldn't open that lesson.")).toBeNull();
    expect(heading()).toBe("Water moves");
  });
});
