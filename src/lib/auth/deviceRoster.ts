import type { RememberedProfile } from "./session";

/**
 * The children this classroom tablet remembers.
 *
 * 28c: *"a classroom tablet remembers up to six recent children so most
 * sign-ins skip full auth"*, replacing the single-identity lock screen that
 * kept the last child's name on an unauthenticated screen. The device used to
 * remember exactly ONE child, which is why a shared tablet quietly cost the
 * previous child their account: they came back, found somebody else's name on
 * the lock screen, and the only way forward was to create a second identity
 * with no history and a class they might not be able to rejoin.
 *
 * WHAT MAY BE STORED AND WHAT MAY BE SHOWN ARE DIFFERENT QUESTIONS, and the
 * split is the whole point of this module. A PIN login needs a school code and
 * a login identifier, so both are stored. The frame is explicit that the picker
 * shows *"first names and avatars only, nowhere a username, surname, class,
 * school code or last-used time"* - this is a pre-authentication screen in a
 * room full of other people's children, and a username beside a school code
 * every child in the building knows is most of a credential.
 *
 * So components never receive an entry. They receive `pickerEntries()`, which
 * carries a name, a shape slot and an opaque id and nothing else. The
 * identifier is looked back up by that id at the moment a PIN is submitted, in
 * `childById`. A component that cannot see a credential cannot leak one.
 *
 * NOT A PROFILE OF A CHILD. Nothing here describes how anybody learns; it is
 * the device's list of who uses it, which is the same kind of fact as a
 * remembered password prompt. It never leaves the device and is never sent to
 * the engine.
 */

const ROSTER_KEY = "nevo.auth.roster";
/** The old single-profile key, read once so no device forgets its child. */
const LEGACY_PROFILE_KEY = "nevo.auth.profile";

/** 28c: "remembers up to six recent children". */
export const MAX_REMEMBERED = 6;
/** 28c: "entries age out after thirty days of non-use". */
export const AGE_OUT_DAYS = 30;
const AGE_OUT_MS = AGE_OUT_DAYS * 24 * 60 * 60 * 1000;

/**
 * How many distinct avatar shapes the picker draws before repeating.
 *
 * Six, so a full device gives every child a different one.
 */
export const SHAPE_COUNT = 6;

export interface RememberedChild extends RememberedProfile {
  /**
   * Opaque, device-local, and the only part of an entry a component sees.
   *
   * Deliberately NOT derived from the login identifier or the school code.
   * A derived id would be a reversible-ish handle on a credential travelling
   * through props and the DOM, for no gain - nothing outside this device ever
   * needs to recognise it.
   */
  id: string;
  /**
   * Which avatar shape this child gets, fixed when they are first remembered.
   *
   * THE FRAME ASSIGNS THIS BY LIST POSITION, and that cannot be right once the
   * list is real: entries are ordered by recency, so a child's shape would
   * change every time another child signed in. The frame calls the shape *"a
   * secondary cue for a child still learning to read"*, and a cue that moves is
   * not a cue. Stored per child instead. Raised with design.
   */
  shapeIndex: number;
  /**
   * When this child last signed in here. Used for ordering and for the
   * thirty-day age-out, and NEVER rendered - the frame rules out a last-used
   * time on the picker explicitly, and it would tell a passer-by who was on
   * this tablet and when.
   *
   * `Date.now()`, not `performance.now()`: rule 4 governs anything timed and
   * sent to the engine, and this is neither. A tablet whose clock is badly
   * wrong ages entries out early, and the cost of that is a full sign-in -
   * screen 28c-2, which is a supported path rather than a broken one.
   */
  lastUsedAt: string;
}

/** Everything a component may know about a remembered child. */
export interface PickerEntry {
  id: string;
  /** First name only, and absent when the name was never fetched (28c-4). */
  name?: string;
  shapeIndex: number;
}

function read(): RememberedChild[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ROSTER_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return migrateLegacy();
    return parsed.filter(isChild);
  } catch {
    // Private mode, refused storage, or something that is not our JSON. An
    // unreadable roster is an empty one, which lands on the sign-in screen.
    return [];
  }
}

function isChild(v: unknown): v is RememberedChild {
  if (typeof v !== "object" || v === null) return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c.id === "string" &&
    typeof c.schoolCode === "string" &&
    typeof c.loginIdentifier === "string" &&
    typeof c.lastUsedAt === "string" &&
    typeof c.shapeIndex === "number"
  );
}

/**
 * Fold the old single remembered profile into the roster, once.
 *
 * Without this, shipping 28c would sign out every device that already
 * remembered somebody - the roster key is new, so every tablet in every school
 * would look like a tablet nobody has used. The legacy key is left in place
 * rather than deleted: it picks no door any more, but `rememberProfile` still
 * writes it and `setStoredDisplayName` still reads it through
 * `getRememberedProfile` - see `rememberProfile` in `session.ts`.
 */
