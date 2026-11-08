import { beforeEach, describe, expect, it } from "vitest";
import { HELD_ANSWER_FIELDS, keepingKeys } from "./keepKeys";
import { refreshSavedLesson, saveLesson, savedLesson } from "./savedLessons";
import { lessonFromContent } from "@/lib/lessons/fromContent";
import type { LessonDetailResponse } from "@/lib/api/lessons";

/**
 * AN ONLINE READ NEVER DOWNGRADES A SAVED COPY (Lydia, 5 Nov, test 9: offline
 * keeps working, the device marking from the package's key).
 *
 * The saved copy is the package, keys and all. The refresh is an online read
 * as the server sends it once STRIP_STUDENT_ANSWERS is back on: put through a
 * port of its own strip, so the four fields are ABSENT, not null. Before
 * this, one online open replaced the package's copy with that read, and
 * offline the lesson asked nothing.
 */

const HELD = new Set<string>(HELD_ANSWER_FIELDS);

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
  conceptId: null,
  conceptName: null,
  prompt: "Which way does heat move?",
  answerType: "single_choice",
  options: [
    { value: "hot_to_cold", label: "From hot to cold" },
    { value: "cold_to_hot", label: "From cold to hot" },
  ],
  answerKey: "hot_to_cold",
  explanation: "Heat flows from hotter to colder.",
  position: "after_segment",
  teacherReviewed: true,
  ...over,
});

const step = (over: Record<string, unknown> = {}) => ({
  stepId: "st-1",
  stepNumber: 1,
  prompt: "What is on the left?",
  expectedInput: "text",
  input: "number",
  hint: "",
  confirmationText: "",
  assembles: "",
  equationState: "",
  answer: "3x - 4",
  acceptedAnswers: ["3x-4"],
  targets: [],
  options: [],
  unit: null,
  narrationAudio: null,
  miniSteps: [
    {
      id: "m-1",
      questionId: "mq-1",
      prompt: "What is 3 - 4?",
      input: "number",
      answer: "-1",
      acceptedAnswers: [],
    },
  ],
  ...over,
});

const segment = (over: Record<string, unknown> = {}) => ({
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
});

/** The package's copy: every key there. */
const PACKAGE = {
  id: "lesson-1",
  title: "Heat Transfer",
  confirmationSummary: null,
  modules: [],
  recap: null,
  segments: [
    segment(),
    segment({
      id: "seg-2",
      segmentKey: "s2",
      sequenceOrder: 2,
      contentType: "calculation",
      title: "Solving",
      comprehensionCheckpoints: [],
      calculationVariant: {
        type: "co_construction",
        conceptId: null,
        fullEquation: "x = 5",
        expression: "5x - 4 = 2x + 11",
        answer: "5",
        completionStatement: "Done.",
        scaffold: null,
        manipulative: null,
        steps: [step()],
      },
    }),
  ],
  assessment: [checkpoint({ id: "q-1", prompt: "Which is a conductor?" })],
} as unknown as LessonDetailResponse;

/** The same lesson read online with the strip on. */
const ONLINE = held(PACKAGE);

const at = (d: unknown, path: (string | number)[]) =>
  path.reduce<unknown>((v, k) => (v as Record<string | number, unknown>)?.[k], d);

describe("the fixtures", () => {
  it("are the package with its keys, and the online read without any", () => {
    expect(JSON.stringify(PACKAGE)).toContain('"answerKey"');
    for (const f of HELD_ANSWER_FIELDS) {
      expect(JSON.stringify(ONLINE)).not.toContain(`"${f}"`);
    }
  });
});

