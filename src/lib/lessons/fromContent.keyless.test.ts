import { describe, expect, it } from "vitest";
import { lessonFromContent } from "./fromContent";
import { keyMark } from "./verdict";
import { storedMark } from "./storedAnswer";
import type {
  LessonDetailResponse,
  LessonSegment as ContentSegment,
} from "@/lib/api/lessons";

/**
 * 8 NOV, LIVE: NO CHILD WAS ASKED A QUESTION.
 *
 * Teslim's 41c2f83 strips `answerKey`, `acceptedAnswers`, `answer` and
 * `explanation` from every online student lesson (`without_held_answers`,
 * recursively, over the assessment, every section's checks, and its
 * calculation and interactive variants), and the server marks each answer
 * itself (test 9, #1039). This builder still refused a check with no key, so
 * every check and every end-of-lesson question was dropped before the player
 * saw it, and every calculation fell back to text.
 *
 * THE FIXTURES ARE THE REAL WIRE SHAPE: a lesson written with its keys, then
 * put through the server's own strip (`held`, below) - so the fields are
 * ABSENT, not null, exactly as Tunde's live payload had them.
 */

const HELD = new Set(["answerKey", "acceptedAnswers", "answer", "explanation"]);

/** `without_held_answers` (lesson_contracts.py), as the server runs it. */
function held<T>(value: T): T {
  if (Array.isArray(value)) return value.map(held) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !HELD.has(k))
        .map(([k, v]) => [k, held(v)]),
    ) as T;
  }
  return value;
}

const checkpoint = (over: Record<string, unknown> = {}) => ({
  id: "cp-1",
  conceptId: "concept-1",
  conceptName: "Conduction",
  prompt: "Which way does heat move?",
  answerType: "single_choice",
  options: [
    { value: "hot_to_cold", label: "From hot to cold" },
    { value: "cold_to_hot", label: "From cold to hot" },
  ],
  answerKey: "hot_to_cold",
  explanation: "Heat flows from the hotter thing to the colder one.",
  position: "after_segment",
  teacherReviewed: true,
  ...over,
});

const step = (over: Record<string, unknown> = {}) => ({
  stepId: "st-1",
  stepNumber: 1,
  prompt: "Subtract 2x from both sides. What is on the left?",
  expectedInput: "text",
  input: "number",
  hint: "Take 2x off each side.",
  confirmationText: "That is it.",
  assembles: "? = 11",
  equationState: "3x - 4 = 11",
  answer: "3x - 4",
  acceptedAnswers: ["3x-4"],
  targets: [],
  options: [],
  unit: null,
  narrationAudio: null,
  ...over,
});

const calculation = {
  type: "co_construction",
  conceptId: null,
  fullEquation: "x = 5",
  expression: "5x - 4 = 2x + 11",
  answer: "5",
  completionStatement: "You solved for x.",
  scaffold: null,
  manipulative: null,
  steps: [
    step(),
    step({
      stepId: "st-2",
      stepNumber: 2,
      input: "choice",
      prompt: "What do you do next?",
      answer: "add_4",
      acceptedAnswers: [],
      options: [
        { value: "add_4", label: "Add 4 to both sides" },
        { value: "sub_4", label: "Take 4 from both sides" },
      ],
      assembles: "? = 15",
      equationState: "3x = 15",
    }),
  ],
};

const segment = (over: Record<string, unknown> = {}): ContentSegment =>
  ({
    id: "seg-1",
    segmentKey: "s1",
    contentType: "explanatory_text",
    sequenceOrder: 1,
    title: "Conduction",
    body: "Heat moves through solids.",
    availableModalities: ["text"],
    comprehensionCheckpoints: [checkpoint()],
    textVariant: null,
    visualVariant: null,
    audioVariant: null,
    interactiveVariant: null,
    calculationVariant: null,
    needsReview: false,
    reviewReasons: [],
    ...over,
  }) as unknown as ContentSegment;

const withKeys = (): LessonDetailResponse =>
  ({
    id: "lesson-1",
    title: "Heat Transfer",
    confirmationSummary: null,
    segments: [
      segment(),
      segment({
        id: "seg-2",
        segmentKey: "s2",
        sequenceOrder: 2,
        contentType: "calculation",
        title: "Solving",
        comprehensionCheckpoints: [],
        calculationVariant: calculation,
      }),
    ],
    assessment: [
      checkpoint({ id: "q-1", prompt: "Which is a conductor?" }),
      checkpoint({ id: "q-2", prompt: "Which is an insulator?" }),
    ],
  }) as unknown as LessonDetailResponse;

