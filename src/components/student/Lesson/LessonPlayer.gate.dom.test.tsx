import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { GIVES_WAY_AFTER_MS, RECOVERY_LINE } from "./QuickCheckSheet";
import { clearSession, setSession } from "@/lib/auth/session";
import type { CalculationVariant } from "@/lib/api/variants";
import { calculationFromVariant } from "@/lib/lessons/fromContent";
import type { Lesson } from "@/lib/types";

/**
 * SCRUM-282: A MISS IS HELD, GIVES WAY, AND THE SECTION OFFERS ITS OTHER WAYS
 * IN - on every check (Olayinka, 26 Oct), ahead of the server's own gate.
 *
 * Lydia, 23 Oct: a missed check no longer moves the child on; the section is
 * offered another way, in place, and they move on once they have got it.
 * The player holds every check (Olayinka, 25 Oct; Lydia, 26 Oct). The server
 * says which ways in the section has (`reteaching`), on the miss's own reply
 * since Teslim's cdba131 - gate on or off.
 */

const SESSION = "4f1c2a9e-8b7d-4c3a-9e2f-1a2b3c4d5e6f";
const SEG_1 = "0b9d6c1e-2f3a-4b5c-8d7e-6f5a4b3c2d1e";
const SEG_2 = "7a6b5c4d-3e2f-4a1b-9c8d-7e6f5a4b3c2d";

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

const api = vi.hoisted(() => ({
  comprehension: vi.fn(),
  saveAttempt: vi.fn(),
  saveSegmentChoice: vi.fn(),
  attempts: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks", () => ({
  useLesson: () => ({ setActiveLesson: vi.fn() }),
  useSignals: () => ({ trackEvent: vi.fn() }),
}));
vi.mock("@/hooks/useRuntimeAdaptation", () => ({
  useRuntimeAdaptation: () => ({ offeredBreak: null, reason: null, plan: null }),
}));
vi.mock("@/hooks/useScaffoldLevel", () => ({ useScaffoldLevel: () => null }));
vi.mock("@/hooks/useAssignmentNote", () => ({
  useAssignmentNote: () => null,
}));
vi.mock("@/lib/api/lessons", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/lessons")>();
  return {
    ...actual,
    lessonsApi: {
      ...actual.lessonsApi,
      comprehension: (...a: unknown[]) => api.comprehension(...a),
      saveAttempt: (...a: unknown[]) => api.saveAttempt(...a),
      saveSegmentChoice: (...a: unknown[]) => api.saveSegmentChoice(...a),
      attempts: (...a: unknown[]) => api.attempts(...a),
    },
  };
});
vi.mock("@/context/AccessibilityContext", () => ({
  useAccessibility: () => ({ textSize: "regular", reducedMotion: false }),
  TEXT_ZOOM: { regular: 1 },
}));

const QUICK_CHECK = {
  id: "cp-inline",
  question: "Which number is on top?",
  options: [
    { id: "a", label: "The numerator", value: "a" },
    { id: "b", label: "The denominator", value: "b" },
  ],
  correctId: "a",
  correctNote: "Yes.",
  recoveryNote: "Not quite.",
  conceptId: "concept-1",
};

const LESSON = {
  id: "lesson-1",
  title: "Fractions Lesson 3",
  segments: [
    {
      id: SEG_1,
      modalities: ["text", "visual"],
      text: {
        heading: "Numerators",
        body: {
          default: "The number on top is the numerator.",
          simplify: "The top number.",
          slower: "The number on top.",
        },
      },
      visual: {
        heading: "Numerators",
        illustration: { src: "https://cdn.example/n.png", alt: "Picture of a fraction" },
      },
      quickCheck: QUICK_CHECK,
    },
    {
      id: SEG_2,
      modalities: ["text"],
      text: { heading: "Denominators", body: { default: "Below the line." } },
    },
  ],
} as unknown as Lesson;

const route = (action: string, format?: string) => ({
  action,
  label: `server words for ${action}`,
  ...(format ? { format } : {}),
});
const RETEACHING = {
  questionId: "cp-inline",
  segmentId: SEG_1,
  availableRoutes: [
    route("format", "visual"),
    // This section has no recording: never named.
    route("format", "audio"),
    route("simplify"),
    route("simpler_presentation"),
    route("slower"),
    route("rechunk"),
    route("panel"),
  ],
  recommendedRoute: route("format", "visual"),
  presentation: { density: "low", itemsPerScreen: 1, pacing: "slow" },
  screens: [],
};
const GATE_ON = { required: true, canAdvance: false, segmentId: SEG_1 };
const GATE_OFF = { required: false, canAdvance: true };

