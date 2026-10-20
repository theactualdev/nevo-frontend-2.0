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
  /**
   * The account was closed (`account_closed`), at a door or mid-session.
   *
   * D178 (13 Oct): "Remove the tile when the account closes. Do not keep it
   * for 30 days." The child has been told once, on Account Closed, and after
   * that the tile has no job - every tap leads back to the same screen - so
   * the picker stops showing it at once (`pickerEntries`).
   *
   * THE ENTRY ITSELF STAYS until its thirty days run out: "The 30 day window
   * stays as what it already is: how long the account's data lingers on the
   * device before it drops off." So it is marked, not deleted, and closing it
   * does not restamp `lastUsedAt`. A successful sign-in clears the mark
   * (`rememberChild`), since only an open account can make one.
   */
  closed?: true;
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
    const children = parsed.filter(isChild);
    const merged = mergeSameAccount(children);
    if (merged.length !== children.length) write(merged);
    return merged;
  } catch {
    // Private mode, refused storage, or something that is not our JSON. An
    // unreadable roster is an empty one, which lands on the sign-in screen.
    return [];
  }
}

const stamp = (c: RememberedChild): number => {
  const at = Date.parse(c.lastUsedAt);
  return Number.isNaN(at) ? 0 : at;
};

/**
 * ONE TILE PER ACCOUNT (19 Oct browser-storage audit). `rememberChild` once
 * matched on the credential pair alone, so a child who signed in at 00c with
 * their admission number rather than their issued identifier was remembered
 * a second time - the same account, as a nameless tile beside their own.
 * Entries already stored that way are folded into one here, and written back.
 *
 * The tile the child knows stays: a named one before a nameless one, the
 * latest used among them, with its id, its shape, its name and initials. It
 * takes the newest identifier and last-used time, since that is the pair
 * that last signed in. Closed if any of them is: the account is one account.
 *
 * NEVER WITHOUT AN ACCOUNT ID. Two entries with no `userId` cannot be shown
 * to be the same child, and two children are never merged on a guess.
 */
