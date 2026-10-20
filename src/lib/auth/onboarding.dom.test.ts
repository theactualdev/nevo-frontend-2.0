import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  claimOnboardingDraft,
  clearOnboardingDraft,
  arriveAtEntry,
  arriveAtSequence,
  endSessionForEntryMatch,
  markRunFinished,
  entryIdentityFromDraft,
  forgetOnboardingDraft,
  getOnboardingDraft,
  mergeOnboardingDraft,
  rememberOnboardedStudent,
  startOnboardingDraft,
} from "./onboarding";
import {
  clearSession,
  getRememberedProfile,
  getSession,
  setSession,
} from "./session";
import { onSessionEnd } from "./sessionEnd";

/**
 * A remembered profile the server cannot authenticate is worse than none.
 *
 * `POST /auth/login/pin` takes THREE things — `schoolCode`, the identifier
 * (sent as `admissionNumber`) and the PIN. If the device remembers a child against a credential missing any
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

/*
 * THE DRAFT OUTLIVED EVERY CHILD BUT ITS OWN (19 Oct browser-storage audit):
 * a school code, a Student ID and a first name, kept in the tab through
 * every later child's sign-in and sign-out. A session ending takes it now -
 * but never from a child still using it on this page.
 */
describe("forgetOnboardingDraft - when a session ends", () => {
  const draft = {
    schoolCode: "K7DQ",
    admissionNumber: "BGA/2031",
    name: "Amara",
    consent: "given" as const,
  };

  it("takes a draft no open screen is using", () => {
    startOnboardingDraft(draft);

    forgetOnboardingDraft();

    expect(getOnboardingDraft()).toEqual({});
  });

  it("leaves a draft a child is still using, consent answer and all, until their screen closes", () => {
    startOnboardingDraft(draft);
    const release = claimOnboardingDraft();

    forgetOnboardingDraft();
    expect(getOnboardingDraft()).toEqual(draft);

    release();
    forgetOnboardingDraft();
    expect(getOnboardingDraft()).toEqual({});
  });

  it("counts a screen that lets go twice only once", () => {
    startOnboardingDraft(draft);
    const first = claimOnboardingDraft();
    const second = claimOnboardingDraft();

    first();
    first();
    forgetOnboardingDraft();

    expect(getOnboardingDraft()).toEqual(draft);
    second();
  });
});

/*
 * THE ROSTER ONLY (19 Oct browser-storage audit). Remembering a child wrote
 * the old single-profile key beside the roster - a second copy of one
 * child's school code and login identifier - for nothing the roster does not
 * hold. A first PIN and a cleared child's new one both come through here.
 */
describe("remembering a child on the device", () => {
  it("writes no old single-profile copy of them", () => {
    mergeOnboardingDraft({ name: "Amara Kalu", schoolCode: "751A1136" });

    expect(rememberOnboardedStudent(SERVER_IDENTIFIER)).toBe(true);

    expect(window.localStorage.getItem("nevo.auth.profile")).toBeNull();
    expect(getRememberedProfile()?.loginIdentifier).toBe(SERVER_IDENTIFIER);
  });
});

/*
 * A CHILD WITH NO ACCOUNT IS STARTING (19 Oct browser-storage audit): a
 * session the device still holds is somebody else's, and it ends through the
 * path every sign-out takes, so its child's leftovers go as they would at
 * Sign out.
 */