/** The server's reply to an answer, marked. */
const reply = (
  correct: boolean,
  gate: Record<string, unknown> | null,
  reteaching?: unknown,
) => ({
  id: "att-1",
  lessonId: "lesson-1",
  sessionId: SESSION,
  questionId: "cp-inline",
  segmentId: SEG_1,
  source: "checkpoint",
  attemptNumber: 1,
  answer: correct ? "a" : "b",
  correct,
  submittedAt: "2026-10-25T12:00:00Z",
  ...(gate ? { comprehensionGate: gate } : {}),
  ...(reteaching !== undefined ? { reteaching } : {}),
});

const next = () =>
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
const card = () => screen.queryByText("Let's try this another way.");
const ways = () =>
  screen
    .queryAllByRole("button")
    .filter((b) =>
      /^(See it as a picture|Listen to it|Try it yourself|A simpler version|One step at a time)$/.test(
        b.getAttribute("aria-label") ?? "",
      ),
    );

/** Open the lesson with its sitting open, and let the gate's read land. */
const open = async (props: Record<string, unknown> = {}) => {
  progress.opened = { sessionId: SESSION, resumed: true };
  render(<LessonPlayer lesson={LESSON} plan={null} live {...props} />);
  await act(async () => {});
};

/** Miss the check, and wait for the sheet to give way. */
const missAndWait = async () => {
  next();
  fireEvent.click(await screen.findByRole("button", { name: /The denominator/ }));
  await act(async () => {});
};

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    userId: "stu-1",
    role: "student",
  });
  progress.report.mockReset();
  progress.sessionId = SESSION;
  progress.saved = null;
  progress.opened = null;
  api.comprehension.mockReset().mockResolvedValue(GATE_OFF);
  api.saveAttempt.mockReset().mockResolvedValue(reply(false, GATE_OFF));
  api.saveSegmentChoice.mockReset().mockResolvedValue({});
  api.attempts.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  clearSession();
});

