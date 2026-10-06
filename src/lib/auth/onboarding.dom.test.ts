import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearOnboardingDraft,
  entryIdentityFromDraft,
  mergeOnboardingDraft,
  rememberOnboardedStudent,
  startOnboardingDraft,
} from "./onboarding";
import { clearSession, getRememberedProfile } from "./session";

/**
 * A remembered profile the server cannot authenticate is worse than none.
 *
 * `POST /auth/login/pin` takes THREE things — `schoolCode`, `loginIdentifier`
 * and the PIN. If the device remembers a child against a credential missing any
 * of them, the next morning it shows that child their own avatar and "Welcome
 * back", they type the PIN they were told to remember, and they get a 401 they
 * can do nothing about. A child who simply has no account at least knows where
 * they stand; this turns them into a child who believes they are locked out of
 * one.
 *
 * `rememberOnboardedStudent` guards all three. Its docblock describes both real
 * incidents that produced those guards — a name-derived identifier the server
 * had never heard of, and a null `schoolCode` from a class-code join stored as
 * `""`. **Neither guard had a test.** Removing the school-code check passed the
 * whole suite, which is how that one came back the first time.
 *
 * `.dom.test.ts` because the profile lives in localStorage.
 */

const SERVER_IDENTIFIER = "amara.k";

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  window.sessionStorage.clear();
  clearOnboardingDraft();
});

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  clearOnboardingDraft();
});

describe("rememberOnboardedStudent", () => {
  it("remembers a child who has all three parts of the credential", () => {
    mergeOnboardingDraft({ name: "Amara Kalu", schoolCode: "751A1136" });

    expect(rememberOnboardedStudent(SERVER_IDENTIFIER)).toBe(true);
    expect(getRememberedProfile()).toMatchObject({
      schoolCode: "751A1136",
      loginIdentifier: SERVER_IDENTIFIER,
      displayName: "Amara",
      initials: "AK",
    });
  });

  it("refuses to remember a child with no school code", () => {
    // A run that never started on 05 - a typed URL straight into the
    // sequence. Remembering them against "" would greet them by name tomorrow
    // and then 401 them.
    mergeOnboardingDraft({ name: "Amara Kalu" });

    expect(rememberOnboardedStudent(SERVER_IDENTIFIER)).toBe(false);
    expect(getRememberedProfile()).toBeNull();
  });

  it("refuses to remember a child with a blank school code", () => {
    // `ConnectionResponse.schoolCode` is nullable, and a class-code join that
    // came back null was once stored as an empty string. Whitespace is the same
    // failure wearing a different shape.
    mergeOnboardingDraft({ name: "Amara Kalu", schoolCode: "   " });

    expect(rememberOnboardedStudent(SERVER_IDENTIFIER)).toBe(false);
    expect(getRememberedProfile()).toBeNull();
  });

  it("refuses to remember a child with no server-issued identifier", () => {
    // The original incident: an identifier derived from the child's name,
    // "Amara Kalu" -> "amara.kalu", which the server had never heard of.
    mergeOnboardingDraft({ name: "Amara Kalu", schoolCode: "751A1136" });

    expect(rememberOnboardedStudent(null)).toBe(false);
    expect(rememberOnboardedStudent(undefined)).toBe(false);
    expect(rememberOnboardedStudent("  ")).toBe(false);
    expect(getRememberedProfile()).toBeNull();
  });

  it("refuses to remember a child with no name", () => {
    mergeOnboardingDraft({ schoolCode: "751A1136" });

    expect(rememberOnboardedStudent(SERVER_IDENTIFIER)).toBe(false);
    expect(getRememberedProfile()).toBeNull();
  });

  it("clears the draft even when it refuses, so a child's name is not left lying around", () => {
    // The draft carries a child's name and age, in SESSION storage — not local,
    // which is where an earlier version of this test looked, making it pass
    // against a mutant that never cleared anything at all.
    mergeOnboardingDraft({ name: "Amara Kalu" });
    // Assert the precondition, so this can never go vacuous again: if the key
    // or the storage moves, THIS line fails rather than the one below silently
    // passing.
    expect(
      window.sessionStorage.getItem("nevo.onboarding.draft"),
    ).not.toBeNull();

    // No school code, so it refuses.
    expect(rememberOnboardedStudent(SERVER_IDENTIFIER)).toBe(false);

    expect(window.sessionStorage.getItem("nevo.onboarding.draft")).toBeNull();
  });

  it("clears the draft when it succeeds too", () => {
    mergeOnboardingDraft({ name: "Amara Kalu", schoolCode: "751A1136" });
    expect(
      window.sessionStorage.getItem("nevo.onboarding.draft"),
    ).not.toBeNull();

    expect(rememberOnboardedStudent(SERVER_IDENTIFIER)).toBe(true);

    expect(window.sessionStorage.getItem("nevo.onboarding.draft")).toBeNull();
  });
});

/**
 * Who 05 matched, read back at the PIN step. Both halves or nothing: half a
 * pair identifies nobody, and a PIN attached to nobody is the bug.
 */
describe("entryIdentityFromDraft", () => {
  it("is the pair 05 matched", () => {
    startOnboardingDraft({ schoolCode: "K7DQ", admissionNumber: "BGA/2031" });

    expect(entryIdentityFromDraft()).toEqual({
      schoolCode: "K7DQ",
      admissionNumber: "BGA/2031",
    });
  });

  it("is nothing when the run did not start on 05", () => {
    expect(entryIdentityFromDraft()).toBeNull();
  });

  it("is nothing with only half the pair", () => {
    startOnboardingDraft({ schoolCode: "K7DQ" });
    expect(entryIdentityFromDraft()).toBeNull();

    startOnboardingDraft({ schoolCode: "K7DQ", admissionNumber: "   " });
    expect(entryIdentityFromDraft()).toBeNull();
  });
});
