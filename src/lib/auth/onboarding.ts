/**
 * Onboarding draft state - the identity the student gives us across the
 * route-per-step flow (name/age, school code), kept in sessionStorage so it
 * survives the step navigations and dies with the tab. At PIN creation the
 * draft folds into the device's RememberedProfile (`session.ts`), which is
 * what the returning-student login screen unlocks against.
 */

import { usersApi } from "@/lib/api/users";
import { STUDENT_PIN_LENGTH } from "@/lib/constants/auth";
import { getSession, rememberProfile } from "./session";

const DRAFT_KEY = "nevo.onboarding.draft";

export interface OnboardingDraft {
  name?: string;
  age?: number;
  schoolCode?: string;
  /** From the live school-code verification, when it ran. */
  schoolName?: string;
  authMethod?: string;
  classes?: { id: string; name: string }[];
  /** The class the student picked (or the only one there was). */
  classId?: string;
  className?: string;
  /**
   * The class code a child joined with, when they came in through Teacher Join.
   *
   * Kept as well as `classId`, because `ConnectionResponse.schoolCode` is
   * NULLABLE - so the `{ classId, schoolCode }` form the sequence uses at PIN
   * time is not always available, while `{ classCode }` on its own always is.
   * It is also what marks this child as one who needs neither the school step
   * nor the class step.
   */
  classCode?: string;
  /**
   * The join-link token, when the child arrived by one. Redeeming it at PIN
   * creation is what creates the account - and what returns the only login
   * identifier the server will actually recognise.
   */
  joinToken?: string;
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
 * name, age, school and invitation in the tab, so the next child on the same
 * tablet was greeted as them, routed by their class code, and could redeem
 * their invitation at PIN creation. Called where a new child starts (the
 * welcome screen, and a class code arriving directly), so no earlier child's
 * answers are carried in.
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
 * The school code the server holds for the account that was just created, for
 * a child who never typed one.
 *
 * A JOIN-LINK OR CLASS-CODE CHILD WAS NEVER REMEMBERED. The join endpoints
 * return a `schoolName` and no code, and `ConnectionResponse.schoolCode` is
 * nullable - so `rememberOnboardedStudent` had no school code for them,
 * refused, and the tablet's picker never showed them. Once the account exists
 * `GET /users/me` carries `school.code`, and that is the code the next sign-in
 * is checked against.
 *
 * Null when there is no session to ask with, or the read fails, or the school
 * has no code: then the device is not remembered, which is the truth about it.
 * Only asked when the draft has no code of its own.
 */
export async function schoolCodeFromAccount(): Promise<string | null> {
  if (getOnboardingDraft().schoolCode?.trim()) return null;
  if (!getSession()) return null;
  try {
    const me = await usersApi.me();
    return me.school?.code?.trim() || null;
  } catch {
    return null;
  }
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
 * `POST /api/v1/join/{token}/accept` now returns `loginIdentifier`, and it is
 * public, so a join-link child gets a real one before this is called.
 *
 * Returns whether the device was remembered. Without a name or without a
 * server-issued identifier it remembers nothing, and the login screen keeps
 * routing to onboarding - which is the truth about that device.
 *
 * `accountSchoolCode` is the school code the server holds for the new account,
 * for a child whose draft has none - see `schoolCodeFromAccount`. The draft's
 * own code, which the child typed and the server verified, comes first.
 */
export function rememberOnboardedStudent(
  loginIdentifier: string | null | undefined,
  accountSchoolCode?: string | null,
): boolean {
  const draft = getOnboardingDraft();
  const name = draft.name?.trim();
  const identifier = loginIdentifier?.trim();
  const schoolCode = draft.schoolCode?.trim() || accountSchoolCode?.trim();
  /*
   * THE SCHOOL CODE IS PART OF THE CREDENTIAL, not decoration.
   * `POST /auth/login/pin` takes `schoolCode + loginIdentifier + pin`, and
   * this used to store `draft.schoolCode ?? ""` - so a child whose class-code
   * join came back with a null `schoolCode` (the field is nullable on
   * `ConnectionResponse`) was remembered against an empty one, greeted by name
   * the next morning, and then 401'd on a PIN they had typed correctly. That is
   * exactly the failure the paragraph above exists to prevent, and it was left
   * open for one of the three fields.
   */
  if (!name || !identifier || !schoolCode) {
    clearOnboardingDraft();
    return false;
  }
  const userId = getSession()?.userId;
  rememberProfile({
    schoolCode,
    loginIdentifier: identifier,
    displayName: name.split(/\s+/)[0],
    initials: initialsOf(name),
    // They have just created it, at the one length a new PIN can be.
    pinLength: STUDENT_PIN_LENGTH,
    // Account creation has just stored the session this child now owns.
    ...(userId ? { userId } : {}),
  });
  clearOnboardingDraft();
  return true;
}