/** What an online student read delivers. */
const online = () => held(withKeys());

describe("the fixture is the wire as the server strips it", () => {
  it("has no answerKey, acceptedAnswers, answer or explanation anywhere", () => {
    const text = JSON.stringify(online());
    for (const field of HELD) expect(text).not.toContain(`"${field}"`);
  });
});

describe("online, the server holds the keys and marks, so nothing is dropped for having none", () => {
  const built = () =>
    lessonFromContent(online(), [], { serverMarks: true })!;

  it("asks the section's check, with no key on it", () => {
    // One check in the section: the sheet's own (`quickChecks` only for several).
    const check = built().segments[0].quickCheck;
    expect(check?.id).toBe("cp-1");
    expect(check?.question).toBe("Which way does heat move?");
    expect(check?.options.map((o) => o.label)).toEqual([
      "From hot to cold",
      "From cold to hot",
    ]);
    expect(check).not.toHaveProperty("correctId");
    // The note is ours, not an explanation nobody sent.
    expect(check?.correctNote).toBe("That's it - you've got this one.");
    expect(check).not.toHaveProperty("explanation");
  });

  it("asks every end-of-lesson question, with no key on any", () => {
    const questions = built().assessment?.questions ?? [];
    expect(questions.map((q) => q.id)).toEqual(["q-1", "q-2"]);
    for (const q of questions) expect(q).not.toHaveProperty("correctId");
  });

  it("builds the calculation, its steps asked with nothing stored to match", () => {
    const calc = built().segments[1].calculation;
    expect(calc?.steps.map((s) => s.stepId)).toEqual(["st-1", "st-2"]);
    for (const s of calc?.steps ?? []) {
      if (s.input === "number" || s.input === "choice") {
        expect(s.accepted).toEqual([]);
      }
    }
  });

  it("still marks from the key where the online read carries one (the strip switched off)", () => {
    const check = lessonFromContent(withKeys(), [], { serverMarks: true })!
      .segments[0].quickCheck;
    expect(check?.correctId).toBe("hot_to_cold");
  });

  it("still drops what the sheet cannot ask: multiple_choice, text, and fewer than two options", () => {
    const res = held({
      ...withKeys(),
      segments: [
        segment({
          comprehensionCheckpoints: [
            checkpoint({ id: "mc", answerType: "multiple_choice", answerKey: ["a", "b"] }),
            checkpoint({ id: "tx", answerType: "text", options: [] }),
            checkpoint({ id: "one", options: [{ value: "a", label: "A" }] }),
            checkpoint({ id: "ok" }),
          ],
        }),
      ],
    }) as LessonDetailResponse;
    const seg = lessonFromContent(res, [], { serverMarks: true })!.segments[0];
    expect(seg.quickCheck?.id).toBe("ok");
    expect(seg.quickChecks).toBeUndefined();
  });
});

describe("a saved copy is marked on the device, so its key gate stands", () => {
  it("drops a check, an end-of-lesson question and a calculation with no key", () => {
    const built = lessonFromContent(online(), [])!;
    expect(built.segments[0].quickCheck).toBeUndefined();
    expect(built.assessment).toBeUndefined();
    expect(built.segments[1].calculation).toBeUndefined();
  });

  it("asks them, keyed, where the package carries its keys", () => {
    const built = lessonFromContent(withKeys(), [])!;
    expect(built.segments[0].quickCheck?.correctId).toBe("hot_to_cold");
    expect(built.assessment?.questions).toHaveLength(2);
    expect(built.segments[1].calculation?.steps).toHaveLength(2);
  });
});

describe("with no key and no reply, the device has nothing to mark against", () => {
  it("gives no mark, never a wrong one", () => {
    expect(keyMark("hot_to_cold", undefined)).toBeNull();
    expect(keyMark("cold_to_hot", undefined)).toBeNull();
    expect(storedMark("3x - 4", [])).toBeNull();
  });

  it("marks from the key where there is one, as before", () => {
    expect(keyMark("hot_to_cold", "hot_to_cold")).toBe(true);
    expect(keyMark("cold_to_hot", "hot_to_cold")).toBe(false);
    expect(storedMark("3x - 4", ["3x-4"])).toBe(true);
    expect(storedMark("3x", ["3x-4"])).toBe(false);
  });
});
