import { describe, expect, it } from "vitest";
import type { Invitation } from "@/lib/api/invites";
import type { SchoolRosterCounts } from "@/lib/api/school";
import {
  SNAPSHOT_HEADING,
  pendingTeacherInvites,
  snapshotColumns,
  snapshotTiles,
  studentCeiling,
} from "./snapshotTiles";

/**
 * What the Overview snapshot is allowed to tell a school about itself.
 *
 * The three that matter most are the three the screen shipped wrong: a
 * denominator taken from a row count rather than the band, a zero muted
 * everywhere rather than in the early state only, and a missing count rendered
 * as 0.
 */

const base = {
  studentsProfiled: 12,
  adaptations: 340,
  counts: null as SchoolRosterCounts | null,
  band: "boutique" as const,
  early: false,
};

const keys = (t: ReturnType<typeof snapshotTiles>) => t.map((x) => x.key);
const tile = (t: ReturnType<typeof snapshotTiles>, k: string) =>
  t.find((x) => x.key === k)!;

describe("snapshotTiles", () => {
  it("omits a count it does not have rather than rendering zero", () => {
    // Every field on SchoolRosterCounts is optional and every read behind one
    // can fail. A school of 300 must never be shown "0 Students enrolled".
    const tiles = snapshotTiles({ ...base, counts: { teachers: 9 } });
    expect(keys(tiles)).toEqual(["profiled", "adaptations", "teachers"]);
  });

  it("keeps a real zero, which is not the same as a missing one", () => {
    const tiles = snapshotTiles({ ...base, counts: { classes: 0 } });
    expect(tile(tiles, "classes").value).toBe(0);
  });

  it("drops the audit's two tiles when the audit could not be read", () => {
    const tiles = snapshotTiles({
      ...base,
      studentsProfiled: null,
      adaptations: null,
      counts: { classes: 4 },
    });
    expect(keys(tiles)).toEqual(["classes"]);
  });

  describe("denominators", () => {
    it("come from the band, never from a row count", () => {
      // SCRUM-39: "Denominators come from the band seat ceiling, not from a
      // count of rows." A row count would render "287 of 287" everywhere.
      const tiles = snapshotTiles({
        ...base,
        band: "mid_market",
        counts: { activeStudents: 287 },
      });
      expect(tile(tiles, "enrolled").of).toBe("of 500");
    });

    it("are absent for enterprise, whose band is a floor and not a ceiling", () => {
      // "801+" has no honest number to put after "of".
      expect(studentCeiling("enterprise")).toBeNull();
      const tiles = snapshotTiles({
        ...base,
        band: "enterprise",
        counts: { activeStudents: 1200 },
      });
      expect(tile(tiles, "enrolled").of).toBeNull();
    });

    it("are absent when the band could not be read", () => {
      const tiles = snapshotTiles({
        ...base,
        band: undefined,
        counts: { activeStudents: 40 },
      });
      expect(tile(tiles, "enrolled").of).toBeNull();
    });

    it("state the truth for a school over its band", () => {
      const tiles = snapshotTiles({
        ...base,
        band: "boutique",
        counts: { activeStudents: 312 },
      });
      const t = tile(tiles, "enrolled");
      expect(t.value).toBe(312);
      expect(t.of).toBe("of 250");
    });

    it("never appear on a tile with no band behind it", () => {
      const tiles = snapshotTiles({
        ...base,
        counts: { classes: 14, teachers: 20, activeStudents: 5 },
      });
      expect(tile(tiles, "classes").of).toBeNull();
      expect(tile(tiles, "teachers").of).toBeNull();
      expect(tile(tiles, "profiled").of).toBeNull();
      expect(tile(tiles, "adaptations").of).toBeNull();
    });
  });

  describe("the early-life zero treatment", () => {
    it("mutes a zero only in the early state", () => {
      const early = snapshotTiles({
        ...base,
        studentsProfiled: 0,
        adaptations: 0,
        early: true,
      });
      expect(tile(early, "profiled").muted).toBe(true);
      expect(tile(early, "adaptations").muted).toBe(true);

      // The same zeros on a live school are a fact about the school, not an
      // "early" reading, and must not be greyed.
      const live = snapshotTiles({
        ...base,
        studentsProfiled: 0,
        adaptations: 0,
        early: false,
      });
      expect(tile(live, "profiled").muted).toBe(false);
      expect(tile(live, "adaptations").muted).toBe(false);
    });

    it("never mutes a figure that is not zero", () => {
      const tiles = snapshotTiles({ ...base, early: true });
      expect(tiles.every((t) => t.muted === false)).toBe(true);
    });

    it("changes the adaptation descriptor rather than leaving a total's wording on a zero", () => {
      expect(
        tile(snapshotTiles({ ...base, adaptations: 0, early: true }), "adaptations")
          .desc,
      ).toBe("once lessons begin");
      expect(tile(snapshotTiles(base), "adaptations").desc).toBe(
        "across all students so far",
      );
    });
  });

  describe("the section heading", () => {
    it("claims no period, because not one figure under it is scoped to one", () => {
      // The frame says "Activity this week" and SCRUM-39's copy line repeats
      // it, both resting on a period-scoped GET overview that is not deployed.
      // studentsProfiled, adaptationEventsLogged and every roster count are
      // all-time or point-in-time, so any period word here is false.
      expect(SNAPSHOT_HEADING).not.toMatch(/week|term|month|today/i);
    });
  });

  describe("snapshotColumns", () => {
    it("forms one desktop row for every count this screen can render", () => {
      expect(snapshotColumns(5)).toBe("xl:grid-cols-5");
      expect(snapshotColumns(4)).toBe("xl:grid-cols-4");
      expect(snapshotColumns(3)).toBe("xl:grid-cols-3");
    });

    it("leaves the two-tile case to the existing two-column grid", () => {
      expect(snapshotColumns(2)).toBe("");
      expect(snapshotColumns(0)).toBe("");
    });

    it("steps at xl, so 1024x768 keeps the spec's 2 x 2", () => {
      // 1280 is this console's own desktop boundary - the sidebar rail's
      // (min-width: 1280px). An `lg:` step here would put four tiles in a row
      // at the tablet size the spec draws as 2 x 2.
      for (const n of [3, 4, 5]) {
        expect(snapshotColumns(n).startsWith("xl:")).toBe(true);
      }
    });
  });
});

