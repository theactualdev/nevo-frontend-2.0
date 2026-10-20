import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AGE_OUT_DAYS,
  MAX_REMEMBERED,
  childById,
  closeRememberedChild,
  pickerEntries,
  rememberChild,
  rememberedChildren,
  retireLegacyProfile,
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

/*
 * ONE TILE PER ACCOUNT (19 Oct browser-storage audit). Sign-in takes either
 * the issued identifier or the admission number, and the roster matched on
 * the pair alone - so a child the tablet knew as "ada.o" who signed in at
 * 00c with "BGA/2031" was remembered again, as a nameless tile beside their
 * own, for the same account.
 */
describe("a child who signs in with their admission number", () => {
  const ADA = {
    schoolCode: "NEVO-1",
    loginIdentifier: "ada.o",
    displayName: "Ada",
    initials: "AD",
    userId: "u-ada",
  };
  /** What 00c remembers: the identifier typed, stand-in initials, no name. */
  const BY_ADMISSION_NUMBER = {
    schoolCode: "NEVO-1",
    loginIdentifier: "BGA/2031",
    initials: "B2",
    userId: "u-ada",
  };

  it("keeps one tile, still named, carrying the identifier that signed in", () => {
    rememberChild(ADA);
    const [before] = rememberedChildren();

    rememberChild(BY_ADMISSION_NUMBER);

    expect(pickerEntries()).toEqual([
      { id: before.id, name: "Ada", shapeIndex: before.shapeIndex },
    ]);
    expect(rememberedChildren()[0]).toMatchObject({
      id: before.id,
      loginIdentifier: "BGA/2031",
      displayName: "Ada",
      initials: "AD",
      userId: "u-ada",
    });
  });

  it("folds the duplicate an earlier sign-in stored into one tile on read", () => {
    const latest = daysAgo(1);
    seed([
      {
        ...entry("e-named", "ada.o", daysAgo(3), "Ada"),
        initials: "AD",
        shapeIndex: 2,
        userId: "u-ada",
      },
      {
        ...entry("e-nameless", "BGA/2031", latest),
        initials: "B2",
        shapeIndex: 0,
        userId: "u-ada",
      },
      { ...entry("e-ben", "ben.k", daysAgo(2), "Ben"), userId: "u-ben" },
    ]);

    expect(pickerEntries().map((e) => e.name)).toEqual(["Ada", "Ben"]);
    expect(childById("e-named")).toMatchObject({
      loginIdentifier: "BGA/2031",
      displayName: "Ada",
      initials: "AD",
      shapeIndex: 2,
      lastUsedAt: latest,
    });
    expect(childById("e-nameless")).toBeNull();
    // Written back, so the next read finds one too.
    const stored = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    expect(stored.map((c: { id: string }) => c.id)).toEqual([
      "e-named",
      "e-ben",
    ]);
  });

  it("folds only by account id, never two entries that carry none", () => {
    // Without an account id nothing shows two entries are one child, and two
    // children are never merged on a guess.
    seed([
      { ...entry("e-ada", "ada.o", daysAgo(4), "Ada"), userId: "u-ada" },
      { ...entry("e-ada-2", "BGA/2031", daysAgo(3)), userId: "u-ada" },
      entry("e-femi", "femi.a", daysAgo(2), "Femi"),
      entry("e-old", "FMI/7", daysAgo(1)),
    ]);

    expect(rememberedChildren().map((c) => c.id)).toEqual([
      "e-old",
      "e-femi",
      "e-ada",
    ]);
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

/**
 * D178 (13 Oct): "Remove the tile when the account closes. Do not keep it for
 * 30 days." The tile stayed until its thirty days ran out, and every tap on it
 * led back to Account Closed. "The 30 day window stays as what it already is:
 * how long the account's data lingers on the device before it drops off."
 */
describe("a child whose account closed", () => {
  const twoAndAda = () =>
    seed([
      { ...entry("a", "ada.o", daysAgo(1), "Ada"), userId: "u-ada" },
      { ...entry("k", "kofi.b", daysAgo(2), "Kofi"), userId: "u-kofi" },
      { ...entry("t", "tolu.a", daysAgo(3), "Tolu"), userId: "u-tolu" },
    ]);

  it.each([
    ["the picker's own row (28c)", { id: "a" }],
    ["the signed-in account (mid-session)", { userId: "u-ada" }],
    ["the pair 00c sent", { schoolCode: "NEVO-1", loginIdentifier: "ada.o" }],
  ])("leaves the picker at once, found by %s", (_, which) => {
    twoAndAda();

    closeRememberedChild(which);

    expect(pickerEntries().map((e) => e.name)).toEqual(["Kofi", "Tolu"]);
  });

  it("leaves every other child exactly as it was", () => {
    twoAndAda();
    const before = JSON.parse(window.localStorage.getItem(KEY)!) as {
      id: string;
    }[];

    closeRememberedChild({ id: "a" });

    const after = JSON.parse(window.localStorage.getItem(KEY)!) as {
      id: string;
    }[];
    expect(after.filter((c) => c.id !== "a")).toEqual(
      before.filter((c) => c.id !== "a"),
    );
  });

  it("keeps their data on the device for the same thirty days", () => {
    twoAndAda();
    const stamped = childById("a")?.lastUsedAt;

    closeRememberedChild({ id: "a" });

    // Still stored, and the clock not restarted.
    expect(childById("a")?.lastUsedAt).toBe(stamped);
    expect(rememberedChildren()).toHaveLength(3);
  });

  it("does not add a child the device never remembered", () => {
    twoAndAda();

    closeRememberedChild({ schoolCode: "NEVO-1", loginIdentifier: "zara.n" });
    closeRememberedChild({ userId: "u-zara" });

    expect(rememberedChildren()).toHaveLength(3);
    expect(pickerEntries()).toHaveLength(3);
  });

  it("comes back with a sign-in that works, which only an open account can make", () => {
    twoAndAda();
    closeRememberedChild({ id: "a" });

    rememberChild(child("ada.o", "Ada"));

    expect(pickerEntries().map((e) => e.name)).toContain("Ada");
  });

  it("is the first to go when the device is full, not a child who can still sign in", () => {
    seed(
      ["a", "b", "c", "d", "e", "f"].map((id, i) =>
        entry(id, `${id}.x`, daysAgo(i + 1), id.toUpperCase()),
      ),
    );
    // The freshest of the six closes.
    closeRememberedChild({ id: "a" });

    rememberChild(child("new.x", "New"));

    // The least recently used open child keeps their tile.
    expect(pickerEntries().map((e) => e.name)).toEqual([
      "New",
      "B",
      "C",
      "D",
      "E",
      "F",
    ]);
  });
});

/*
 * THE OLD SINGLE PROFILE GOES AT SIGN-OUT (19 Oct browser-storage audit). It
 * names one child, with their school code and login identifier, and nothing
 * reads it for anything the roster does not hold - so a sign-out leaves one
 * copy of who uses the tablet, not two. Never before the roster has it.
 */
describe("the old single remembered profile, at sign-out", () => {
  const legacy = {
    schoolCode: "NEVO-1",
    loginIdentifier: "ada.o",
    displayName: "Ada",
    initials: "AO",
  };

  it("is deleted, and the roster still remembers the child", () => {
    rememberChild(child("ada.o", "Ada"));
    window.localStorage.setItem(LEGACY, JSON.stringify(legacy));

    retireLegacyProfile();

    expect(window.localStorage.getItem(LEGACY)).toBeNull();
    expect(pickerEntries().map((e) => e.name)).toEqual(["Ada"]);
  });

  it("is folded into the roster first on a device from before the roster", () => {
    window.localStorage.setItem(LEGACY, JSON.stringify(legacy));

    retireLegacyProfile();

    expect(window.localStorage.getItem(LEGACY)).toBeNull();
    expect(childById(pickerEntries()[0].id)?.loginIdentifier).toBe("ada.o");
  });

  it("is kept when the roster cannot take it, rather than forget the child", () => {
    window.localStorage.setItem(LEGACY, JSON.stringify(legacy));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("refused");
    });

    retireLegacyProfile();

    expect(window.localStorage.getItem(LEGACY)).not.toBeNull();
  });

  it("is kept when the roster cannot be read", () => {
    window.localStorage.setItem(KEY, "{not json");
    window.localStorage.setItem(LEGACY, JSON.stringify(legacy));

    retireLegacyProfile();

    expect(window.localStorage.getItem(LEGACY)).not.toBeNull();
  });
});
