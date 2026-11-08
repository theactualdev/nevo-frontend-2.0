import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  classStudents: vi.fn(),
  allFlags: vi.fn(),
  allOpen: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  classesApi: { classStudents: h.classStudents },
  intelligenceApi: { allFlags: h.allFlags },
}));
vi.mock("@/lib/api/escalations", () => ({
  escalationsApi: { allOpen: h.allOpen },
}));

import { countClass } from "./useClassSummaries";

/**
 * A class card's counts are the class page's: the roster, the open flags the
 * SERVER filtered to the class, and the class's open escalations, through
 * `rosterCounts`.
 */

const student = (studentId: string, status = "active", pinResetRequested = false) => ({
  studentId,
  firstName: null,
  lastName: null,
  displayName: studentId,
  loginIdentifier: null,
  status,
  pinResetRequested,
});

const flag = (studentId: string, flagType: string, acknowledged = false) => ({
  id: `${studentId}-${flagType}`,
  studentId,
  flagType,
  description: "",
  generatedAt: "2026-11-01T09:00:00Z",
  acknowledged,
});

const escalation = (studentId: string) => ({ id: `e-${studentId}`, studentId });

beforeEach(() => {
  h.classStudents.mockReset();
  h.allFlags.mockReset();
  h.allOpen.mockReset();
  h.allOpen.mockResolvedValue({ open: [], complete: true });
});

describe("countClass", () => {
  it("asks the server for this class's open flags and open escalations, not every one", async () => {
    h.classStudents.mockResolvedValue([]);
    h.allFlags.mockResolvedValue({ flags: [], complete: true });

    await countClass("c-1");

    expect(h.classStudents).toHaveBeenCalledWith("c-1");
    expect(h.allFlags).toHaveBeenCalledWith(10, { openOnly: true, classId: "c-1" });
    expect(h.allOpen).toHaveBeenCalledWith(10, { classId: "c-1" });
  });

  it("counts children, each state on its own, as the class header does", async () => {
    h.classStudents.mockResolvedValue([
      student("amara"),
      student("tunde"),
      student("chisom"),
      student("bayo", "active", true),
      student("ife", "deactivated"),
    ]);
    h.allFlags.mockResolvedValue({
      flags: [
        flag("amara", "pattern"),
        flag("amara", "pattern_two"),
        flag("tunde", "sudden_change"),
        flag("ife", "pattern"),
      ],
      complete: true,
    });

    // Amara once, however many flags; Tunde's sudden change is flagged; Ife
    // is switched off, so only unable to sign in; Bayo is waiting on a PIN.
    expect(await countClass("c-1")).toEqual({ glance: 1, flagged: 1, cantSignIn: 2 });
  });

  // Lydia, copy pass, 7 Nov: the roster keeps a seen flag's marker, so the
  // card that opens it counts the child too.
  it("still counts a flag learning support has seen", async () => {
    h.classStudents.mockResolvedValue([student("amara"), student("chisom")]);
    h.allFlags.mockResolvedValue({
      flags: [flag("amara", "pattern"), flag("chisom", "pattern", true)],
      complete: true,
    });

    expect(await countClass("c-1")).toEqual({ glance: 2, flagged: 0, cantSignIn: 0 });
  });

  // The class header counts a child raised for learning support as Flagged;
  // the card never read escalations, so it called that class on track.
  it("counts a child a teacher raised for learning support as flagged", async () => {
    h.classStudents.mockResolvedValue([student("amara"), student("chisom")]);
    h.allFlags.mockResolvedValue({ flags: [flag("amara", "pattern")], complete: true });
    h.allOpen.mockResolvedValue({ open: [escalation("chisom")], complete: true });

    expect(await countClass("c-1")).toEqual({ glance: 1, flagged: 1, cantSignIn: 0 });
  });

  it("gives no count when the flags stopped short", async () => {
    h.classStudents.mockResolvedValue([student("amara")]);
    h.allFlags.mockResolvedValue({ flags: [flag("amara", "pattern")], complete: false });

    expect(await countClass("c-1")).toBeNull();
  });

  it("gives no count when the escalations stopped short", async () => {
    h.classStudents.mockResolvedValue([student("amara")]);
    h.allFlags.mockResolvedValue({ flags: [], complete: true });
    h.allOpen.mockResolvedValue({ open: [escalation("amara")], complete: false });

    expect(await countClass("c-1")).toBeNull();
  });

  it("fails when any read fails, so the card claims nothing", async () => {
    h.classStudents.mockRejectedValue(new Error("500"));
    h.allFlags.mockResolvedValue({ flags: [], complete: true });

    await expect(countClass("c-1")).rejects.toThrow();
  });

  it("fails when the escalations read fails, too", async () => {
    h.classStudents.mockResolvedValue([student("amara")]);
    h.allFlags.mockResolvedValue({ flags: [], complete: true });
    h.allOpen.mockRejectedValue(new Error("500"));

    await expect(countClass("c-1")).rejects.toThrow();
  });
});
