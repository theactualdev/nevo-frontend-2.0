import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claimMoveOn, claimReturn } from "./onboardingGate";

/**
 * The loop guard for a Module 4 with nothing to ask (Olayinka, 19 Oct: "an
 * unavailable probe moves the child on, never to a dead end"). The continue
 * route moves such a child Home once; while the server's gate still refuses
 * their lessons, every refusal brings them back, and the second time they
 * must stay put rather than bounce. It lives in `sessionStorage` because the
 * bounce is a full page load each way, which nothing in memory survives.
 */

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe("claimMoveOn", () => {
  it("moves a child on once per tab, and never again", () => {
    expect(claimMoveOn("student-1")).toBe(true);
    expect(claimMoveOn("student-1")).toBe(false);
    expect(claimMoveOn("student-1")).toBe(false);
  });

  it("is each child's own on a shared tablet", () => {
    expect(claimMoveOn("student-1")).toBe(true);
    expect(claimMoveOn("student-2")).toBe(true);
    expect(claimMoveOn("student-2")).toBe(false);
  });

  it("moves nobody it cannot name", () => {
    expect(claimMoveOn(null)).toBe(false);
    expect(claimMoveOn(undefined)).toBe(false);
    expect(claimMoveOn("")).toBe(false);
  });

  it("does not move a child on when it cannot record that it did", () => {
    // A move that cannot be counted is one that could loop.
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(claimMoveOn("student-1")).toBe(false);
  });

  it("does not move a child on when storage cannot be read at all", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(claimMoveOn("student-1")).toBe(false);
  });

  it("records nothing but the move itself: no module, no placement", () => {
    claimMoveOn("student-1");

    const keys = Object.keys(window.sessionStorage);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/moved-on-without-probe:student-1$/);
    expect(window.sessionStorage.getItem(keys[0])).toBe("1");
    expect(window.localStorage.length).toBe(0);
  });
});

/*
 * THE WAY BACK, once per tab per child per page (21 Oct on-screen check): a
 * lesson that still answered 409 `onboarding_required` while readiness said
 * complete sent the child lesson, continue, lesson, for ever. The second
 * time, the caller goes Home.
 */
describe("claimReturn", () => {
  const LESSON = "/student/lessons/les-1?assignment=asg-1";

  it("goes back once, and sends the same child Home after", () => {
    expect(claimReturn("student-1", LESSON)).toBe(true);
    expect(claimReturn("student-1", LESSON)).toBe(false);
    expect(claimReturn("student-1", LESSON)).toBe(false);
  });

  it("is a fresh claim for another page", () => {
    expect(claimReturn("student-1", LESSON)).toBe(true);
    expect(claimReturn("student-1", "/student/lessons/les-2")).toBe(true);
    // The query is part of the page: another assignment is another way back.
    expect(claimReturn("student-1", "/student/lessons/les-1")).toBe(true);
  });

  it("is each child's own on a shared tablet", () => {
    expect(claimReturn("student-1", LESSON)).toBe(true);
    expect(claimReturn("student-2", LESSON)).toBe(true);
    expect(claimReturn("student-2", LESSON)).toBe(false);
  });

  it("is not the move on's, nor the move on its", () => {
    expect(claimMoveOn("student-1")).toBe(true);
    expect(claimReturn("student-1", LESSON)).toBe(true);
    expect(claimMoveOn("student-1")).toBe(false);
  });

  it("sends Home when it cannot record the way back", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(claimReturn("student-1", LESSON)).toBe(false);
  });

  it("sends Home when storage cannot be read at all", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(claimReturn("student-1", LESSON)).toBe(false);
  });

  it("sends Home for a child or a page it cannot name", () => {
    expect(claimReturn(null, LESSON)).toBe(false);
    expect(claimReturn(undefined, LESSON)).toBe(false);
    expect(claimReturn("", LESSON)).toBe(false);
    expect(claimReturn("student-1", "")).toBe(false);
  });

  it("holds the child and the page, and nothing else", () => {
    claimReturn("student-1", LESSON);

    const keys = Object.keys(window.sessionStorage);
    expect(keys).toEqual([`nevo:onboarding:returned:student-1:${LESSON}`]);
    expect(window.sessionStorage.getItem(keys[0])).toBe("1");
    expect(window.localStorage.length).toBe(0);
  });
});
