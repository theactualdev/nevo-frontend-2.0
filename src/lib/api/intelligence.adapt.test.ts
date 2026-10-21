import { beforeEach, describe, expect, it, vi } from "vitest";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("./client", () => ({ api: { get: vi.fn(), post } }));

import { intelligenceApi } from "./intelligence";

/**
 * Transport only. The lesson session rides an `in_lesson` read because the
 * engine refuses one without it (20 Oct production run); a read that has no
 * sitting to name sends none, rather than a null claiming there is none.
 */

const SEGMENTS = [
  { id: "seg-1", segmentType: "explanation" as const, availableModalities: ["text"] },
];

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue({});
});

describe("getAdaptation", () => {
  it("names the lesson session when it is given", async () => {
    await intelligenceApi.getAdaptation("l-1", SEGMENTS, {
      mode: "in_lesson",
      sessionId: "sess-1",
      signals: { currentSegmentId: "seg-1" },
    });

    expect(post).toHaveBeenCalledWith("/api/intelligence/adapt", {
      lessonId: "l-1",
      segments: SEGMENTS,
      studentId: null,
      sessionId: "sess-1",
      mode: "in_lesson",
      signals: { currentSegmentId: "seg-1" },
    });
  });

  it("sends no session at all when there is none to name", async () => {
    await intelligenceApi.getAdaptation("l-1", SEGMENTS, { mode: "lesson_load" });

    const body = post.mock.calls[0]![1] as Record<string, unknown>;
    expect(body).not.toHaveProperty("sessionId");
    expect(body.studentId).toBeNull();
  });
});
