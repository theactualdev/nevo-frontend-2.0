import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  classStudents: vi.fn(),
  allFlags: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  classesApi: { classStudents: h.classStudents },
  intelligenceApi: { allFlags: h.allFlags },
}));

import { countClass } from "./useClassSummaries";

/**
 * A class card's counts are the class page's: the roster, and the open flags
 * the SERVER filtered to the class, through `rosterCounts`.
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

beforeEach(() => {
  h.classStudents.mockReset();
  h.allFlags.mockReset();
});

describe("countClass", () => {
  it("asks the server for this class's open flags, not every flag", async () => {
    h.classStudents.mockResolvedValue([]);
    h.allFlags.mockResolvedValue({ flags: [], complete: true });

    await countClass("c-1");

    expect(h.classStudents).toHaveBeenCalledWith("c-1");
    expect(h.allFlags).toHaveBeenCalledWith(10, { openOnly: true, classId: "c-1" });
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
        flag("chisom", "pattern", true),
        flag("ife", "pattern"),
      ],
      complete: true,
    });

    // Amara once, however many flags; Tunde's sudden change is flagged;
    // Chisom's acknowledged flag is closed; Ife is switched off, so only
    // unable to sign in; Bayo is waiting on a PIN.
    expect(await countClass("c-1")).toEqual({ glance: 1, flagged: 1, cantSignIn: 2 });
  });

  it("gives no count when the flags stopped short", async () => {
    h.classStudents.mockResolvedValue([student("amara")]);
    h.allFlags.mockResolvedValue({ flags: [flag("amara", "pattern")], complete: false });

    expect(await countClass("c-1")).toBeNull();
  });

  it("fails when either read fails, so the card claims nothing", async () => {
    h.classStudents.mockRejectedValue(new Error("500"));
    h.allFlags.mockResolvedValue({ flags: [], complete: true });

    await expect(countClass("c-1")).rejects.toThrow();
  });
});
