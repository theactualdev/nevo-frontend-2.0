import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claimMoveOn } from "./onboardingGate";

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
