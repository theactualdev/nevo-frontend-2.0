import { beforeEach, describe, expect, it, vi } from "vitest";

const { review } = vi.hoisted(() => ({ review: vi.fn() }));
vi.mock("@/lib/api/lessons", () => ({ lessonsApi: { review } }));

import {
  assignable,
  awaitingSignOff,
  notReviewedTail,
  signOffGates,
  splitsAssignable,
} from "./signOff";

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

  // Teslim b0e0a4f: the guard takes `readyToAssign`, which leaves the checks out.
  it("holds on readyToAssign once the server has split them, not on the full sign-off", async () => {
    review.mockImplementation(async (id: string) => ({
      readyToAssign: id !== "keypoints",
      // Its checks are still to review - that no longer holds it.
      reviewComplete: false,
    }));

    expect(await awaitingSignOff(["checks-only", "keypoints"], true)).toEqual(
      new Set(["keypoints"]),
    );
  });
});

describe("which server, and what holds Assign", () => {
  it("knows the split has happened only from canAssign being sent", () => {
    expect(splitsAssignable({ canAssign: false })).toBe(true);
    expect(splitsAssignable({ canAssign: true })).toBe(true);
    expect(splitsAssignable({})).toBe(false);
    expect(splitsAssignable(null)).toBe(false);
    expect(signOffGates({})).toBe(true);
    expect(signOffGates({ canAssign: true })).toBe(false);
  });

  it("offers a card on canAssign where it is sent, and on the old sign-off where not", () => {
    // Checks still to review, everything else signed: assignable now.
    expect(assignable({ canAssign: true, reviewComplete: false })).toBe(true);
    expect(assignable({ canAssign: false, reviewComplete: true })).toBe(false);
    // An older server: only its own "not signed off" holds.
    expect(assignable({ reviewComplete: false })).toBe(false);
    expect(assignable({ reviewComplete: null })).toBe(true);
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
