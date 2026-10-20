/**
 * Onboarding draft state - who 05 Entry found, carried from the entry screen
 * through the baseline to PIN creation, kept in sessionStorage so it survives
 * the navigation and dies with the tab. At PIN creation the draft folds into
 * the device's RememberedProfile (`session.ts`), which is what the
 * returning-student login screen unlocks against.
 *
 * NOTHING IN IT IS ASKED OF THE CHILD any more, beyond the two things they
 * type on 05. Name, age and class are on the school's roster, and the entry
 * lookup states them (SCRUM-208): the name and age steps, the class step and
 * the class code are gone, and so are the fields that held their answers.
 */

import type { EntryIdentity } from "./firstPin";
import { clearSession, getSession, rememberProfile } from "./session";

const DRAFT_KEY = "nevo.onboarding.draft";

export interface OnboardingDraft {
  /**
   * The child's first name, from the roster row the lookup matched. Greets
   * them on a remembered device; never typed by the child.
   */
  name?: string;
  /**
   * The entry lookup's `ageBand`, the spec's closed `AgeBand`: from the
   * roster's date of birth or, with none, from the enrolled class year
   * (backend, 9 Oct). Absent only when the server gives none, and the child is
   * never asked (D153). It replaced the lookup's `age`, which this side used
   * to band itself.
   */
  ageBand?: string;
  /** The four-character code the child typed on 05, which the lookup matched. */
  schoolCode?: string;
  /**
   * The Student ID / Admission Number the child typed on 05. The other half
   * of the pair their first PIN is stored against - see `bindFirstPin`.
   */
  admissionNumber?: string;
  /**
   * The entry lookup's consent answer for this child, as 05 read it: `given`,
   * or not here at all.
   *
   * THE ONLY CONSENT READ THERE IS BEFORE THE ACCOUNT EXISTS. The baseline is
   * sat before the PIN step creates one, so there is no session to ask the
   * consent gate with, and the run used to capture regardless (19 Oct
   * browser-storage audit). It captures on this, and only this, now. Absent
   * is not given: a run with no answer holds (`ProfilingFlow`).
   */
  consent?: "given";
  /**
   * The account this run's first PIN created, once it has (19 Oct). The
   * session it started is this run's own: a reload of the sequence keeps it
   * rather than ending it as somebody else's (`endSessionNotThisRuns`).
   */
  userId?: string;
}

export function getOnboardingDraft(): OnboardingDraft {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as OnboardingDraft) : {};
  } catch {
    return {};
  }
}

export function mergeOnboardingDraft(patch: OnboardingDraft): void {
  try {
    window.sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ ...getOnboardingDraft(), ...patch }),
    );
  } catch {
    // Private mode etc. - the flow still works, the device just won't remember.
  }
}

/**
 * Begin a NEW child's draft, with only what this arrival brought.
 *
 * THE DRAFT OUTLIVED ITS CHILD. It is cleared when onboarding remembers a
 * child - and nowhere else. A child who walked away mid-onboarding left their
 * name and age in the tab, so the next child on the same tablet was greeted as
 * them. Called where a new child starts (the welcome screen, and a match on
 * 05), so no earlier child's answers are carried in.
 */
export function startOnboardingDraft(seed: OnboardingDraft = {}): void {
  try {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(seed));
  } catch {
    // Private mode etc. - there is no earlier draft to leak either.
  }
}