function mergeSameAccount(children: RememberedChild[]): RememberedChild[] {
  const byAccount = new Map<string, RememberedChild[]>();
  for (const c of children) {
    if (!c.userId) continue;
    byAccount.set(c.userId, [...(byAccount.get(c.userId) ?? []), c]);
  }
  if ([...byAccount.values()].every((group) => group.length < 2)) {
    return children;
  }
  const out: RememberedChild[] = [];
  for (const c of children) {
    const group = c.userId ? byAccount.get(c.userId) : undefined;
    if (!group || group.length < 2) {
      out.push(c);
      continue;
    }
    const latestFirst = [...group].sort((a, b) => stamp(b) - stamp(a));
    const kept =
      latestFirst.find((g) => g.displayName?.trim()) ?? latestFirst[0];
    // Written once, where the kept tile stood; the others are dropped.
    if (c !== kept) continue;
    const newest = latestFirst[0];
    out.push({
      ...kept,
      schoolCode: newest.schoolCode,
      loginIdentifier: newest.loginIdentifier,
      lastUsedAt: newest.lastUsedAt,
      ...(group.some((g) => g.closed) ? { closed: true as const } : {}),
    });
  }
  return out;
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
 * here, and nothing writes it any more (19 Oct, `rememberProfile`): it is
 * deleted at sign-out, once this has run (`retireLegacyProfile`).
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

/**
 * Delete the old single remembered profile, once the roster holds what it did.
 *
 * Called at every sign-out (19 Oct browser-storage audit). The record names
 * ONE child - whoever this device remembered last, signed out or not - with
 * their school code and login identifier, and nothing reads it but the
 * roster, to migrate from it - and nothing writes it since 19 Oct. So a
 * sign-out leaves one copy of who uses this tablet, not two.
 *
 * NEVER BEFORE THE ROSTER HAS IT. A device from before 28c may still hold its
 * child only here, and the read below folds them in first. If the roster
 * cannot be read or written afterwards, the old record stays rather than
 * leave the device remembering nobody.
 */
export function retireLegacyProfile(): void {
  if (typeof window === "undefined") return;
  read();
  try {
    const roster: unknown = JSON.parse(
      window.localStorage.getItem(ROSTER_KEY) ?? "null",
    );
    if (!Array.isArray(roster)) return;
    window.localStorage.removeItem(LEGACY_PROFILE_KEY);
  } catch {
    // An unreadable roster is not one the old record can be dropped in
    // favour of.
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
 * this module, so nothing else can reach a screen. A closed account has no
 * row (D178).
 */
export function pickerEntries(): PickerEntry[] {
  return rememberedChildren()
    .filter((c) => !c.closed)
    .map((c) => ({
    id: c.id,
      ...(c.displayName?.trim() ? { name: c.displayName.trim() } : {}),
      shapeIndex: c.shapeIndex,
    }));
}

/** Which remembered child an `account_closed` was about, as each place knows it. */
export type ClosedAccount =
  /** The picker's own row: the PIN door (28c). */
  | { id: string }
  /** The signed-in account: a closure that lands mid-session. */
  | { userId: string }
  /** The pair the full sign-in (00c) sent. */
  | { schoolCode: string; loginIdentifier: string };

/**
 * Take a closed child's tile off this device's picker (D178).
 *
 * Marks the entry, and nothing else: the thirty-day window it lingers for is
 * unchanged, and every other child on the device is left exactly as it was.
 * A child the device never remembered is not added.
 */
export function closeRememberedChild(which: ClosedAccount): void {
  const isThem = (c: RememberedChild): boolean =>
    "id" in which
      ? c.id === which.id
      : "userId" in which
        ? Boolean(which.userId) && c.userId === which.userId
        : c.schoolCode === which.schoolCode.trim() &&
          c.loginIdentifier === which.loginIdentifier.trim();
  const stored = read();
  if (!stored.some(isThem)) return;
  write(stored.map((c) => (isThem(c) ? { ...c, closed: true } : c)));
}

/** The full entry behind a picker row, for the moment a PIN is submitted. */
export function childById(id: string): RememberedChild | null {
  return rememberedChildren().find((c) => c.id === id) ?? null;
}

/**
 * Record that a child signed in on this device.
 *
 * Matched on the account when the sign-in says which it is, else on school
 * code + login identifier, because that pair is what the server
 * authenticates. Matching on name would merge two different children who
 * share a first name - which on a classroom tablet is not an edge case.
 *
 * THE ACCOUNT FIRST (19 Oct browser-storage audit). Sign-in takes either the
 * issued identifier or the admission number, so the pair alone missed a
 * child who signed in at 00c with the other one, and remembered them again:
 * a second, nameless tile for the same account. An entry found by its
 * account takes the identifier that signed in now.
 *
 * An existing child keeps their id, their shape, their name and its initials
 * - a write without a name brings only stand-in initials - and moves to the
 * front. A
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
  const match =
    (profile.userId
      ? existing.find((c) => c.userId === profile.userId)
      : undefined) ??
    existing.find(
      (c) =>
        c.schoolCode === schoolCode && c.loginIdentifier === loginIdentifier,
    );
  const rest = existing.filter((c) => c !== match);
  const named = Boolean(profile.displayName?.trim());

  const updated: RememberedChild = {
    ...profile,
    schoolCode,
    loginIdentifier,
    // Initials go with the name they were made from: a write without one
    // brings the identifier's stand-in ("B2"), not the child's.
    initials: !named && match?.initials ? match.initials : profile.initials,
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
  // Signed in, so open: a closed mark from before is not this account any more.
  delete updated.closed;

  /*
   * A CLOSED ENTRY GOES FIRST when the device is full. It shows on no picker
   * (D178) and is only waiting out its thirty days, so it must not cost a
   * child who can still sign in their tile.
   */
  const all = [updated, ...rest];
  const next = (
    all.length > MAX_REMEMBERED
      ? [...all.filter((c) => !c.closed), ...all.filter((c) => c.closed)]
      : all
  ).slice(0, MAX_REMEMBERED);
  write(next);
  return next;
}

function freeShapeIndex(taken: RememberedChild[]): number {
  const used = new Set(taken.map((c) => c.shapeIndex));
  for (let i = 0; i < SHAPE_COUNT; i += 1) if (!used.has(i)) return i;
  return taken.length % SHAPE_COUNT;
}
