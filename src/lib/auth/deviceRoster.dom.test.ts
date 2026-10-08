import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AGE_OUT_DAYS,
  MAX_REMEMBERED,
  childById,
  pickerEntries,
  rememberChild,
  rememberedChildren,
} from "./deviceRoster";

/**
 * THE DEVICE REMEMBERED EXACTLY ONE CHILD, ON A TABLET SHARED BY A CLASS.
 *
 * That is what 28c exists to fix. A child came back the next morning, found
 * somebody else's name on the lock screen, and the only way forward was to
 * create a second identity - new login, no history, and a class they might not
 * be able to rejoin. Nothing told them or their teacher.
 *
 * The rules these pin come from the frame, and most of them are about what a
 * pre-authentication screen in a room full of other people's children is
 * allowed to say: "first names and avatars only, nowhere a username, surname,
 * class, school code or last-used time", six children, thirty days, and
 * "signing out does not remove a child".
 */

const KEY = "nevo.auth.roster";
const LEGACY = "nevo.auth.profile";

const child = (loginIdentifier: string, displayName?: string) => ({
  schoolCode: "NEVO-1",
  loginIdentifier,
  initials: "XX",
  ...(displayName ? { displayName } : {}),
});

const daysAgo = (n: number) =>
  new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

/** Write a roster directly, to age entries without waiting thirty days. */
const seed = (entries: Record<string, unknown>[]) =>
  window.localStorage.setItem(KEY, JSON.stringify(entries));

const entry = (
  id: string,
  loginIdentifier: string,
  lastUsedAt: string,
  displayName?: string,
) => ({
  id,
  schoolCode: "NEVO-1",
  loginIdentifier,
  initials: "XX",
  shapeIndex: 0,
  lastUsedAt,
  ...(displayName ? { displayName } : {}),
});

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("who the tablet remembers", () => {
  it("remembers more than one child", () => {
    // The whole defect in one assertion.
    rememberChild(child("ada.o", "Ada"));
    rememberChild(child("ben.k", "Ben"));

    expect(rememberedChildren()).toHaveLength(2);
  });

  it("puts the child who just signed in at the front", () => {
    rememberChild(child("ada.o", "Ada"));
    rememberChild(child("ben.k", "Ben"));

    expect(pickerEntries().map((e) => e.name)).toEqual(["Ben", "Ada"]);
  });

  it("keeps six and drops the least recently used", () => {
    for (let i = 0; i < MAX_REMEMBERED + 2; i += 1) {
      rememberChild(child(`kid.${i}`, `Kid${i}`));
    }
    const names = pickerEntries().map((e) => e.name);

    expect(names).toHaveLength(MAX_REMEMBERED);
    expect(names).not.toContain("Kid0");
    expect(names).not.toContain("Kid1");
    expect(names[0]).toBe("Kid7");
  });

  it("does not add the same child twice", () => {
    // Two different children can share a first name on one classroom tablet,
    // so identity is the school code and the login identifier, never the name.
    rememberChild(child("ada.o", "Ada"));
    rememberChild(child("ada.k", "Ada"));
    rememberChild(child("ada.o", "Ada"));

    expect(rememberedChildren()).toHaveLength(2);
  });

  it("caps the list even if storage somehow holds more", () => {
    seed(
      Array.from({ length: 9 }, (_, i) =>
        entry(`id${i}`, `kid.${i}`, daysAgo(i), `Kid${i}`),
      ),
    );

    expect(pickerEntries()).toHaveLength(MAX_REMEMBERED);
  });
});

describe("what the picker is allowed to know", () => {
  it("hands a component no username, school code or last-used time", () => {
    /*
     * The rule that matters most here. This is a pre-authentication screen in a
     * room full of other people's children, and a login identifier beside a
     * school code the whole building knows is most of a credential. The
     * previous lock screen put a child's identifier on screen as a stand-in
     * name, which is the mistake this shape makes structurally impossible.
     */
    rememberChild(child("ada.okafor", "Ada"));

    const serialised = JSON.stringify(pickerEntries());

    expect(serialised).not.toContain("ada.okafor");
    expect(serialised).not.toContain("NEVO-1");
    expect(serialised).not.toMatch(/lastUsedAt|initials/);
  });

  it("gives every row an id that is not built from a credential", () => {
    rememberChild(child("ada.okafor", "Ada"));
    const [row] = pickerEntries();

    expect(row.id).toBeTruthy();
    expect(row.id).not.toContain("ada.okafor");
    expect(row.id).not.toContain("NEVO-1");
  });

  it("looks the credential back up by that id when a PIN is submitted", () => {
    rememberChild(child("ada.okafor", "Ada"));
    const [row] = pickerEntries();

    expect(childById(row.id)?.loginIdentifier).toBe("ada.okafor");
    expect(childById("not-an-id")).toBeNull();
  });

  it("carries no name for a child whose name was never fetched", () => {
    // 28c-4. A PIN login returns a session, not a profile, so a child can be
    // remembered without a name - the picker greets them by shape alone rather
    // than inventing something or showing their username.
    rememberChild(child("ada.o"));

    expect(pickerEntries()[0].name).toBeUndefined();
  });
});

