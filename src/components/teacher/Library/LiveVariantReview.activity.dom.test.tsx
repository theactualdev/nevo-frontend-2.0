import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { LessonSegment } from "@/lib/api/lessons";

vi.mock("@/lib/api/lessons", () => ({ lessonsApi: { approveSegment: vi.fn(), review: vi.fn() } }));
vi.mock("@/components/shared/IllustrationWrapper", () => ({
  IllustrationWrapper: ({ alt }: { alt: string }) => <div role="img" aria-label={alt} />,
}));

import { LiveVariantReview } from "./LiveVariantReview";

/**
 * The interactive version comes in two forms (Teslim, 14 Oct): the ACTIVITY a
 * lesson parsed since 13 Oct carries (title, materials, steps, outcome) and
 * the QUESTION every earlier lesson carries (prompt, options, answer key).
 * The tab drew only the question, read `options.length` off an activity, and
 * threw, taking the whole review down. These pin both forms.
 */

const open = (interactiveVariant: unknown) => {
  render(
    <LiveVariantReview
      lessonId="l-1"
      lessonTitle="Photosynthesis"
      segment={
        {
          id: "seg-1",
          segmentKey: "s1",
          contentType: "explanation",
          sequenceOrder: 1,
          title: "Where plants make food",
          body: "…",
          availableModalities: ["text", "interactive"],
          comprehensionCheckpoints: [],
          needsReview: false,
          reviewReasons: [],
          approved: false,
          approvedAt: null,
          textVariant: { body: "…", keyPoints: [] },
          visualVariant: null,
          audioVariant: null,
          interactiveVariant,
          calculationVariant: null,
        } as unknown as LessonSegment
      }
      sectionIndex={1}
      segmentCount={3}
    />,
  );
  fireEvent.click(screen.getByRole("tab", { name: "Interactive" }));
};

describe("the interactive version, as an activity", () => {
  it("shows the activity's title, what is needed, the steps in order and the outcome", () => {
    open({
      type: "activity",
      title: "Find the light",
      materials: ["A leaf", "A torch"],
      steps: [
        { id: "step-1", instruction: "Hold the leaf up to the torch." },
        { id: "step-2", instruction: "Look for the thin lines inside it." },
      ],
      outcome: "You can see the veins that carry water to the leaf.",
    });

    expect(screen.getByText("Find the light")).toBeInTheDocument();
    expect(screen.getByText("A leaf")).toBeInTheDocument();
    expect(screen.getByText("A torch")).toBeInTheDocument();
    const steps = screen.getAllByRole("listitem").filter((li) => li.closest("ol"));
    expect(steps.map((li) => li.textContent)).toEqual([
      "1Hold the leaf up to the torch.",
      "2Look for the thin lines inside it.",
    ]);
    expect(
      screen.getByText("By the end: You can see the veins that carry water to the leaf."),
    ).toBeInTheDocument();
  });

  it("does not throw on an activity with no materials, or on fields the server left out", () => {
    expect(() =>
      open({ type: "activity", title: "Try this activity", steps: [{ id: "s", instruction: "Draw it." }] }),
    ).not.toThrow();

    expect(screen.getByText("Draw it.")).toBeInTheDocument();
    expect(screen.queryByText("What’s needed")).not.toBeInTheDocument();
    expect(screen.queryByText(/By the end/)).not.toBeInTheDocument();
  });

  it("still draws a question, the form every earlier lesson carries", () => {
    open({
      type: "practice_problem",
      prompt: "Which part of the leaf makes food?",
      expectedInteraction: "tapping one answer",
      options: ["The stem", "The chloroplast"],
      answerKey: "The chloroplast",
      instructions: null,
    });

    expect(screen.getByText("Which part of the leaf makes food?")).toBeInTheDocument();
    expect(screen.getByText("The chloroplast")).toBeInTheDocument();
    expect(screen.getByText("Students respond by: tapping one answer.")).toBeInTheDocument();
    expect(screen.queryByText(/By the end/)).not.toBeInTheDocument();
  });

  it("still says so when there is no interactive version", () => {
    open(null);

    expect(
      screen.getByText("Nevo has not generated an interactive version of this section."),
    ).toBeInTheDocument();
  });
});

/**
 * SCRUM-288 on the teacher's side (the hub, 24 Oct; Teslim b52edeb). A teacher
 * approved an activity without ever seeing the safety line a child gets. It
 * sits above the steps, as on the child's card, word for word.
 */
describe("the activity's safety line", () => {
  const ACTIVITY = {
    type: "activity",
    title: "Watch osmosis in a yam strip",
    materials: ["Yam", "Salt water"],
    steps: [
      { id: "step-1", instruction: "Place one strip in plain water." },
      { id: "step-2", instruction: "Place one strip in salt water." },
    ],
    outcome: "The strip in salt water goes soft.",
  };

  it("shows it above the steps, word for word", () => {
    open({ ...ACTIVITY, safety: "Let an adult do the cutting, and do not taste the salt water." });

    const line = screen.getByText("Let an adult do the cutting, and do not taste the salt water.");
    expect(screen.getByText("First")).toBeInTheDocument();
    const firstStep = screen.getByText("Place one strip in plain water.");
    // Before the steps in the document, never after them.
    expect(line.compareDocumentPosition(firstStep) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("draws nothing in its place when the activity has none", () => {
    open({ ...ACTIVITY, safety: null });

    expect(screen.queryByText("First")).not.toBeInTheDocument();
  });

  // Lydia, 25 Oct: the first letter is capitalised on render only. The parser
  // keeps the words after "Safety:" as written, so a line can start lowercase.
  it("starts with a capital on screen, the rest as written", () => {
    open({ ...ACTIVITY, safety: "let an adult do the cutting, and do not taste the salt water." });

    expect(
      screen.getByText("Let an adult do the cutting, and do not taste the salt water."),
    ).toBeInTheDocument();
  });
});
