import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AfterLessonAssessment } from "./AfterLessonAssessment";
import { CalculationSolver, type StepGiven } from "./CalculationSolver";
import { lessonFromContent } from "@/lib/lessons/fromContent";
import type { Verdict, VerdictReply } from "@/lib/lessons/verdict";
import type { LessonDetailResponse } from "@/lib/api/lessons";

/**
 * BOTH SHAPES, ON THE SCREENS THAT MARK (8 Nov). Today an online lesson
 * carries its keys again (dd1011f, the strip switched off); the day #1070 is
 * live it is switched back on (SCRUM-312) and keys are gone for good. Each
 * screen is fed what `lessonFromContent` builds from the wire, online, in
 * both shapes:
 *  - KEYS ABSENT: asked, moved by the server's mark, and with no mark never
 *    called wrong - there is no key to fall back on.
 *  - KEYS PRESENT: exactly as before - the key marks where no reply comes.
 */

afterEach(cleanup);

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

const question = (id: string, prompt: string) => ({
  id,
  conceptId: null,
  conceptName: null,
  prompt,
  answerType: "single_choice",
  options: [
    { value: "right", label: "The right one" },
    { value: "wrong", label: "The wrong one" },
  ],
  answerKey: "right",
  explanation: "Because it is.",
  position: "end_of_lesson",
  teacherReviewed: true,
});

const step = (over: Record<string, unknown>) => ({
  stepNumber: 1,
  expectedInput: "text",
  hint: "",
  confirmationText: "",
  assembles: "",
  equationState: "",
  targets: [],
  options: [],
  unit: null,
  narrationAudio: null,
  ...over,
});

const WITH_KEYS = {
  id: "lesson-1",
  title: "Heat Transfer",
  confirmationSummary: null,
  segments: [
    {
      id: "seg-1",
      segmentKey: "s1",
      contentType: "calculation",
      sequenceOrder: 1,
      title: "Solving",
      body: "Body.",
      availableModalities: ["text"],
      comprehensionCheckpoints: [],
      textVariant: null,
      visualVariant: null,
      audioVariant: null,
      interactiveVariant: null,
      calculationVariant: {
        type: "co_construction",
        conceptId: null,
        fullEquation: "x = 5",
        expression: "5x - 4 = 2x + 11",
        answer: "5",
        completionStatement: "You solved for x.",
        scaffold: null,
        manipulative: null,
        steps: [
          step({
            stepId: "st-1",
            input: "number",
            prompt: "What is on the left?",
            answer: "3x - 4",
            acceptedAnswers: ["3x-4"],
          }),
          step({
            stepId: "st-2",
            stepNumber: 2,
            input: "choice",
            prompt: "What do you do next?",
            answer: "add_4",
            options: [
              { value: "add_4", label: "Add 4 to both sides" },
              { value: "sub_4", label: "Take 4 from both sides" },
            ],
          }),
        ],
      },
      needsReview: false,
      reviewReasons: [],
    },
  ],
  assessment: [
    question("q-1", "First question?"),
    question("q-2", "Second question?"),
  ],
} as unknown as LessonDetailResponse;

const built = (keys: boolean) =>
  lessonFromContent(keys ? WITH_KEYS : held(WITH_KEYS), [], {
    serverMarks: true,
  })!;

describe("the end-of-lesson questions", () => {
  const mount = (keys: boolean, onAnswer?: () => Verdict) => {
    render(
      <AfterLessonAssessment
        assessment={built(keys).assessment!}
        onFinish={() => {}}
        {...(onAnswer ? { onAnswer } : {})}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
  };
  const confirm = (label: string) => {
    fireEvent.click(screen.getByRole("button", { name: label }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
  };

  describe("keys absent", () => {
    it("are asked", () => {
      mount(false);
      expect(screen.getByText("First question?")).toBeInTheDocument();
    });

    it("hold on the server's wrong", () => {
      mount(false, () => false);
      confirm("The right one");
      expect(screen.getByText("First question?")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Next question" }),
      ).toBeInTheDocument();
    });

    it("go on with no mark, never calling it wrong", () => {
      mount(false);
      confirm("The wrong one");
      expect(screen.getByText("Second question?")).toBeInTheDocument();
    });
  });

  describe("keys present: as before", () => {
    it("the key holds a wrong pick where no mark comes", () => {
      mount(true);
      confirm("The wrong one");
      expect(screen.getByText("First question?")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Next question" }),
      ).toBeInTheDocument();
    });

    it("the key passes a right pick where no mark comes", () => {
      mount(true);
      confirm("The right one");
      expect(screen.getByText("Second question?")).toBeInTheDocument();
    });
  });
});

describe("the calculation steps", () => {
  const show = (
    keys: boolean,
    onStepGiven: (given: StepGiven, packageMark: Verdict) => VerdictReply | undefined,
  ) => {
    const props = {
      onSolved: vi.fn(),
      onStepCommitted: vi.fn(),
      onStepAnswered: vi.fn(),
      onStepGiven: vi.fn(onStepGiven),
    };
    const calculation = built(keys).segments[0].calculation;
    if (!calculation) throw new Error("the calculation did not build");
    render(<CalculationSolver calculation={calculation} {...props} />);
    return props;
  };
  const type = (typed: string) => {
    fireEvent.change(screen.getByRole("textbox"), { target: { value: typed } });
    fireEvent.click(screen.getByRole("button", { name: "Check my answer" }));
  };

  describe("keys absent", () => {
    it("send the entry with no stored mark beside it, and move on the server's right", () => {
      const props = show(false, () => true);
      type("3x - 4");

      expect(props.onStepGiven).toHaveBeenCalledWith(
        expect.objectContaining({ stepId: "st-1", answer: "3x - 4" }),
        null,
      );
      expect(props.onStepAnswered).toHaveBeenCalledWith("st-1", true);
      expect(screen.getByText("What do you do next?")).toBeInTheDocument();
    });

    it("hold on the server's wrong", () => {
      const props = show(false, () => false);
      type("3x");

      expect(props.onStepAnswered).toHaveBeenCalledWith("st-1", false);
      expect(screen.getByRole("textbox")).toHaveValue("3x");
    });

    it("go on with no mark, never calling it wrong", () => {
      const props = show(false, () => undefined);
      type("anything");

      expect(props.onStepAnswered).toHaveBeenCalledWith("st-1", null);
      expect(screen.getByText("What do you do next?")).toBeInTheDocument();
    });

    it("ask a choice step, sending the option picked", () => {
      const props = show(false, () => true);
      type("3x - 4");
      fireEvent.click(screen.getByRole("button", { name: "Add 4 to both sides" }));
      fireEvent.click(screen.getByRole("button", { name: "Check my answer" }));

      expect(props.onStepGiven).toHaveBeenLastCalledWith(
        expect.objectContaining({ stepId: "st-2", answer: "add_4" }),
        null,
      );
    });
  });

  describe("keys present: as before", () => {
    it("hand the stored answers' mark beside the entry", () => {
      const props = show(true, () => undefined);
      type("3x - 4");

      expect(props.onStepGiven).toHaveBeenCalledWith(
        expect.objectContaining({ stepId: "st-1", answer: "3x - 4" }),
        true,
      );
    });

    it("the stored answers hold a wrong entry where no mark comes", () => {
      const props = show(true, () => undefined);
      type("3x");

      expect(props.onStepAnswered).toHaveBeenCalledWith("st-1", false);
      expect(screen.getByRole("textbox")).toHaveValue("3x");
    });
  });
});
