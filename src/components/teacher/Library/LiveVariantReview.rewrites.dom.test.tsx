import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { LessonSegment } from "@/lib/api/lessons";

const { approveSegment, review, getSession } = vi.hoisted(() => ({
  approveSegment: vi.fn(),
  review: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("@/lib/api/lessons", () => ({ lessonsApi: { approveSegment, review } }));
vi.mock("@/lib/auth/session", () => ({ getSession }));
vi.mock("@/components/shared/IllustrationWrapper", () => ({
  IllustrationWrapper: ({ alt }: { alt: string }) => <div role="img" aria-label={alt} />,
}));

import { LiveVariantReview } from "./LiveVariantReview";

/**
 * THE SIMPLER AND THE LONGER VERSION (Teslim, 18 Oct).
 *
 * Backend wrote both for every section long enough - 740 across 24 lessons -
 * and withholds each from children until a teacher approves the section. This
 * screen showed neither, so approving signed off words nobody had read, and a
 * section approved BEFORE the rewrites existed offered no way to clear them:
 * the button only appeared on unapproved sections. The approve action clears
 * them on an approved section too, keeping the first approval.
 */

const rewrite = (over: Record<string, unknown> = {}) => ({
  body: "",
  reviewStatus: "pending",
  reviewedBy: null,
  reviewedAt: null,
  keyTerms: [],
  equationCallouts: [],
  ...over,
});

const seg = (over: Partial<LessonSegment> = {}): LessonSegment =>
  ({
    id: "seg-1",
    segmentKey: "s1",
    contentType: "explanation",
    sequenceOrder: 1,
    title: "Common denominators",
    body: "…",
    availableModalities: [],
    comprehensionCheckpoints: [],
    needsReview: false,
    reviewReasons: [],
    approved: true,
    approvedAt: "2026-10-01T09:00:00Z",
    textVariant: { body: "Find a common denominator first.", keyPoints: [] },
    visualVariant: null,
    audioVariant: null,
    interactiveVariant: null,
    calculationVariant: null,
    depthVariants: {
      simplified: rewrite({ body: "Make the bottom numbers the same first." }),
      expanded: rewrite({ body: "Before adding, rewrite both fractions over one shared denominator." }),
      model: "x",
    },
    ...over,
  }) as unknown as LessonSegment;

const show = (over: Partial<LessonSegment> = {}) =>
  render(
    <LiveVariantReview
      lessonId="l-1"
      lessonTitle="Adding unlike denominators"
      segment={seg(over)}
      sectionIndex={2}
      segmentCount={5}
    />,
  );

beforeEach(() => {
  approveSegment.mockReset();
  getSession.mockReturnValue({ userId: "teacher-1" });
  approveSegment.mockResolvedValue({
    lessonId: "l-1",
    segmentId: "seg-1",
    approvedAt: "2026-10-01T09:00:00Z",
    approvedBy: "teacher-0",
    approvedSegmentCount: 3,
    segmentCount: 5,
    lessonApproved: false,
  });
});

describe("a section's simpler and longer versions", () => {
  it("shows both under the text they rewrite, as waiting", () => {
    show();

    expect(screen.getByText("Simpler version")).toBeInTheDocument();
    expect(screen.getByText("Make the bottom numbers the same first.")).toBeInTheDocument();
    expect(screen.getByText("Longer version")).toBeInTheDocument();
    expect(screen.getAllByText(/Waiting for your approval/)).toHaveLength(2);
  });

  it("keeps the approve control on an approved section while a rewrite waits", () => {
    show();

    expect(screen.getByRole("button", { name: "Approve the new versions" })).toBeInTheDocument();
    expect(screen.getByText(/approved before Nevo wrote its simpler and longer versions/)).toBeInTheDocument();
  });

  it("clears them with the section's approve action, and says so", async () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Approve the new versions" }));

    await waitFor(() => expect(approveSegment).toHaveBeenCalledWith("l-1", "seg-1"));
    await screen.findByText("Approved", { selector: "span" });
    expect(screen.queryByText(/Waiting for your approval/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Approved on .* by you\./)).toHaveLength(2);
  });

  it("offers the next section once nothing here is waiting", async () => {
    show();
    expect(screen.queryByRole("link", { name: /Next section/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Approve the new versions" }));

    expect(await screen.findByRole("link", { name: /Next section/ })).toHaveAttribute(
      "href",
      "/teacher/lessons/l-1/variants?section=3",
    );
  });

  it("dates an earlier approval, and says 'by you' only for this teacher's id", () => {
    show({
      depthVariants: {
        simplified: rewrite({
          body: "Simpler.",
          reviewStatus: "approved",
          reviewedBy: "teacher-1",
          reviewedAt: "2026-10-18T10:00:00Z",
        }),
        expanded: rewrite({
          body: "Longer.",
          reviewStatus: "approved",
          reviewedBy: "teacher-9",
          reviewedAt: "2026-10-18T10:00:00Z",
        }),
        model: "x",
      },
    } as Partial<LessonSegment>);

    expect(screen.getByText("Approved on 18 October by you.")).toBeInTheDocument();
    expect(screen.getByText("Approved on 18 October.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Approve/ })).not.toBeInTheDocument();
  });

  it("claims nothing about a rewrite nobody recorded a review for", () => {
    show({
      depthVariants: {
        simplified: rewrite({ body: "Simpler.", reviewStatus: "approved" }),
        expanded: null,
        model: "x",
      },
    } as Partial<LessonSegment>);

    expect(screen.getByText("Simpler.")).toBeInTheDocument();
    expect(screen.queryByText(/Approved on/)).not.toBeInTheDocument();
    expect(screen.queryByText("Longer version")).not.toBeInTheDocument();
  });

  it("still asks for the section itself on an unapproved section", () => {
    show({ approved: false, approvedAt: null } as Partial<LessonSegment>);

    expect(screen.getByRole("button", { name: "Approve this section" })).toBeInTheDocument();
    expect(screen.queryByText(/approved before Nevo wrote/)).not.toBeInTheDocument();
  });
});