describe("a refresh from a keyless online read keeps the package's keys", () => {
  beforeEach(() => window.localStorage.clear());

  it("for the section's check, the end-of-lesson question, the calculation step and its mini-step", () => {
    saveLesson("ada", PACKAGE);
    refreshSavedLesson("ada", ONLINE);
    const kept = savedLesson("ada", "lesson-1")!.detail;

    const cp = at(kept, ["segments", 0, "comprehensionCheckpoints", 0]);
    expect(cp).toMatchObject({
      answerKey: "hot_to_cold",
      explanation: "Heat flows from hotter to colder.",
    });
    expect(at(kept, ["assessment", 0, "answerKey"])).toBe("hot_to_cold");
    const st = at(kept, ["segments", 1, "calculationVariant", "steps", 0]);
    expect(st).toMatchObject({ answer: "3x - 4", acceptedAnswers: ["3x-4"] });
    expect(at(st, ["miniSteps", 0, "answer"])).toBe("-1");
  });

  it("so offline the lesson still asks them, marked from the key", () => {
    saveLesson("ada", PACKAGE);
    refreshSavedLesson("ada", ONLINE);
    // Offline: a saved copy is built with its key gate (no `serverMarks`).
    const lesson = lessonFromContent(savedLesson("ada", "lesson-1")!.detail, [])!;

    expect(lesson.segments[0].quickCheck?.correctId).toBe("hot_to_cold");
    expect(lesson.assessment?.questions[0].correctId).toBe("hot_to_cold");
    expect(lesson.segments[1].calculation?.steps[0]).toMatchObject({
      accepted: expect.arrayContaining(["3x - 4"]),
    });
  });

  it("still takes the read's new words for everything else", () => {
    saveLesson("ada", PACKAGE);
    const edited = held({
      ...PACKAGE,
      title: "Heat Transfer (revised)",
      segments: [
        { ...PACKAGE.segments[0], body: "Heat moves through solids, fast." },
        PACKAGE.segments[1],
      ],
    }) as LessonDetailResponse;
    refreshSavedLesson("ada", edited);
    const saved = savedLesson("ada", "lesson-1")!;

    expect(saved.title).toBe("Heat Transfer (revised)");
    expect(at(saved.detail, ["segments", 0, "body"])).toBe(
      "Heat moves through solids, fast.",
    );
    expect(at(saved.detail, ["segments", 0, "comprehensionCheckpoints", 0, "answerKey"])).toBe(
      "hot_to_cold",
    );
  });
});

describe("what is never put back", () => {
  it("a key for a question whose words have changed since it was saved", () => {
    const reworded = held({
      ...PACKAGE,
      segments: [
        segment({
          comprehensionCheckpoints: [
            checkpoint({ prompt: "Which way does heat flow in a metal spoon?" }),
          ],
        }),
      ],
    });
    const out = keepingKeys(reworded, PACKAGE);
    expect(
      at(out, ["segments", 0, "comprehensionCheckpoints", 0]),
    ).not.toHaveProperty("answerKey");
  });

  it("a key for a question whose options have changed", () => {
    const reoptioned = held({
      ...PACKAGE,
      segments: [
        segment({
          comprehensionCheckpoints: [
            checkpoint({
              options: [
                { value: "hot_to_cold", label: "From hot to cold" },
                { value: "both", label: "Both ways at once" },
              ],
            }),
          ],
        }),
      ],
    });
    const out = keepingKeys(reoptioned, PACKAGE);
    expect(
      at(out, ["segments", 0, "comprehensionCheckpoints", 0]),
    ).not.toHaveProperty("answerKey");
  });

  it("a key onto a different question, whatever its position", () => {
    const swapped = held({
      ...PACKAGE,
      segments: [segment({ comprehensionCheckpoints: [checkpoint({ id: "cp-new" })] })],
    });
    const out = keepingKeys(swapped, PACKAGE);
    expect(
      at(out, ["segments", 0, "comprehensionCheckpoints", 0]),
    ).not.toHaveProperty("answerKey");
  });

  it("over a key the read does carry: the strip off, the read is newer", () => {
    const rekeyed = {
      ...PACKAGE,
      segments: [segment({ comprehensionCheckpoints: [checkpoint({ answerKey: "cold_to_hot" })] })],
    } as unknown as LessonDetailResponse;
    const out = keepingKeys(rekeyed, PACKAGE);
    expect(at(out, ["segments", 0, "comprehensionCheckpoints", 0, "answerKey"])).toBe(
      "cold_to_hot",
    );
  });

  it("over a null the read sends: the lesson saying it has no key", () => {
    const unkeyed = {
      ...PACKAGE,
      segments: [segment({ comprehensionCheckpoints: [checkpoint({ answerKey: null })] })],
    } as unknown as LessonDetailResponse;
    const out = keepingKeys(unkeyed, PACKAGE);
    expect(at(out, ["segments", 0, "comprehensionCheckpoints", 0, "answerKey"])).toBeNull();
  });
});

describe("the package's key versions (9b)", () => {
  it("are kept through a refresh, which never carries them", () => {
    const saved = { ...PACKAGE, markingKeyVersions: { "checkpoint:seg-1:cp-1": "a".repeat(64) } };
    const out = keepingKeys(ONLINE, saved) as unknown as Record<string, unknown>;
    expect(out.markingKeyVersions).toEqual({ "checkpoint:seg-1:cp-1": "a".repeat(64) });
  });
});