export function clearOnboardingDraft(): void {
  try {
    window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

/**
 * WHAT 05 ENTRY OR THE SEQUENCE DOES WITH A SESSION IT FINDS STORED AS IT
 * OPENS (19 Oct browser-storage audit).
 *
 * The onboarding routes let a stored session through, and everything on them
 * sent it: 05's lookup, the onboarding signal stream, the consent read, the
 * account read. So a new child's first minutes were recorded against the
 * last child's account, the last child's consent decided whether the new
 * child's baseline was captured, and when the last child's token died its
 * 401 sent the new child - who had no session - off their own run.
 *
 * But a stored session is not always somebody else's. Back from the first
 * lesson after You're In lands a child who has just made their account on
 * the sequence, signed in on their own new session, and ending it signed
 * them out onto an empty 05. So the rule is the run's, not the screen's:
 * ONLY A SESSION BELONGING TO A DIFFERENT CHILD THAN THE RUN IN PROGRESS IS
 * ENDED. The run in progress is the one the draft names - the pair 05
 * matched - and it is the session's own once its first PIN has made the
 * account (the draft's `userId`).
 *
 *  - A different child's run is in progress: the session ends, through the
 *    path every sign-out takes, so its child's leftovers go as at Sign out -
 *    one last try for their unsent signals with their own token, their held
 *    answers and progress kept - and the run goes on with no token until its
 *    own first PIN.
 *  - No run is in progress, or it is the session's own: the child is
 *    signed in, and is routed on to finishing onboarding for a signed-in
 *    child (`OnboardingResume`), which resumes what is left or goes Home.
 *    Nothing is ended.
 *  - An SSO child starts the sequence signed in, on their own session.
 */
export type Arrival = "stay" | "routeOn";

/** Where onboarding goes on for a signed-in child (`OnboardingResume`). */
export const CONTINUE_ROUTE = "/student/onboarding/continue";

/** A different child's run is in progress, by the draft, for this session. */
function differentChildsRun(userId: string): boolean {
  return (
    entryIdentityFromDraft() !== null &&
    getOnboardingDraft().userId !== userId
  );
}

/**
 * 05 Entry (and 03, the same screen). Ending a session here also clears the
 * draft that was in progress: 05 writes its own on the next match, and the
 * old one is not that run's.
 */
export function arriveAtEntry(): Arrival {
  const session = getSession();
  if (!session) return "stay";
  if (!differentChildsRun(session.userId)) return "routeOn";
  clearSession();
  clearOnboardingDraft();
  return "stay";
}

/**
 * The sequence. Ending a session here keeps the draft: it is the run in
 * progress, and the sequence goes on with it (`endForNewChild`).
 */
export function arriveAtSequence(): Arrival {
  const session = getSession();
  if (!session || session.method === "sso") return "stay";
  if (!differentChildsRun(session.userId)) return "routeOn";
  endForNewChild(session.userId);
  return "stay";
}

/**
 * Sessions ended for a child whose run is in progress: their ending does not
 * take the draft that run is using (`forgetOnboardingDraft`).
 *
 * THE DRAFT WENT WITH THE SESSION IT WAS ENDED FOR (19 Oct). The ending is
 * announced a moment later, and the clean-up it runs found no screen holding
 * the draft yet - the sequence claims it after its first render, which is
 * where the session is ended - so a child sent straight to the sequence lost
 * their school code, Student ID, name and 05's consent answer, and was sent
 * back to an empty 05. Marked before the session ends, so the order cannot
 * matter.
 */
const endedForNewChild = new Set<string>();

function endForNewChild(userId: string): void {
  endedForNewChild.add(userId);
  clearSession();
}

/** How many open screens are using the draft (05 Entry, the sequence). */
let draftInUse = 0;

/**
 * Say that this screen is using the draft, for as long as it is open. Returns
 * the release - the shape of an effect's cleanup.
 */
export function claimOnboardingDraft(): () => void {
  draftInUse += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    draftInUse -= 1;
  };
}

/**
 * A session has ended: the draft goes with it, unless a child is onboarding
 * on this page right now.
 *
 * IT OUTLIVED EVERY CHILD BUT ITS OWN (19 Oct browser-storage audit). It
 * holds the school code, the Student ID and the first name 05 matched, and
 * it was cleared only when that child's onboarding finished or the tab
 * closed - so a child who walked away part way left all three in the tab,
 * through every later child's sign-in and sign-out.
 *
 * NOT FROM A CHILD WHO IS STILL USING IT. A child onboarding has no account,
 * so no session of their own to end - but a session the last child left on
 * the device can end under them (it lapses as it is read), and their first
 * PIN replaces it with their own. Neither is a reason to take their school
 * code, Student ID, name or consent answer away mid-run: while 05 or the
 * sequence is open, the draft stays, and that run clears it itself when it
 * ends, as it always has.
 */
export function forgetOnboardingDraft(endedUserId?: string): void {
  // Ended FOR the child using it: theirs to keep (`endForNewChild`).
  if (endedUserId && endedForNewChild.delete(endedUserId)) return;
  if (draftInUse > 0) return;
  clearOnboardingDraft();
}

/**
 * The pair 05 matched this child on, or null when this run did not start
 * there - a typed URL straight into the sequence. Without it there is nobody
 * to attach a PIN to, and PIN creation says it could not save rather than
 * guessing.
 */
export function entryIdentityFromDraft(): EntryIdentity | null {
  const draft = getOnboardingDraft();
  const schoolCode = draft.schoolCode?.trim();
  const admissionNumber = draft.admissionNumber?.trim();
  return schoolCode && admissionNumber ? { schoolCode, admissionNumber } : null;
}

/** "Amara Kalu" -> "AK"; single names fall back to the first two letters. */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase();
}

