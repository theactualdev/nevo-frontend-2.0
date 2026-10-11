import { describe, expect, it } from "vitest";
import { dayOf, longDay, soonestOpening } from "./pastDate";

/** Sunday 13 July 2025, 10:00 local. */
const NOW = new Date(2025, 6, 13, 10, 0);

describe("soonestOpening", () => {
  it("is null while the chosen moment is still ahead", () => {
    expect(soonestOpening("2025-07-13", "10:01", NOW)).toBeNull();
    expect(soonestOpening("2025-07-20", "08:00", NOW)).toBeNull();
  });

  it("is today when the chosen time is still ahead today", () => {
    expect(soonestOpening("2025-07-08", "15:30", NOW)).toBe("2025-07-13");
  });

  it("is tomorrow once that time has gone today", () => {
    expect(soonestOpening("2025-07-08", "08:00", NOW)).toBe("2025-07-14");
    expect(soonestOpening("2025-07-13", "09:59", NOW)).toBe("2025-07-14");
  });

  it("counts the moment itself as gone", () => {
    expect(soonestOpening("2025-07-13", "10:00", NOW)).toBe("2025-07-14");
  });

  it("crosses a month end", () => {
    expect(soonestOpening("2025-07-01", "08:00", new Date(2025, 6, 31, 12, 0))).toBe("2025-08-01");
  });

  it("says nothing about a moment that is not there", () => {
    expect(soonestOpening("", "08:00", NOW)).toBeNull();
    expect(soonestOpening("2025-07-08", "", NOW)).toBeNull();
    expect(soonestOpening("not-a-date", "08:00", NOW)).toBeNull();
  });
});

describe("dayOf and longDay", () => {
  it("write a local day as the date input holds it", () => {
    expect(dayOf(new Date(2025, 0, 5, 23, 59))).toBe("2025-01-05");
  });

  it("write a day as C07i does", () => {
    expect(longDay("2025-07-14")).toBe("Monday 14 July");
  });
});