describe("the avatar shape a child learns to recognise", () => {
  it("stays the same when other children sign in", () => {
    /*
     * The frame assigns shapes by list position, which cannot survive a real
     * list: entries are ordered by recency, so Ada's shape would change every
     * time Ben used the tablet. The frame calls it "a secondary cue for a child
     * still learning to read", and a cue that moves is not a cue.
     */
    // Seeded with a shape that RECOMPUTING would not produce: Ada is the only
    // child, so any position-derived scheme gives her 0. If her 4 survives a
    // sign-in, the shape is genuinely stored rather than re-derived.
    seed([{ ...entry("a", "ada.o", daysAgo(1), "Ada"), shapeIndex: 4 }]);

    rememberChild(child("ada.o", "Ada"));

    expect(pickerEntries().find((e) => e.name === "Ada")!.shapeIndex).toBe(4);
  });

  it("is still theirs after other children use the tablet", () => {
    seed([{ ...entry("a", "ada.o", daysAgo(1), "Ada"), shapeIndex: 4 }]);

    rememberChild(child("ben.k", "Ben"));
    rememberChild(child("cara.n", "Cara"));
    rememberChild(child("ada.o", "Ada"));

    expect(pickerEntries().find((e) => e.name === "Ada")!.shapeIndex).toBe(4);
  });

  it("gives a full tablet six different shapes", () => {
    for (let i = 0; i < MAX_REMEMBERED; i += 1) {
      rememberChild(child(`kid.${i}`, `Kid${i}`));
    }
    const shapes = pickerEntries().map((e) => e.shapeIndex);

    expect(new Set(shapes).size).toBe(MAX_REMEMBERED);
  });
});

describe("thirty days of non-use", () => {
  it("forgets a child who has not been here for thirty days", () => {
    seed([
      entry("a", "ada.o", daysAgo(AGE_OUT_DAYS + 1), "Ada"),
      entry("b", "ben.k", daysAgo(2), "Ben"),
    ]);

    expect(pickerEntries().map((e) => e.name)).toEqual(["Ben"]);
  });

  it("keeps a child who was here just inside the window", () => {
    seed([entry("a", "ada.o", daysAgo(AGE_OUT_DAYS - 1), "Ada")]);

    expect(pickerEntries().map((e) => e.name)).toEqual(["Ada"]);
  });

  it("keeps a child whose stamp is unreadable rather than dropping them", () => {
    // Our bug, not theirs. They are re-stamped on the next sign-in.
    seed([entry("a", "ada.o", "not-a-date", "Ada")]);

    expect(pickerEntries().map((e) => e.name)).toEqual(["Ada"]);
  });
});

describe("a device that already remembered somebody", () => {
  it("does not forget them when the roster arrives", () => {
    /*
     * Without this, shipping 28c signs out every tablet in every school: the
     * roster key is new, so a device that remembered a child for months would
     * look like a device nobody has used.
     */
    window.localStorage.setItem(
      LEGACY,
      JSON.stringify({
        schoolCode: "NEVO-1",
        loginIdentifier: "ada.o",
        displayName: "Ada",
        initials: "AO",
      }),
    );

    expect(pickerEntries().map((e) => e.name)).toEqual(["Ada"]);
    expect(childById(pickerEntries()[0].id)?.loginIdentifier).toBe("ada.o");
  });

  it("ignores a legacy profile that is only half a credential", () => {
    window.localStorage.setItem(
      LEGACY,
      JSON.stringify({ displayName: "Ada", initials: "AO" }),
    );

    expect(pickerEntries()).toEqual([]);
  });
});

describe("when the device will not remember anything", () => {
  it("reports nobody rather than throwing", () => {
    // Private mode, or storage refused. Every screen still works and the child
    // signs in in full - screen 28c-2, a supported path.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("refused");
    });

    expect(pickerEntries()).toEqual([]);
  });

  it("does not throw when it cannot write either", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("refused");
    });

    expect(() => rememberChild(child("ada.o", "Ada"))).not.toThrow();
  });

  it("reports nobody when the stored value is not a roster", () => {
    window.localStorage.setItem(KEY, "{not json");

    expect(pickerEntries()).toEqual([]);
  });
});

describe("a name we once had", () => {
  it("is not erased by a later sign-in that could not fetch one", () => {
    // A PIN login returns a session, not a profile. Without this, a child the
    // picker has greeted by name for weeks silently becomes "Welcome back".
    rememberChild(child("ada.o", "Ada"));
    rememberChild(child("ada.o"));

    expect(pickerEntries()[0].name).toBe("Ada");
  });
});

describe("the length of a child's PIN (D58)", () => {
  /*
   * Four digits, four boxes, for every child: no PIN door reads a remembered
   * length any more, so nothing writes one or carries one over.
   */
  it("is not written, whatever a sign-in hands over", () => {
    rememberChild({ ...child("ada.o"), pinLength: 4 });

    expect(childById(pickerEntries()[0].id)).not.toHaveProperty("pinLength");
  });

  it("is shed by an entry stored with one, at its next sign-in", () => {
    // Stored before 6 Oct, it still reads; the next write leaves it behind.
    seed([{ ...entry("e-1", "ada.o", daysAgo(1), "Ada"), pinLength: 6 }]);
    expect(childById("e-1")?.pinLength).toBe(6);

    rememberChild(child("ada.o", "Ada"));

    expect(childById("e-1")).not.toHaveProperty("pinLength");
  });

  it("never reaches the picker", () => {
    // The picker is a pre-authentication screen; a PIN's length narrows a
    // guess, so it stays with the credential it describes.
    rememberChild({ ...child("ada.o", "Ada"), pinLength: 4 });

    expect(pickerEntries()[0]).not.toHaveProperty("pinLength");
  });
});