describe("on every check, whatever the server's gate", () => {
  it("asks where the gate stands once, as the sitting opens", async () => {
    await open();

    expect(api.comprehension).toHaveBeenCalledOnce();
    expect(api.comprehension).toHaveBeenCalledWith("lesson-1", SESSION);
  });

  it("holds a miss, gives way, and offers the ways in the miss's own reply names - the gate off", async () => {
    api.saveAttempt.mockResolvedValue(reply(false, GATE_OFF, RETEACHING));
    await open();
    await missAndWait();

    expect(screen.getByRole("status").textContent).toBe(RECOVERY_LINE);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), {
      timeout: GIVES_WAY_AFTER_MS + 2000,
    });
    expect(card()).toBeInTheDocument();
    expect(ways().map((b) => b.getAttribute("aria-label"))).toEqual([
      "See it as a picture",
      "A simpler version",
      "One step at a time",
    ]);
  });

  it("reads the reply's own re-teaching before the gate's (Teslim, cdba131)", async () => {
    api.saveAttempt.mockResolvedValue(
      reply(
        false,
        {
          ...GATE_ON,
          reteaching: { ...RETEACHING, availableRoutes: [route("slower")], recommendedRoute: route("slower") },
        },
        RETEACHING,
      ),
    );
    await open();
    await missAndWait();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), {
      timeout: GIVES_WAY_AFTER_MS + 2000,
    });

    // The reply's three ways, not the gate's one.
    expect(ways()).toHaveLength(3);
  });

  it("holds the miss and draws no card when the reply names no ways in (rule 5)", async () => {
    api.comprehension.mockRejectedValue(new Error("offline"));
    api.saveAttempt.mockResolvedValue(reply(false, null));
    await open();
    await missAndWait();

    expect(screen.getByRole("status").textContent).toBe(RECOVERY_LINE);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(card()).toBeNull();
  });

  it("takes no ways in from a right answer's reply", async () => {
    api.saveAttempt.mockResolvedValue(reply(true, GATE_OFF, RETEACHING));
    await open();
    next();
    fireEvent.click(await screen.findByRole("button", { name: /The numerator/ }));
    await act(async () => {});

    expect(card()).toBeNull();
  });

  it("takes no ways in from an unmarkable answer's reply, which is never a miss", async () => {
    api.saveAttempt.mockResolvedValue({
      ...reply(false, GATE_OFF, RETEACHING),
      correct: null,
    });
    await open();
    await missAndWait();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), {
      timeout: GIVES_WAY_AFTER_MS + 2000,
    });

    expect(card()).toBeNull();
  });

  /*
   * LYDIA, 26 OCT, D3: "A child looking at a picture who still has not got it
   * should not have a route taken away from them. Simplify gives them the
   * simpler text and the picture stays one tap away rather than being
   * replaced." And D2: the text is "Try it as text".
   */
  it("offers Simplify and Slower over a picture, and a simpler version brings the simpler text", async () => {
    api.saveAttempt.mockResolvedValue(reply(false, GATE_OFF, RETEACHING));
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Picture" }));
    expect(
      await screen.findByRole("img", { name: "Picture of a fraction" }),
    ).toBeInTheDocument();
    await missAndWait();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), {
      timeout: GIVES_WAY_AFTER_MS + 2000,
    });

    expect(ways().map((b) => b.getAttribute("aria-label"))).toEqual([
      "See it as a picture",
      "A simpler version",
      "One step at a time",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "A simpler version" }));

    expect(await screen.findByText("The top number.")).toBeInTheDocument();
    expect(api.saveSegmentChoice).toHaveBeenCalledWith(
      "lesson-1",
      SESSION,
      SEG_1,
      { modality: "text" },
    );
    // The picture one tap away, not taken.
    expect(screen.getByRole("button", { name: "Picture" })).toBeInTheDocument();
  });

  it("names the text \"Try it as text\", and taking it brings the text", async () => {
    api.saveAttempt.mockResolvedValue(
      reply(false, GATE_OFF, {
        ...RETEACHING,
        availableRoutes: [route("format", "text")],
        recommendedRoute: route("format", "text"),
      }),
    );
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Picture" }));
    await screen.findByRole("img", { name: "Picture of a fraction" });
    await missAndWait();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), {
      timeout: GIVES_WAY_AFTER_MS + 2000,
    });

    fireEvent.click(screen.getByRole("button", { name: "Try it as text" }));

    expect(
      await screen.findByText("The number on top is the numerator."),
    ).toBeInTheDocument();
  });

  it("opens on no ways in when the sitting's read says the gate is off, whatever it carries", async () => {
    api.comprehension.mockResolvedValue({ ...GATE_OFF, reteaching: RETEACHING });
    await open();

    expect(card()).toBeNull();
  });
});

