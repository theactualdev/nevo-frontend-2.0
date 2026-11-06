import { describe, expect, it } from "vitest";
import { attentionByStudent, profileChip, rosterCounts } from "./summaryState";

/**
 * Design's summary chips (12 Oct): three states, never merged, never a
 * combined number, and on a profile one chip in strict precedence.
 */

const flag = (studentId: string, isSudden: boolean) => ({ studentId, isSudden });

describe("attentionByStudent", () => {
  it("gives a child the strongest of their open flags, in either order", () => {
    expect(attentionByStudent([flag("a", false), flag("a", true)]).get("a")).toBe("sudden");
    expect(attentionByStudent([flag("a", true), flag("a", false)]).get("a")).toBe("sudden");
    expect(attentionByStudent([flag("a", false), flag("a", false)]).get("a")).toBe("glance");
  });

  it("says nothing about a child with no flag", () => {
    expect(attentionByStudent([flag("a", false)]).has("b")).toBe(false);
  });
});

describe("rosterCounts", () => {
  const attention = attentionByStudent([flag("a", false), flag("b", true), flag("d", false)]);

  it("counts each state separately", () => {
    expect(
      rosterCounts(
        [
          { studentId: "a", status: "active" },
          { studentId: "b", status: "active" },
          { studentId: "c", status: "active", pinResetRequested: true },
        ],
        attention,
      ),
    ).toEqual({ glance: 1, flagged: 1, cantSignIn: 1 });
  });

  it("counts a deactivated child only as unable to sign in - their flag is history", () => {
    expect(
      rosterCounts([{ studentId: "d", status: "deactivated" }], attention),
    ).toEqual({ glance: 0, flagged: 0, cantSignIn: 1 });
  });

  it("does not call an account nobody has opened locked out", () => {
    expect(
      rosterCounts([{ studentId: "x", status: "invited", pinResetRequested: true }], attention)
        .cantSignIn,
    ).toBe(0);
  });

  it("stops counting a forgotten PIN once it is cleared, by the server or this visit", () => {
    const asked = { studentId: "c", status: "active", pinResetRequested: true };
    expect(rosterCounts([{ ...asked, pinCleared: true }], attention).cantSignIn).toBe(0);
    expect(rosterCounts([asked], attention, new Set(["c"])).cantSignIn).toBe(0);
  });

  it("keeps a child who forgot their PIN in the attention count too", () => {
    // The row shows one state (C05's precedence); the class has both facts.
    expect(
      rosterCounts([{ studentId: "a", status: "active", pinResetRequested: true }], attention),
    ).toEqual({ glance: 1, flagged: 0, cantSignIn: 1 });
  });
});

describe("profileChip", () => {
  it("puts a sudden change first", () => {
    expect(profileChip([{ isSudden: false }, { isSudden: true }])).toBe("sudden");
  });

  it("is worth a glance when Nevo noticed something and nothing sudden", () => {
    expect(profileChip([{ isSudden: false }])).toBe("glance");
  });

  it("is no chip at all when nothing is open", () => {
    expect(profileChip([])).toBeNull();
  });
});

/**
 * FLAGGED, the person-raised kind (backlog item 7): an OPEN escalation, read
 * with the server's own filter. Design's precedence puts it between a sudden
 * change and worth a glance.
 */
describe("Flagged", () => {
  it("is a child with an open escalation, below a sudden change and above a glance", () => {
    const states = attentionByStudent(
      [flag("glance-too", false), flag("sudden-too", true)],
      new Set(["only", "glance-too", "sudden-too"]),
    );

    expect(states.get("only")).toBe("flagged");
    expect(states.get("glance-too")).toBe("flagged");
    expect(states.get("sudden-too")).toBe("sudden");
  });

  it("counts in the header's flagged, with the sudden changes", () => {
    const students = ["a", "b", "c"].map((studentId) => ({ studentId, status: "active" }));
    const counts = rosterCounts(
      students,
      attentionByStudent([flag("a", true), flag("c", false)], new Set(["b"])),
    );

    expect(counts).toEqual({ glance: 1, flagged: 2, cantSignIn: 0 });
  });

  it("is the profile's one chip unless a sudden change outranks it", () => {
    expect(profileChip([{ isSudden: false }], true)).toBe("flagged");
    expect(profileChip([], true)).toBe("flagged");
    expect(profileChip([{ isSudden: true }], true)).toBe("sudden");
    expect(profileChip([{ isSudden: false }], false)).toBe("glance");
  });
});
