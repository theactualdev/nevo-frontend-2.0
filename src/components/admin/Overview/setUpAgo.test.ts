import { describe, expect, it } from "vitest";
import { setUpAgo } from "./setUpAgo";

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

describe("setUpAgo", () => {
  it("counts calendar days, not rolling hours", () => {
    // 11pm to 8am the next morning is yesterday, not "9 hours ago".
    const finished = new Date(2026, 8, 27, 23).toISOString();
    expect(setUpAgo(finished, at(2026, 9, 28, 8))).toEqual({ short: "yesterday", prose: "yesterday" });
  });

  it("says today, and writes small numbers out in prose as D04 does", () => {
    const iso = new Date(2026, 8, 27, 9).toISOString();
    expect(setUpAgo(iso, at(2026, 9, 27, 17))).toEqual({ short: "today", prose: "today" });
    expect(setUpAgo(iso, at(2026, 9, 30))).toEqual({ short: "3 days ago", prose: "three days ago" });
    expect(setUpAgo(iso, at(2026, 10, 19))?.prose).toBe("22 days ago");
  });

  it("says nothing without a readable date, or with one in the future", () => {
    expect(setUpAgo(undefined, at(2026, 9, 30))).toBeNull();
    expect(setUpAgo("not a date", at(2026, 9, 30))).toBeNull();
    expect(setUpAgo(new Date(2026, 9, 5).toISOString(), at(2026, 9, 30))).toBeNull();
  });
});
