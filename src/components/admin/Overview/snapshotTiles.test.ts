import { describe, expect, it } from "vitest";
import type { Invitation } from "@/lib/api/invites";
import type { SchoolRosterCounts } from "@/lib/api/school";
import {
  SNAPSHOT_HEADING,
  pendingTeacherInvites,
  snapshotColumns,
  snapshotTiles,
  termPeriod,
} from "./snapshotTiles";

/**
 * What the Overview snapshot is allowed to tell a school about itself.
 *
 * The ones that matter most are the ones the screen shipped wrong: a zero
 * muted everywhere rather than in the early state only, a missing count
 * rendered as 0 - and, until Lydia's 7 Oct rulings, a student denominator from
 * a band that no longer exists and an adaptation total "so far".
 */

const base = {
  studentsProfiled: 12,
  adaptations: 340,
  adaptationPeriod: "in First term" as string | null,
  counts: null as SchoolRosterCounts | null,
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

  it("puts no denominator on any tile - the roster is the number (Lydia, 7 Oct)", () => {
    const tiles = snapshotTiles({
      ...base,
      counts: { classes: 14, teachers: 20, activeStudents: 312 },
    });
    for (const t of tiles) expect(t).not.toHaveProperty("of");
    expect(tile(tiles, "enrolled").value).toBe(312);
  });

  describe("adaptations made, this term (Lydia, 7 Oct)", () => {
    it("names the term the count covers", () => {
      expect(tile(snapshotTiles(base), "adaptations").desc).toBe(
        "across all students in First term",
      );
    });

    it("is absent on a live school with no term to name, never a total since setup", () => {
      const tiles = snapshotTiles({ ...base, adaptationPeriod: null });
      expect(keys(tiles)).not.toContain("adaptations");
    });

    it("keeps the early tile, whose zero needs no period", () => {
      const tiles = snapshotTiles({ ...base, adaptations: 0, adaptationPeriod: null, early: true });
      expect(tile(tiles, "adaptations").desc).toBe("once lessons begin");
    });

    it("names a term by the school's own name, or by the day it began", () => {
      expect(termPeriod({ name: "First term", from: "2026-09-08" })).toBe("in First term");
      expect(termPeriod({ name: "", from: "2026-09-08" })).toBe("since 8 September 2026");
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
        "across all students in First term",
      );
    });
  });

  describe("the section heading", () => {
    it("claims no period, because only one figure under it is scoped to one", () => {
      // The frame says "Activity this week" and SCRUM-39's copy line repeats
      // it, both resting on a period-scoped GET overview that is not deployed.
      // Only the adaptations tile is this term's, and it says so in its own
      // line; a period word in the heading would be false of the rest.
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
