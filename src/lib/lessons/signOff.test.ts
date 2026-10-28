import { beforeEach, describe, expect, it, vi } from "vitest";

const { review } = vi.hoisted(() => ({ review: vi.fn() }));
vi.mock("@/lib/api/lessons", () => ({ lessonsApi: { review } }));

import { awaitingSignOff, notReviewedTail } from "./signOff";

/**
 * Assign waits for the lesson-wide sign-off (Lydia, 25 Oct). Only the server's
 * own "no" holds a lesson; a review that could not be read holds nothing.
 */
describe("awaitingSignOff", () => {
  beforeEach(() => review.mockReset());

  it("holds only the lessons the server says are not signed off", async () => {
    review.mockImplementation(async (id: string) => ({
      reviewComplete: id === "done",
    }));

    expect(await awaitingSignOff(["done", "waiting"])).toEqual(new Set(["waiting"]));
  });

  it("holds nothing it could not find out about", async () => {
    review.mockImplementation(async (id: string) => {
      if (id === "offline") throw new Error("offline");
      // A deployment that sends no sign-off at all.
      return {};
    });

    expect(await awaitingSignOff(["offline", "older"])).toEqual(new Set());
  });
});

describe("notReviewedTail", () => {
  it("agrees with how many it names", () => {
    expect(notReviewedTail(1)).toBe(
      " isn’t reviewed yet, so it can’t be assigned. Review it first, or untick it.",
    );
    expect(notReviewedTail(2)).toBe(
      " aren’t reviewed yet, so they can’t be assigned. Review them first, or untick them.",
    );
  });
});