describe("a session stored as 05 or the sequence opens", () => {
  const settle = () => new Promise<void>((r) => setTimeout(r, 0));
  const store = (over: Partial<Parameters<typeof setSession>[0]> = {}) =>
    setSession({
      token: "tok-last",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      userId: "last-child",
      role: "student",
      ...over,
    });
  const RUN = {
    schoolCode: "K7DQ",
    admissionNumber: "BGA/2031",
    name: "Tobi",
    consent: "given" as const,
  };
  /** What ended, from here on. */
  const listen = async () => {
    await settle();
    const ended: string[] = [];
    const off = onSessionEnd((e) => ended.push(e.userId));
    return { ended, off };
  };

  /*
   * ONLY A SESSION BELONGING TO A DIFFERENT CHILD THAN THE RUN IN PROGRESS IS
   * ENDED (19 Oct). Ending any session found here signed a child out who was
   * back on the sequence from their own first lesson.
   */
  it("is ended on 05 when a different child's run is in progress, and that run's draft goes", async () => {
    store();
    startOnboardingDraft(RUN);
    const { ended, off } = await listen();

    expect(arriveAtEntry()).toBe("stay");
    await settle();
    off();

    expect(getSession()).toBeNull();
    expect(ended).toEqual(["last-child"]);
    // 05 writes its own draft on the next match; the old run's is not it.
    expect(getOnboardingDraft()).toEqual({});
  });

  /*
   * NEVER ROUTED INTO ON A GUESS (19 Oct). With no run in progress, a stored
   * session was routed on from 05 - which put a new child opening 05
   * directly inside the last child's account. Only the child this tab
   * finished its run as is routed on; any other session waits for 05's
   * lookup, kept and unsent-as.
   */
  it("is neither ended nor routed into on 05 when nothing says whose it is", async () => {
    store();
    const { ended, off } = await listen();

    expect(arriveAtEntry()).toBe("stay");
    await settle();
    off();

    expect(getSession()?.userId).toBe("last-child");
    expect(ended).toEqual([]);
  });

  it("is routed on from 05 when this tab finished its run as that child", () => {
    store({ userId: "tobi" });
    markRunFinished("tobi");

    expect(arriveAtEntry()).toBe("routeOn");
    expect(getSession()?.userId).toBe("tobi");
  });

  it("is not routed on for another child's mark", () => {
    store();
    markRunFinished("tobi");

    expect(arriveAtEntry()).toBe("stay");
    expect(arriveAtSequence()).toBe("toEntry");
  });

  it("ends at 05's match, once the lookup has a child to go on with", async () => {
    store();
    arriveAtEntry();
    const { ended, off } = await listen();

    endSessionForEntryMatch();
    await settle();
    off();

    expect(getSession()).toBeNull();
    expect(ended).toEqual(["last-child"]);
  });

  it("is nothing to act on when nothing is stored", async () => {
    clearSession();
    const { ended, off } = await listen();

    expect(arriveAtEntry()).toBe("stay");
    expect(arriveAtSequence()).toBe("stay");
    await settle();
    off();

    expect(ended).toEqual([]);
  });

  it("is ended in the sequence for a different child's run, which keeps its draft", () => {
    store();
    startOnboardingDraft(RUN);

    expect(arriveAtSequence()).toBe("stay");

    expect(getSession()).toBeNull();
    expect(getOnboardingDraft()).toEqual(RUN);
  });

  it("is kept in the sequence when it is the run's own, and the run resumes", () => {
    store({ userId: "tobi" });
    startOnboardingDraft({ ...RUN, userId: "tobi" });

    expect(arriveAtSequence()).toBe("routeOn");
    expect(getSession()?.userId).toBe("tobi");
  });

  it("is kept in the sequence with no run in progress - Back from the first lesson", () => {
    store({ userId: "tobi" });
    clearOnboardingDraft();
    markRunFinished("tobi");

    expect(arriveAtSequence()).toBe("routeOn");
    expect(getSession()?.userId).toBe("tobi");
  });

  it("sends a session nothing marks, with no run in progress, to 05 to be asked", () => {
    store();
    clearOnboardingDraft();

    expect(arriveAtSequence()).toBe("toEntry");
    expect(getSession()?.userId).toBe("last-child");
  });

  it("is kept in the sequence for an SSO child, who starts it signed in", () => {
    store({ userId: "sso-child", method: "sso" });

    expect(arriveAtSequence()).toBe("stay");
    expect(getSession()?.userId).toBe("sso-child");
  });
});
