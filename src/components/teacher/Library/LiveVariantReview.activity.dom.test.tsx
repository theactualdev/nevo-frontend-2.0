import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { LessonSegment } from "@/lib/api/lessons";

vi.mock("@/lib/api/lessons", () => ({ lessonsApi: { approveSegment: vi.fn(), review: vi.fn() } }));
vi.mock("@/components/shared/IllustrationWrapper", () => ({
  IllustrationWrapper: ({ alt }: { alt: string }) => <div role="img" aria-label={alt} />,
}));

import { LiveVariantReview } from "./LiveVariantReview";

/**
 * The interactive version is an ACTIVITY since backend bb59b37 (13 Oct): a
 * title, what is needed, steps and an outcome - no options, no answer key.
 * The tab drew the old question, read `options.length` off a field that is no
 * longer sent, and threw, taking the whole review down for any lesson read
 * since. These pin that it now shows the activity and survives a thin one.
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

  it("still says so when there is no interactive version", () => {
    open(null);

    expect(
      screen.getByText("Nevo has not generated an interactive version of this section."),
    ).toBeInTheDocument();
  });
});