/**
 * Fold the draft into the device's remembered profile - called when the
 * student finishes creating their PIN (the moment this device becomes theirs).
 *
 * THE IDENTIFIER MUST BE THE SERVER'S. This used to derive one from the child's
 * name - `"Amara Kalu"` became `"amara.kalu"` - and remember the device against
 * it. Nothing had told the server that name meant anything, so the returning
 * child was shown their own avatar and "Welcome back", typed the PIN they were
 * told to remember, and got a 401 they could do nothing about. A remembered
 * profile the server cannot authenticate is worse than no remembered profile:
 * it turns a child who never had an account into a child who thinks they are
 * locked out of one.
 *
 * The identifier comes back from whatever stores the first PIN - see
 * `bindFirstPin`.
 *
 * Returns whether the device was remembered. Without a name, a school code or
 * a server-issued identifier it remembers nothing, and the login screen keeps
 * routing to onboarding - which is the truth about that device.
 */
export function rememberOnboardedStudent(
  loginIdentifier: string | null | undefined,
  /**
   * Leave the draft for the run to clear at its own end (19 Oct). The
   * sequence's PIN comes before Module 4, Complete and You're In, and the
   * draft carries what a reload there needs - the account the PIN made -
   * so it is cleared on You're In, not here. A cleared child's new PIN ends
   * its flow, and clears it here.
   */
  options: { keepDraft?: boolean } = {},
): boolean {
  const done = () => {
    if (!options.keepDraft) clearOnboardingDraft();
  };
  const draft = getOnboardingDraft();
  const name = draft.name?.trim();
  const identifier = loginIdentifier?.trim();
  const schoolCode = draft.schoolCode?.trim();
  /*
   * THE SCHOOL CODE IS PART OF THE CREDENTIAL, not decoration.
   * `POST /auth/login/pin` takes `schoolCode + admissionNumber + pin` (the
   * identifier remembered here goes as `admissionNumber`), and
   * this used to store `draft.schoolCode ?? ""` - so a child whose class-code
   * join came back with a null `schoolCode` was remembered against an empty
   * one, greeted by name the next morning, and then 401'd on a PIN they had
   * typed correctly. That is exactly the failure the paragraph above exists
   * to prevent, and it was left open for one of the three fields.
   */
  if (!name || !identifier || !schoolCode) {
    done();
    return false;
  }
  const userId = getSession()?.userId;
  rememberProfile({
    schoolCode,
    loginIdentifier: identifier,
    displayName: name.split(/\s+/)[0],
    initials: initialsOf(name),
    // Account creation has just stored the session this child now owns.
    ...(userId ? { userId } : {}),
  });
  done();
  return true;
}