describe("the teachers tile's open invitations (D04)", () => {
  const withTeachers = { ...base, counts: { teachers: 18 } as SchoolRosterCounts };

  it("says how many teacher invitations are still open, in the frame's words", () => {
    expect(tile(snapshotTiles({ ...withTeachers, pendingTeacherInvites: 2 }), "teachers").desc).toBe(
      "2 invitations pending",
    );
    expect(tile(snapshotTiles({ ...withTeachers, pendingTeacherInvites: 1 }), "teachers").desc).toBe(
      "1 invitation pending",
    );
  });

  it("keeps the headcount's own words when none are open, or they could not be read", () => {
    for (const pendingTeacherInvites of [0, null, undefined]) {
      expect(tile(snapshotTiles({ ...withTeachers, pendingTeacherInvites }), "teachers").desc).toBe(
        "with a Nevo account",
      );
    }
  });

  it("counts only live teacher invitations", () => {
    const now = Date.parse("2026-09-30T12:00:00Z");
    const inv = (over: Partial<Invitation>): Invitation =>
      ({
        id: "i",
        token: null,
        role: "teacher",
        email: "t@school.edu.ng",
        name: null,
        status: "pending",
        expiresAt: "2026-10-30T00:00:00Z",
        deliveryStatus: null,
        ...over,
      }) as Invitation;
    expect(
      pendingTeacherInvites(
        [
          inv({}),
          inv({ role: "Teacher" }),
          inv({ role: "student" }),
          inv({ status: "accepted" }),
          inv({ status: "revoked" }),
          // Pending on the row, but past its date: expired in fact.
          inv({ expiresAt: "2026-09-01T00:00:00Z" }),
        ],
        now,
      ),
    ).toBe(2);
  });
});
