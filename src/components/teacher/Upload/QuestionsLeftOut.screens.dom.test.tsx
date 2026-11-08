import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  updateStructure: vi.fn(),
  confirm: vi.fn(),
  regenerate: vi.fn(),
  awaitParseRun: vi.fn(),
  detail: vi.fn(),
  review: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/lib/api/uploads", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/uploads")>();
  return {
    ...actual,
    uploadsApi: { ...actual.uploadsApi, updateStructure: h.updateStructure, confirm: h.confirm },
  };
});
vi.mock("@/lib/api/content", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/content")>();
  return {
    ...actual,
    contentApi: { ...actual.contentApi, regenerate: h.regenerate },
    awaitParseRun: h.awaitParseRun,
  };
});
vi.mock("@/lib/api/lessons", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/lessons")>();
  return { ...actual, lessonsApi: { ...actual.lessonsApi, detail: h.detail, review: h.review } };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push, replace: h.push, prefetch: vi.fn() }),
}));

import { LiveModuleReview } from "./LiveModuleReview";
import { LiveStructureTree } from "./LiveStructureTree";
import { UploadResult } from "./UploadResult";
import type { UploadStructure } from "@/lib/api/uploads";
import type { LessonDetailResponse } from "@/lib/api/lessons";

/**
 * The questions the parse left out, where a teacher looks: the structure step
 * (a single lesson's sections, and a unit's tree) and the finish screen.
 */

const SENTENCE =
  "Nevo could not turn this question into something a child can answer and have marked, so it was left out of the lesson. The rest of the lesson is unaffected. An open question with no single right answer is the usual reason; add it back as a discussion point if you want it.";
const NOTES = [
  { code: "ai_parse_fallback", message: "This chunk used deterministic parsing because the AI could not return valid structured lesson data." },
  { code: "question_unusable", questionCount: 1, questions: ["Why do you think metals feel cold?"], message: SENTENCE },
];

const STRUCTURE: UploadStructure = {
  lessonId: "l-1",
  modules: [],
  reviewNotes: NOTES,
  lessons: [
    {
      lessonId: "l-1",
      title: "Heat transfer",
      sequenceOrder: 1,
      modules: [{ title: "Conductors", sequenceOrder: 1, segmentIds: ["k-1"], recap: null, preview: null }],
    },
  ],
};
const SEGMENTS = [
  { segmentKey: "k-1", title: "Metals", contentType: "explanatory_text", sequenceOrder: 1, estimatedMinutes: 3, needsReview: false },
];

const LESSON = {
  id: "l-1",
  title: "Heat transfer",
  segmentCount: 1,
  reviewSegmentCount: 0,
  confirmationSummary: null,
  segments: [
    { id: "s-1", sequenceOrder: 1, title: "Metals", contentType: "explanatory_text", body: "Metals conduct.", needsReview: false, availableModalities: ["text"] },
  ],
} as unknown as LessonDetailResponse;

const said = () => screen.queryByText(SENTENCE);

beforeEach(() => {
  h.updateStructure.mockReset().mockImplementation((_id: string, s: unknown) =>
    Promise.resolve({ id: "u-1", structure: s, canUndo: true }),
  );
  h.confirm.mockReset().mockResolvedValue({ lessonId: "l-1", status: "confirmed" });
  h.regenerate.mockReset().mockResolvedValue({ lessonId: "l-1", parseRunId: "run-1", status: "processing", pollUrl: "" });
  h.awaitParseRun.mockReset();
  h.detail.mockReset().mockResolvedValue(LESSON);
  h.review.mockReset().mockResolvedValue({ lessonId: "l-1", keyPoints: [], outstandingCount: 0, readyToAssign: false });
  h.push.mockReset();
});

describe("the structure step", () => {
  it("says it above a single lesson's sections, with the question, and no technical note", () => {
    render(
      <LiveModuleReview uploadId="u-1" structure={STRUCTURE} segments={SEGMENTS as never} onBack={vi.fn()} onConfirmed={vi.fn()} />,
    );

    expect(said()).toBeInTheDocument();
    expect(screen.getByText("Why do you think metals feel cold?")).toBeInTheDocument();
    expect(screen.queryByText(/deterministic parsing/)).not.toBeInTheDocument();
  });

  it("says it above a unit's tree", () => {
    render(<LiveStructureTree uploadId="u-1" structure={STRUCTURE} segments={SEGMENTS} blockName="Physics" />);

    expect(said()).toBeInTheDocument();
    expect(screen.getByText("Why do you think metals feel cold?")).toBeInTheDocument();
  });

  it("says nothing when no question was left out", () => {
    render(
      <LiveModuleReview
        uploadId="u-1"
        structure={{ ...STRUCTURE, reviewNotes: [NOTES[0]] }}
        segments={SEGMENTS as never}
        onBack={vi.fn()}
        onConfirmed={vi.fn()}
      />,
    );

    expect(said()).not.toBeInTheDocument();
  });
});

describe("the finish screen", () => {
  it("says it, from the upload's notes", () => {
    render(<UploadResult lesson={LESSON} fileName="heat.pdf" onUploadAnother={vi.fn()} reviewNotes={NOTES} />);

    expect(said()).toBeInTheDocument();
    expect(screen.getByText("Why do you think metals feel cold?")).toBeInTheDocument();
  });

  it("after a re-read, says what THAT read left out, not the upload's", async () => {
    h.awaitParseRun.mockResolvedValue({ status: "completed", finished: true, failureReason: null, reviewNotes: [] });
    render(
      <UploadResult
        lesson={LESSON}
        fileName="heat.pdf"
        onUploadAnother={vi.fn()}
        onRegenerated={vi.fn()}
        reviewNotes={NOTES}
      />,
    );
    expect(said()).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try that again" }));

    await waitFor(() => expect(said()).not.toBeInTheDocument());
  });

  it("and lists the re-read's own questions when it left some out", async () => {
    h.awaitParseRun.mockResolvedValue({
      status: "completed_with_review",
      finished: true,
      failureReason: null,
      reviewNotes: [{ code: "question_unusable", questions: ["Explain why pans have wooden handles."], message: SENTENCE }],
    });
    render(<UploadResult lesson={LESSON} fileName="heat.pdf" onUploadAnother={vi.fn()} onRegenerated={vi.fn()} />);
    expect(said()).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try that again" }));

    expect(await screen.findByText("Explain why pans have wooden handles.")).toBeInTheDocument();
    expect(said()).toBeInTheDocument();
  });
});
