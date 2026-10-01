import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearOnboardingDraft,
  mergeOnboardingDraft,
  rememberOnboardedStudent,
  schoolCodeFromAccount,
} from "./onboarding";
import { clearSession, getRememberedProfile, setSession } from "./session";

const me = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/users", () => ({ usersApi: { me } }));

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
  me.mockReset();
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
    // THE INVITE-LINK CHILD. `join/{token}` returns a `schoolName` and never a
    // code, so this is every child who arrived by QR or link. Remembering them
    // against "" would greet them by name tomorrow and then 401 them.
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
 * A join-link or class-code child never typed a school code, so the tablet
 * never remembered them. The account's own code is on `users/me` once the
 * account exists.
 */
describe("a child who never typed a school code", () => {
  const signedIn = () =>
    setSession({
      token: "tok",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      userId: "student-9",
      role: "student",
    });

  it("is remembered with the account's school code", () => {
    mergeOnboardingDraft({ name: "Amara Kalu" });

    expect(rememberOnboardedStudent(SERVER_IDENTIFIER, "751A1136")).toBe(true);
    expect(getRememberedProfile()).toMatchObject({ schoolCode: "751A1136" });
  });

  it("keeps the code a child typed over anything else", () => {
    mergeOnboardingDraft({ name: "Amara Kalu", schoolCode: "TYPED-1" });

    expect(rememberOnboardedStudent(SERVER_IDENTIFIER, "OTHER-2")).toBe(true);
    expect(getRememberedProfile()).toMatchObject({ schoolCode: "TYPED-1" });
  });

  it("asks the account for its code once there is a session", async () => {
    mergeOnboardingDraft({ name: "Amara Kalu" });
    signedIn();
    me.mockResolvedValue({ school: { code: " 751A1136 " } });

    expect(await schoolCodeFromAccount()).toBe("751A1136");
  });

  it("asks nothing when there is no session to ask with", async () => {
    mergeOnboardingDraft({ name: "Amara Kalu" });

    expect(await schoolCodeFromAccount()).toBeNull();
    expect(me).not.toHaveBeenCalled();
  });

  it("asks nothing when the child already typed one", async () => {
    mergeOnboardingDraft({ name: "Amara Kalu", schoolCode: "TYPED-1" });
    signedIn();

    expect(await schoolCodeFromAccount()).toBeNull();
    expect(me).not.toHaveBeenCalled();
  });

  it("has no code when the read fails, so the device is not remembered", async () => {
    mergeOnboardingDraft({ name: "Amara Kalu" });
    signedIn();
    me.mockRejectedValue(new Error("offline"));

    expect(await schoolCodeFromAccount()).toBeNull();
  });

  it("has no code when the school has none", async () => {
    mergeOnboardingDraft({ name: "Amara Kalu" });
    signedIn();
    me.mockResolvedValue({ school: { code: null } });

    expect(await schoolCodeFromAccount()).toBeNull();
  });
});