function migrateLegacy(): RememberedChild[] {
  try {
    const raw = window.localStorage.getItem(LEGACY_PROFILE_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw) as RememberedProfile;
    if (!p?.schoolCode || !p?.loginIdentifier) return [];
    const migrated: RememberedChild[] = [
      {
        ...p,
        id: newId(),
        shapeIndex: 0,
        // Unknown, and "now" is the safe guess: it gives the child the full
        // thirty days rather than ageing them out on an arbitrary old date.
        lastUsedAt: new Date().toISOString(),
      },
    ];
    write(migrated);
    return migrated;
  } catch {
    return [];
  }
}

function write(children: RememberedChild[]): void {
  try {
    window.localStorage.setItem(ROSTER_KEY, JSON.stringify(children));
  } catch {
    // The device simply will not remember. Every screen still works; the child
    // signs in in full, which is the same path a new tablet takes.
  }
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // Not a security token - only a key for `childById`. `randomUUID` needs a
    // secure context, and a school tablet on plain http is a real deployment.
    return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
}

const isFresh = (c: RememberedChild, now: number): boolean => {
  const at = Date.parse(c.lastUsedAt);
  // An unparseable stamp is our bug, not the child's; keeping them is the
  // kinder failure, and they will be re-stamped on the next sign-in.
  if (Number.isNaN(at)) return true;
  return now - at < AGE_OUT_MS;
};

/**
 * Who this device remembers: freshest first, aged-out entries dropped, capped.
 *
 * The cap is applied on READ as well as on write, so a roster that somehow grew
 * past six - an older build, a hand-edited value - still shows six.
 */
export function rememberedChildren(): RememberedChild[] {
  const now = Date.now();
  return read()
    .filter((c) => isFresh(c, now))
    .sort((a, b) => Date.parse(b.lastUsedAt) - Date.parse(a.lastUsedAt))
    .slice(0, MAX_REMEMBERED);
}

/**
 * The picker's rows. A name, a shape and an opaque id - nothing else leaves
 * this module, so nothing else can reach a screen.
 */
export function pickerEntries(): PickerEntry[] {
  return rememberedChildren().map((c) => ({
    id: c.id,
    ...(c.displayName?.trim() ? { name: c.displayName.trim() } : {}),
    shapeIndex: c.shapeIndex,
  }));
}

/** The full entry behind a picker row, for the moment a PIN is submitted. */
export function childById(id: string): RememberedChild | null {
  return rememberedChildren().find((c) => c.id === id) ?? null;
}

/**
 * Record that a child signed in on this device.
 *
 * Matched on school code + login identifier, because that pair is what the
 * server authenticates. Matching on name would merge two different children
 * who share a first name - which on a classroom tablet is not an edge case.
 *
 * An existing child keeps their id and their shape and moves to the front. A
 * new child joins the front, and if that makes seven, the least recently used
 * drops off. Signing out does not call this and does not remove anybody, which
 * is 28c's rule: *"signing out does not remove a child"*.
 */
export function rememberChild(profile: RememberedProfile): RememberedChild[] {
  const schoolCode = profile.schoolCode?.trim();
  const loginIdentifier = profile.loginIdentifier?.trim();
  // Neither is optional for a PIN login, and half a credential remembers
  // nobody - see `rememberOnboardedStudent`, which learned this the hard way.
  if (!schoolCode || !loginIdentifier) return rememberedChildren();

  const existing = rememberedChildren();
  const match = existing.find(
    (c) => c.schoolCode === schoolCode && c.loginIdentifier === loginIdentifier,
  );
  const rest = existing.filter((c) => c !== match);

  const updated: RememberedChild = {
    ...profile,
    schoolCode,
    loginIdentifier,
    id: match?.id ?? newId(),
    // Kept across sign-ins so a child's shape is the same every morning. A new
    // child takes the lowest slot nobody on the device is using, so a full
    // tablet shows six different shapes.
    shapeIndex: match?.shapeIndex ?? freeShapeIndex(rest),
    lastUsedAt: new Date().toISOString(),
    // The account id: a write that does not carry it (the name lookup,
    // an older caller) must not forget which account this entry is.
    ...(profile.userId
      ? { userId: profile.userId }
      : match?.userId
        ? { userId: match.userId }
        : {}),
    // A later sign-in that could not fetch a name must not erase one we
    // already had: the picker would silently fall back to "Welcome back" for a
    // child it has greeted by name for weeks.
    ...(profile.displayName?.trim()
      ? { displayName: profile.displayName.trim() }
      : match?.displayName
        ? { displayName: match.displayName }
        : {}),
  };

  /*
   * NO PIN LENGTH, written or carried over (D58, 6 Oct): every PIN door draws
   * four whatever a device remembers. An entry stored before then still reads
   * - the field stays on the type - and sheds it at its next sign-in.
   */
  delete updated.pinLength;

  const next = [updated, ...rest].slice(0, MAX_REMEMBERED);
  write(next);
  return next;
}

function freeShapeIndex(taken: RememberedChild[]): number {
  const used = new Set(taken.map((c) => c.shapeIndex));
  for (let i = 0; i < SHAPE_COUNT; i += 1) if (!used.has(i)) return i;
  return taken.length % SHAPE_COUNT;
}
