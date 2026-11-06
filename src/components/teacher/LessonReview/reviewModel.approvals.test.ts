import { describe, expect, it } from "vitest";
import type { LessonReview } from "@/lib/api/lessons";
import { approvalLines, mediaApprovals } from "./reviewModel";

/**
 * The live step's approval record, and the pictures and narration in it
 * (SCRUM-286: "The approval record names who approved, as with rewrites").
 * Every approved item carries `approvedByName` and `approvedAt`; no screen
 * showed them.
 */

const signoff = (kind: string, name: string, at = "2026-10-19T10:00:00Z") => ({
  id: `so-${kind}`,
  kind,
  approvedBy: "t-1",
  approvedByName: name,
  approvedAt: at,
  contentHash: "h",
  current: true,
});

const item = (id: string, status: string, approvedByName: string | null, approvedAt: string | null) => ({
  id,
  segmentId: "s-1",
  kind: "image",
  status,
  approvedByName,
  approvedAt,
});

const review = (over: Record<string, unknown> = {}) =>
  ({
    lessonId: "l-1",
    keyPointApproval: null,
    rewriteApproval: null,
    checksApproval: null,
    guidedStepsApproval: null,
    media: { items: [] },
    ...over,
  }) as unknown as LessonReview;

describe("mediaApprovals", () => {
  it("names each person once, at their latest approval, and only approved items", () => {
    const out = mediaApprovals(
      review({
        media: {
          items: [
            item("p1", "approved", "Ms. Adeyemi", "2026-10-18T10:00:00Z"),
            item("p2", "approved", "Ms. Adeyemi", "2026-10-19T10:00:00Z"),
            item("p3", "awaiting_review", null, null),
            item("p4", "approved", "Mr. Okafor", "2026-10-20T10:00:00Z"),
          ],
        },
      }),
    );

    expect(out).toEqual([
      { approvedByName: "Ms. Adeyemi", approvedAt: "2026-10-19T10:00:00Z" },
      { approvedByName: "Mr. Okafor", approvedAt: "2026-10-20T10:00:00Z" },
    ]);
  });

  it("names nobody where nothing was approved", () => {
    expect(mediaApprovals(review())).toEqual([]);
  });
});

describe("approvalLines, with the pictures and narration", () => {
  it("stays one line when the same person approved everything that day", () => {
    const lines = approvalLines(
      review({
        keyPointApproval: signoff("key_points", "Ms. Adeyemi"),
        media: { items: [item("p1", "approved", "Ms. Adeyemi", "2026-10-19T09:00:00Z")] },
      }),
    );

    expect(lines).toEqual(["Approved by Ms. Adeyemi · 19 October"]);
  });

  it("names who approved the media when it was someone else", () => {
    const lines = approvalLines(
      review({
        keyPointApproval: signoff("key_points", "Ms. Adeyemi"),
        media: { items: [item("p1", "approved", "Mr. Okafor", "2026-10-19T09:00:00Z")] },
      }),
    );

    expect(lines).toEqual([
      "Pictures and narration approved by Mr. Okafor · 19 October",
      "Key points approved by Ms. Adeyemi · 19 October",
    ]);
  });
});
