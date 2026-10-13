import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { LessonSegment } from "@/lib/api/lessons";

vi.mock("@/lib/api/lessons", () => ({ lessonsApi: { approveSegment: vi.fn(), review: vi.fn() } }));
vi.mock("@/components/shared/IllustrationWrapper", () => ({
  IllustrationWrapper: ({ alt }: { alt: string }) => <div role="img" aria-label={alt} />,
}));

import { LiveVariantReview } from "./LiveVariantReview";

/**
 * SCRUM-224. The text segment carries key terms and equation callouts beside
 * its body, and a child's lesson draws both. The teacher's review showed the
 * body and the key points only - so approving a section signed off words the
 * teacher had not seen.
 */

const show = (textVariant: unknown) =>
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
          title: "How plants make food",
          body: "…",
          availableModalities: [],
          comprehensionCheckpoints: [],
          needsReview: false,
          reviewReasons: [],
          approved: false,
          approvedAt: null,
          textVariant,
          visualVariant: null,
          audioVariant: null,
          interactiveVariant: null,
          calculationVariant: null,
        } as unknown as LessonSegment
      }
      sectionIndex={1}
      segmentCount={3}
    />,
  );

describe("the written version, as a child will see it", () => {
  it("shows the key terms with their definitions", () => {
    show({
      body: "Plants make food in their leaves.",
      keyPoints: [],
      keyTerms: [
        { term: "chloroplast", definition: "The part of a cell where light becomes food." },
        { term: "chlorophyll", definition: "The green pigment that catches light." },
      ],
    });

    expect(screen.getByText("Key terms")).toBeInTheDocument();
    expect(screen.getByText("chloroplast").closest("div")).toHaveTextContent(
      "chloroplast - The part of a cell where light becomes food.",
    );
    expect(screen.getByText("chlorophyll")).toBeInTheDocument();
  });

  it("shows each equation, labelled only where it has a label", () => {
    show({
      body: "Light and water become sugar and oxygen.",
      keyPoints: [],
      equationCallouts: [
        { equation: "carbon dioxide + water → glucose + oxygen", label: "Word equation" },
        { equation: "6CO2 + 6H2O → C6H12O6 + 6O2", label: null },
      ],
    });

    expect(screen.getByText("Word equation")).toBeInTheDocument();
    expect(screen.getByText("carbon dioxide + water → glucose + oxygen")).toBeInTheDocument();
    expect(screen.getByText("6CO2 + 6H2O → C6H12O6 + 6O2")).toBeInTheDocument();
  });

  it("drops a blank term or equation, as the lesson does, and draws no empty heading", () => {
    show({
      body: "Plants make food.",
      keyPoints: [],
      keyTerms: [{ term: "   ", definition: "nothing" }],
      equationCallouts: [{ equation: "", label: "Word equation" }],
    });

    expect(screen.queryByText("Key terms")).not.toBeInTheDocument();
    expect(screen.queryByText("Word equation")).not.toBeInTheDocument();
  });

  it("is unchanged for a segment that carries neither", () => {
    show({ body: "Plants make food.", keyPoints: ["Leaves catch light."] });

    expect(screen.getByText("Leaves catch light.")).toBeInTheDocument();
    expect(screen.queryByText("Key terms")).not.toBeInTheDocument();
  });
});
