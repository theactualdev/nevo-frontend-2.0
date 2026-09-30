import { describe, expect, it } from "vitest";
import type { SchoolTerm } from "@/lib/api/school";
import {
  currentHalfTerm,
  customProblem,
  rangeWords,
  startOfDay,
  windowFor,
} from "./logWindow";

const TERM: SchoolTerm = {
  id: "t1",
  name: "First term",
  start: "2026-09-14",
  end: "2026-12-18",
  halfTermStart: "2026-10-26",
  halfTermEnd: "2026-10-30",
};

const on = (ymd: string, hour = 12) => startOfDay(ymd)!.getTime() + hour * 3600e3;

describe("currentHalfTerm", () => {
  it("is the first half, from the term's start, before the break", () => {
    expect(currentHalfTerm([TERM], on("2026-10-05"))).toEqual({ from: "2026-09-14" });
  });

  it("is still the first half during the break - the half that just ran", () => {
    expect(currentHalfTerm([TERM], on("2026-10-28"))).toEqual({ from: "2026-09-14" });
  });

  it("is the second half once the break is over", () => {
    expect(currentHalfTerm([TERM], on("2026-11-10"))).toEqual({ from: "2026-10-30" });
  });

  it("names no half-term for a term with no break recorded, rather than halving it", () => {
    const bare = { ...TERM, halfTermStart: undefined, halfTermEnd: undefined };
    expect(currentHalfTerm([bare], on("2026-10-05"))).toEqual({ missing: "half-term" });
  });

  it("names none between terms", () => {
    expect(currentHalfTerm([TERM], on("2027-01-02"))).toEqual({ missing: "term" });
    expect(currentHalfTerm([], on("2026-10-05"))).toEqual({ missing: "term" });
  });

  it("counts the term's last day as inside it", () => {
    expect(currentHalfTerm([TERM], on("2026-12-18", 23))).toEqual({ from: "2026-10-30" });
  });
});

describe("windowFor", () => {
  const now = on("2026-11-10");

  it("sends the half-term's start and no end", () => {
    const w = windowFor({ kind: "half-term" }, now, { from: "2026-10-30" });
    expect(w).toEqual({ dateFrom: startOfDay("2026-10-30")!.toISOString() });
  });

  it("asks for nothing when there is no half-term to name", () => {
    expect(windowFor({ kind: "half-term" }, now, { missing: "half-term" })).toBeNull();
    expect(windowFor({ kind: "half-term" }, now, null)).toBeNull();
  });

  it("sends a custom range's whole last day as its end", () => {
    const w = windowFor({ kind: "custom", from: "2026-10-01", to: "2026-10-07" }, now, null)!;
    expect(w.dateFrom).toBe(startOfDay("2026-10-01")!.toISOString());
    const end = new Date(w.dateTo!);
    expect(end.getDate()).toBe(7);
    expect(end.getHours()).toBe(23);
  });

  it("asks for nothing when the range runs backwards", () => {
    expect(windowFor({ kind: "custom", from: "2026-10-07", to: "2026-10-01" }, now, null)).toBeNull();
  });

  it("keeps the week as the last seven days", () => {
    const w = windowFor({ kind: "week" }, now, null)!;
    expect((now - Date.parse(w.dateFrom)) / 864e5).toBe(7);
    expect(w.dateTo).toBeUndefined();
  });
});

describe("customProblem and rangeWords", () => {
  it("says what is wrong with a range", () => {
    expect(customProblem("2026-10-07", "2026-10-01")).toMatch(/start date is after the end/);
    expect(customProblem("", "2026-10-01")).toMatch(/both dates/);
    expect(customProblem("2026-10-01", "2026-10-01")).toBeNull();
  });

  it("words each window the way the count line reads it", () => {
    expect(rangeWords({ kind: "week" })).toBe("in the last 7 days");
    expect(rangeWords({ kind: "half-term" })).toBe("this half-term");
    expect(rangeWords({ kind: "custom", from: "2026-04-08", to: "2026-07-24" })).toBe(
      "between 8 Apr and 24 Jul 2026",
    );
    expect(rangeWords({ kind: "custom", from: "2025-12-01", to: "2026-01-10" })).toBe(
      "between 1 Dec 2025 and 10 Jan 2026",
    );
  });
});