describe("with the gate on", () => {
  beforeEach(() => {
    api.comprehension.mockResolvedValue(GATE_ON);
    api.saveAttempt.mockResolvedValue(
      reply(false, { ...GATE_ON, reteaching: RETEACHING }),
    );
  });

  it("holds a miss without a verdict, then gives way to the ways in, in place", async () => {
    await open();
    await missAndWait();

    expect(screen.getByRole("status").textContent).toBe(RECOVERY_LINE);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), {
      timeout: GIVES_WAY_AFTER_MS + 2000,
    });
    expect(card()).toBeInTheDocument();
    // Only what this section can serve, in the frame's words: no recording,
    // and nothing named for re-chunking or the panel.
    expect(ways().map((b) => b.getAttribute("aria-label"))).toEqual([
      "See it as a picture",
      "A simpler version",
      "One step at a time",
    ]);
    expect(
      screen.getByRole("button", { name: "See it as a picture" }),
    ).toHaveAttribute("data-suggested", "true");
    // Still on the same section: position kept.
    expect(screen.getByRole("heading", { name: "Numerators" })).toBeInTheDocument();
  });

  it("takes a way by pressing the section's own control", async () => {
    await open();
    await missAndWait();
    // The card is there behind the held miss; it is reachable once the sheet
    // has given way.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), {
      timeout: GIVES_WAY_AFTER_MS + 2000,
    });

    fireEvent.click(screen.getByRole("button", { name: "A simpler version" }));
    expect(await screen.findByText("The top number.")).toBeInTheDocument();
    const paceWrites = api.saveSegmentChoice.mock.calls.length;
    // A second press leaves it on: the chip toggles, a way does not.
    fireEvent.click(screen.getByRole("button", { name: "A simpler version" }));
    expect(screen.getByText("The top number.")).toBeInTheDocument();
    expect(api.saveSegmentChoice.mock.calls.length).toBe(paceWrites);

    fireEvent.click(screen.getByRole("button", { name: "See it as a picture" }));
    expect(
      await screen.findByRole("img", { name: "Picture of a fraction" }),
    ).toBeInTheDocument();
    expect(api.saveSegmentChoice).toHaveBeenCalledWith(
      "lesson-1",
      SESSION,
      SEG_1,
      { modality: "visual" },
    );
  });

  it("comes back to the ways in after a reload, from the sitting's own read", async () => {
    api.comprehension.mockResolvedValue({ ...GATE_ON, reteaching: RETEACHING });
    await open();

    expect(card()).toBeInTheDocument();
    expect(ways()).toHaveLength(3);
  });

  it("leaves once the check is passed", async () => {
    api.comprehension.mockResolvedValue({ ...GATE_ON, reteaching: RETEACHING });
    api.saveAttempt.mockResolvedValue(reply(true, { required: true, canAdvance: true }));
    await open();
    expect(card()).toBeInTheDocument();

    next();
    fireEvent.click(await screen.findByRole("button", { name: /The numerator/ }));
    await act(async () => {});

    expect(card()).toBeNull();
  });

  it("keeps the card through a later miss whose reply names none", async () => {
    api.comprehension.mockResolvedValue({ ...GATE_ON, reteaching: RETEACHING });
    api.saveAttempt.mockResolvedValue(reply(false, GATE_OFF));
    await open();
    expect(card()).toBeInTheDocument();

    next();
    fireEvent.click(await screen.findByRole("button", { name: /The denominator/ }));
    await act(async () => {});

    expect(card()).toBeInTheDocument();
  });

  it("draws no ways for a section the re-teaching is not about", async () => {
    api.comprehension.mockResolvedValue({
      ...GATE_ON,
      reteaching: { ...RETEACHING, segmentId: SEG_2 },
    });
    await open();

    expect(card()).toBeNull();
  });

  it("puts no card on a calculation, whose ways are the solver's", async () => {
    const calc = {
      ...LESSON,
      segments: [
        {
          id: SEG_1,
          modalities: ["text", "interactive"],
          text: { heading: "Adding", body: { default: "Add them." } },
          calculationVariant: "co_construction",
          calculation: calculationFromVariant({
            type: "co_construction",
            conceptId: "c-1",
            fullEquation: "1/4 + 2/4 = 3/4",
            expression: "1/4 + 2/4",
            answer: "3/4",
            scaffold: null,
            manipulative: { kind: "fraction_bar", parts: 4, rows: 1, labels: [] },
            steps: [
              {
                stepId: "s1",
                stepNumber: 1,
                prompt: "What are the denominators?",
                expectedInput: "selection",
                input: "choice",
                options: [
                  { value: "4 and 4", label: "4 and 4" },
                  { value: "1 and 2", label: "1 and 2" },
                ],
                answer: "4 and 4",
                targets: [],
                hint: "",
                confirmationText: "",
                visualUpdate: "",
                assembles: "1/4 + 2/4 = ?",
                equationState: "1/4 + 2/4 = ?/4",
                unit: null,
                narrationAudio: null,
              },
            ],
            completionStatement: "",
          } as unknown as CalculationVariant),
        },
        LESSON.segments[1],
      ],
    } as unknown as Lesson;
    api.comprehension.mockResolvedValue({
      ...GATE_ON,
      // Even were the server to name the activity here.
      reteaching: {
        ...RETEACHING,
        availableRoutes: [route("format", "interactive"), route("slower")],
        recommendedRoute: route("format", "interactive"),
      },
    });
    progress.opened = { sessionId: SESSION, resumed: true };
    render(<LessonPlayer lesson={calc} plan={null} live />);
    await act(async () => {});

    expect(card()).toBeNull();
  });

  it("asks nothing of the gate on a finished lesson opened again", async () => {
    await open({ finished: true });

    expect(api.comprehension).not.toHaveBeenCalled();
    expect(card()).toBeNull();
  });
});
