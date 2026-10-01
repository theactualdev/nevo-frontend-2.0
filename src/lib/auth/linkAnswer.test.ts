import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import { linkIsDead } from "./linkAnswer";

/**
 * "This link is not working any more" is a door closed for good, so it may
 * only follow the server saying so. A failed check is not that answer.
 */

describe("linkIsDead", () => {
  it("is the server's answer for an unknown, expired or revoked token", () => {
    // What both link reads return, live, for a token they do not know.
    expect(linkIsDead(new ApiError(404, "not found"))).toBe(true);
    expect(linkIsDead(new ApiError(410, "gone"))).toBe(true);
    // The only error the contract declares for either read.
    expect(linkIsDead(new ApiError(422, "unreadable"))).toBe(true);
  });

  it("is never a check that could not run", () => {
    expect(linkIsDead(new ApiError(0, "offline"))).toBe(false);
    expect(linkIsDead(new ApiError(500, "down"))).toBe(false);
    expect(linkIsDead(new ApiError(503, "cold start"))).toBe(false);
    expect(linkIsDead(new ApiError(429, "slow down"))).toBe(false);
  });

  it("is never a failure that is not the API's at all", () => {
    expect(linkIsDead(new Error("network"))).toBe(false);
    expect(linkIsDead(undefined)).toBe(false);
  });
});
