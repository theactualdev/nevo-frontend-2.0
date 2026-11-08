import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AfterLessonAssessment } from "./AfterLessonAssessment";
import { QuickCheckSheet } from "./QuickCheckSheet";
import { lessonFromContent } from "@/lib/lessons/fromContent";
import type {
  LessonDetailResponse,
  LessonSegment as ContentSegment,
} from "@/lib/api/lessons";

/**
 * LYDIA'S LEVELS TESTS 5 AND 4, on the child's side (ca58ae5).
 *
 * Test 5: "the same concept appears in two unlike situations and is followed
 * by a question asking what the two have in common". A transfer set is four
 * end-of-lesson questions a teacher generated and approved, each with its
 * situation (`transferContext`); the situation is shown above its question.
 *
 * Test 4: "nothing anywhere names knowing, application or analysis, and
 * nothing tells a child what level they are at". `masteryLevel`,
 * `masteryLevelAuthoredBy` and `transferKind` arrive on checks and are never
 * carried to a screen. Pinned here through the real adapter and both of the
 * child's check screens.
 */

afterEach(cleanup);

const LEVEL_WORDS =
  /\b(knowing|knowledge|application|applying|analysis|analys|comparison|diagnosis|transfer|mastery|level)\b/i;

const item = (kind: string, context: string | null, over: Record<string, unknown> = {}) => ({
  id: `transfer-l1-c1-${kind}`,
  prompt: `Question for ${kind}?`,
  answerType: "single_choice",
  options: [
    { value: "a", label: "Option A" },
    { value: "b", label: "Option B" },
    { value: "c", label: "Option C" },
  ],
  answerKey: "a",
  explanation: "Because of A.",
  conceptId: "c-1",
  conceptName: "Osmosis",
  position: "end",
  transferKind: kind,
  transferContext: context,
  sourceSegmentId: "seg-1",
  masteryLevel: kind.startsWith("application") ? "application" : "analysis",
  masteryLevelAuthoredBy: "nevo",
  ...over,
});

const SITUATION_A =
  "A gardener waters a wilted plant, and an hour later its leaves are firm again.";
const SITUATION_B =
  "A cucumber left in salty water for a day comes out soft and bendy.";

const TRANSFER_SET = [
  item("application_a", SITUATION_A),
  item("application_b", SITUATION_B),
  item("comparison", "Think about the plant and the cucumber together."),
  item("diagnosis", "A student says water always moves into the saltier side."),
];

const lesson = (assessment: unknown[], checks: unknown[] = []): LessonDetailResponse =>
  ({
    id: "l-1",
    title: "Osmosis",
    status: "completed",
    sourceType: "pdf",
    segmentCount: 1,
    reviewSegmentCount: 0,
    createdAt: "2026-11-05T21:00:00Z",
    confirmationSummary: null,
    recap: null,
    assessment,
    modules: [],
    segments: [
      {
        id: "seg-1",
        segmentKey: "s1",
        contentType: "explanatory_text",
        sequenceOrder: 1,
        title: "Water moves",
        body: "Water moves across a membrane towards more salt.",
        availableModalities: ["text"],
        comprehensionCheckpoints: checks,
        textVariant: null,
        visualVariant: null,
        audioVariant: null,
        interactiveVariant: null,
        calculationVariant: null,
        needsReview: false,
        reviewReasons: [],
      } as unknown as ContentSegment,
    ],
  }) as unknown as LessonDetailResponse;

const built = (assessment: unknown[], checks: unknown[] = []) => {
  const l = lessonFromContent(lesson(assessment, checks));
  if (!l) throw new Error("the adapter refused the lesson");
  return l;
};

describe("a transfer set in the end-of-lesson questions (test 5)", () => {
  it("carries each item's situation as the server wrote it, and nothing of its kind or level", () => {
    const questions = built(TRANSFER_SET).assessment?.questions ?? [];

    expect(questions.map((q) => q.context)).toEqual([
      SITUATION_A,
      SITUATION_B,
      "Think about the plant and the cucumber together.",
      "A student says water always moves into the saltier side.",
    ]);
    for (const q of questions) {
      expect(q).not.toHaveProperty("transferKind");
      expect(q).not.toHaveProperty("masteryLevel");
      expect(q).not.toHaveProperty("masteryLevelAuthoredBy");
    }
  });

  it("gives a question with no situation no context", () => {
    const [q] = built([item("application_a", null), item("application_b", "   ")])
      .assessment?.questions ?? [];

    expect(q).not.toHaveProperty("context");
  });

  it("shows each situation above its question, in order, with no label", () => {
    const assessment = built(TRANSFER_SET).assessment!;
    render(<AfterLessonAssessment assessment={assessment} onFinish={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    const situation = screen.getByText(SITUATION_A);
    const question = screen.getByRole("heading", { name: "Question for application_a?" });
    expect(situation.compareDocumentPosition(question) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.body.textContent?.replace("application_a", "")).not.toMatch(LEVEL_WORDS);

    fireEvent.click(screen.getByRole("button", { name: "Option A" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText(SITUATION_B)).toBeInTheDocument();
    expect(screen.queryByText(SITUATION_A)).toBeNull();
  });

  it("draws no situation card for a question without one", () => {
    const assessment = built([
      { ...item("x", null), transferKind: undefined, masteryLevel: undefined, prompt: "Plain question?" },
    ]).assessment!;
    render(<AfterLessonAssessment assessment={assessment} onFinish={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(document.querySelector("[data-transfer-context]")).toBeNull();
  });
});

describe("a level is never named on a child's screen (test 4)", () => {
  const leveled = (id: string, level: string) => ({
    ...item("x", null, { id, prompt: "Which way does water move?" }),
    transferKind: undefined,
    masteryLevel: level,
    masteryLevelAuthoredBy: "person",
  });

  it("carries no level onto an in-section check", () => {
    const l = built([], [leveled("cp-1", "knowledge")]);
    const check = l.segments[0].quickCheck;

    expect(check).toBeDefined();
    expect(check).not.toHaveProperty("masteryLevel");
    expect(check).not.toHaveProperty("masteryLevelAuthoredBy");
    expect(JSON.stringify(check)).not.toMatch(/knowledge|application|analysis/i);
  });

  it("names no level in the check sheet", () => {
    const l = built([], [leveled("cp-1", "application")]);
    render(
      <QuickCheckSheet
        check={l.segments[0].quickCheck!}
        open
        onTapOut={() => {}}
        onAnswered={() => null}
        onContinue={() => {}}
        onTakeBreak={() => {}}
      />,
    );

    expect(document.body.textContent).not.toMatch(LEVEL_WORDS);
  });

  it("names no level in the end-of-lesson questions", () => {
    const assessment = built([leveled("cp-9", "analysis")]).assessment!;
    render(<AfterLessonAssessment assessment={assessment} onFinish={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Start" }));

    expect(document.body.textContent).not.toMatch(LEVEL_WORDS);
  });
});
