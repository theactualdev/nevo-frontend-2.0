import { describe, expect, it } from "vitest";
import type { Invitation } from "@/lib/api/invites";
import { PAGE_SIZE, matchesStatus, pageWindow, statTiles } from "./inviteFilters";

/** What the invitations list counts, filters and pages. */

const NOW = Date.parse("2026-09-15T12:00:00Z");
const FUTURE = "2026-10-01T00:00:00Z";
const PAST = "2026-09-01T00:00:00Z";

const inv = (over: Partial<Invitation> = {}): Invitation => ({
  id: Math.random().toString(36).slice(2),
  token: "t",
  role: "teacher",
  email: "a@example.com",
  name: "Amara",
  status: "pending",
  expiresAt: FUTURE,
  deliveryStatus: null,
  consentStatus: null,
  ...over,
});

describe("statTiles", () => {
  it("counts the frame's three, and no total", () => {
    // The screen's first tile was the row count, which is not a subset any
    // filter can select - so pressing it could only ever mean "clear".
    const tiles = statTiles(
      [
        inv(),
        inv(),
        inv({ status: "joined" }),
        inv({ status: "pending", expiresAt: PAST }),
      ],
      NOW,
    );
    expect(tiles.map((t) => t.key)).toEqual(["pending", "joined", "expired"]);
    expect(tiles.map((t) => t.n)).toEqual([2, 1, 1]);
  });

  it("counts a lapsed pending invite as expired, as the pill already does", () => {
    const tiles = statTiles([inv({ status: "pending", expiresAt: PAST })], NOW);
    expect(tiles.find((t) => t.key === "pending")!.n).toBe(0);
    expect(tiles.find((t) => t.key === "expired")!.n).toBe(1);
  });
});

describe("matchesStatus", () => {
  it("lets everything through with no filter", () => {
    expect(matchesStatus(inv(), "", NOW)).toBe(true);
  });

  it("selects on the invitation's own status", () => {
    expect(matchesStatus(inv({ status: "joined" }), "joined", NOW)).toBe(true);
    expect(matchesStatus(inv({ status: "joined" }), "pending", NOW)).toBe(false);
  });
});

describe("pageWindow", () => {
  it("describes the slice in the frame's words", () => {
    expect(pageWindow(47, 1).label).toBe("Showing 1-20 of 47");
    expect(pageWindow(47, 3).label).toBe("Showing 41-47 of 47");
  });

  it("clamps a page the list no longer has", () => {
    // Narrowing a filter while on page four must not strand the reader on an
    // empty table with the rows silently elsewhere.
    const w = pageWindow(12, 4);
    expect(w.page).toBe(1);
    expect(w.start).toBe(0);
    expect(w.pageCount).toBe(1);
  });

  it("clamps a page below one", () => {
    expect(pageWindow(50, 0).page).toBe(1);
    expect(pageWindow(50, -3).page).toBe(1);
  });

  it("says nothing at all about an empty list", () => {
    const w = pageWindow(0, 1);
    expect(w.label).toBe("");
    expect(w.pageCount).toBe(1);
  });

  it("pages at the frame's size", () => {
    expect(PAGE_SIZE).toBe(20);
    expect(pageWindow(500, 1).pageCount).toBe(25);
  });
});
