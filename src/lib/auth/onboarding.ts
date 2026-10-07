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

import { STUDENT_PIN_LENGTH } from "@/lib/constants/auth";
import type { EntryIdentity } from "./firstPin";
import { getSession, rememberProfile } from "./session";

const DRAFT_KEY = "nevo.onboarding.draft";

export interface OnboardingDraft {
  /**
   * The child's first name, from the roster row the lookup matched. Greets
   * them on a remembered device; never typed by the child.
   */
  name?: string;
  /**
   * From the roster's date of birth, computed server-side. Absent when the
   * roster has none, and then the baseline asks rather than guesses.
   */
  age?: number;
  /** The four-character code the child typed on 05, which the lookup matched. */
  schoolCode?: string;
  /**
   * The Student ID / Admission Number the child typed on 05. The other half
   * of the pair their first PIN is stored against - see `bindFirstPin`.
   */
  admissionNumber?: string;
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
): boolean {
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
