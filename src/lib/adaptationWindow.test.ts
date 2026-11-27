import { describe, expect, it, vi } from "vitest";
import type { AdaptationEventRow } from "@/lib/api/schoolIntelligence";
import {
  PAGE,
  collectAdaptationWindow,
  windowStart,
} from "./adaptationWindow";

/**
 * The paging rule, which is the part that can be silently wrong.
 *
 * A per-learner count that is quietly LOW is worse than an absent one on a
 * SENCo screen: it reads as a finding about the child. So every test here is
 * about refusing to report rather than about reporting.
 */

const row = (id: string, studentId: string): AdaptationEventRow => ({
  id,
  studentId,
  studentFirstName: "Amara",
  lessonId: "l1",
  lessonTitle: "Fractions",
  timestamp: "2026-09-13T09:00:00Z",
  trigger: "Paused on the same step.",
  adaptation: "Added a worked example.",
  eventType: "Scaffold added",
});

/** A full page of distinct rows, all for one learner unless told otherwise. */
const fullPage = (from: number, studentId = "s1") =>
  Array.from({ length: PAGE }, (_, i) => row(`e${from + i}`, studentId));

describe("collectAdaptationWindow", () => {
  it("tallies a single short page per learner", async () => {
    const fetchPage = vi.fn().mockResolvedValue({
      events: [row("1", "s1"), row("2", "s1"), row("3", "s2")],
      total: 3,
    });

    const out = await collectAdaptationWindow(fetchPage);
    expect(out.complete).toBe(true);
    expect(out.perLearner).toEqual({ s1: 2, s2: 1 });
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("pages until a short page, not until a total", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ events: fullPage(0), total: PAGE + 1 })
      .mockResolvedValueOnce({ events: [row("x", "s2")], total: PAGE + 1 });

    const out = await collectAdaptationWindow(fetchPage);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 0);
    expect(fetchPage).toHaveBeenNthCalledWith(2, PAGE);
    expect(out.complete).toBe(true);
    expect(out.perLearner).toEqual({ s1: PAGE, s2: 1 });
  });

  it("reports NOTHING when the cap is hit with a full page still coming", async () => {
    // The floor case. Two pages of a log that keeps going.
    const fetchPage = vi
      .fn()
      .mockImplementation((offset: number) =>
        Promise.resolve({ events: fullPage(offset), total: 9999 }),
      );

    const out = await collectAdaptationWindow(fetchPage, 2);
    expect(out.complete).toBe(false);
    expect(out.perLearner).toEqual({});
    // Not a failure: nothing went wrong, there was just more than we read.
    expect(out.error).toBeUndefined();
  });

  it("reports nothing when a page fails, and hands back why", async () => {
    // The caller says a failure and stays quiet on a refusal (Hub, 26 Nov),
    // so it needs the error, not just `complete: false`.
    const down = new Error("500");
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ events: fullPage(0), total: 500 })
      .mockRejectedValueOnce(down);

    const out = await collectAdaptationWindow(fetchPage);
    expect(out.complete).toBe(false);
    expect(out.perLearner).toEqual({});
    expect(out.error).toBe(down);
  });

  it("ignores `total` entirely, in both directions", async () => {
    /*
     * An earlier draft gated on `total` and this test is why it went. If
     * `total` counts the whole log rather than the window it would disagree on
     * every school on every load, blanking the figure everywhere, permanently,
     * for a reason nobody would find. A field with undocumented semantics does
     * not get to decide whether the screen speaks.
     */
    const wildlyHigh = vi
      .fn()
      .mockResolvedValue({ events: [row("1", "s1")], total: 99999 });
    expect(await collectAdaptationWindow(wildlyHigh)).toEqual({
      perLearner: { s1: 1 },
      complete: true,
    });

    const impossiblyLow = vi
      .fn()
      .mockResolvedValue({ events: [row("1", "s1"), row("2", "s1")], total: 0 });
    expect(await collectAdaptationWindow(impossiblyLow)).toEqual({
      perLearner: { s1: 2 },
      complete: true,
    });
  });

  it("counts an event once even if two pages carry it", async () => {
    // Sequential paging against a live log can re-see a row, and a duplicate
    // would inflate exactly one learner.
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ events: fullPage(0), total: PAGE + 1 })
      .mockResolvedValueOnce({ events: [row("e0", "s1")], total: PAGE + 1 });

    const out = await collectAdaptationWindow(fetchPage);
    expect(out.perLearner.s1).toBe(PAGE);
  });

  it("survives a malformed page rather than counting undefined", async () => {
    const fetchPage = vi.fn().mockResolvedValue({ events: null, total: 0 });
    const out = await collectAdaptationWindow(fetchPage);
    expect(out.complete).toBe(true);
    expect(out.perLearner).toEqual({});
  });
});

describe("windowStart", () => {
  it("is seven days back, matching the log screen's own first range", () => {
    const now = Date.parse("2026-09-14T12:00:00Z");
    expect(windowStart(now)).toBe("2026-09-07T12:00:00.000Z");
  });
});
