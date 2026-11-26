import { beforeEach, describe, expect, it, vi } from "vitest";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("./client", () => ({ api: { post, get: vi.fn(), patch: vi.fn(), del: vi.fn() } }));

import { paperWorkApi } from "./paperWork";

beforeEach(() => {
  post.mockReset().mockResolvedValue({ status: "matched", marks: [] });
});

describe("typed paper work (L59)", () => {
  it("posts the check's steps, in order, to the child's own lesson", async () => {
    const body = {
      sessionId: "s-1",
      segmentId: "seg-1",
      questionId: "q-1",
      clientSubmissionId: "c-1",
      steps: [
        { stepId: "st-1", answer: "4" },
        { stepId: "st-2", answer: "3/4" },
      ],
    };

    await paperWorkApi.submitTyped("lesson-1", body);

    expect(post).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/students/me/lessons/lesson-1/paper-work/typed",
      body,
    );
  });

  it("encodes the lesson id rather than interpolating it raw", async () => {
    await paperWorkApi.submitTyped("a/b", {
      sessionId: "s",
      segmentId: "g",
      questionId: "q",
      steps: [{ stepId: "x", answer: "1" }],
    });

    expect(post.mock.calls[0][0]).toBe("/api/v1/students/me/lessons/a%2Fb/paper-work/typed");
  });
});
