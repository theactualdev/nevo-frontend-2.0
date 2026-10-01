import { describe, expect, it, vi } from "vitest";
import {
  clearSession,
  getRememberedProfile,
  getSession,
  getStoredDisplayName,
  getToken,
  rememberProfile,
  setSession,
  setStoredDisplayName,
} from "./session";

/**
 * The session store decides who the app thinks you are, so its edges are
 * security-adjacent rather than merely functional. Two behaviours here fixed
 * real defects and are the reason this file is tested first:
 *
 *   - an EXPIRED session must read as no session. It is held in localStorage,
 *     which the server never sees and which survives indefinitely, so the
 *     expiry check is the only thing standing between a stale token and a
 *     console rendering someone's roster.
 *   - the remembered profile must survive `clearSession`. Signing out is not
 *     forgetting the device: the child's next sign-in shows their name and
 *     avatar, and clearing it would strand them at a login screen that no
 *     longer knows who they are.
 */

const future = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();
const past = () => new Date(Date.now() - 60 * 1000).toISOString();

const session = (expiresAt: string) => ({
  token: "tok-abc",
  expiresAt,
  userId: "user-1",
  role: "teacher",
});

describe("session store", () => {
  it("returns a stored session that has not expired", () => {
    setSession(session(future()));
    expect(getSession()?.token).toBe("tok-abc");
    expect(getToken()).toBe("tok-abc");
  });

  it("treats an expired session as no session at all", () => {
    setSession(session(past()));
    expect(getSession()).toBeNull();
    expect(getToken()).toBeUndefined();
  });

  it("clears an expired session from storage rather than leaving it to be re-read", () => {
    setSession(session(past()));
    getSession();
    // Reading it again must not resurrect it, and nothing should remain for a
    // later reader to find.
    expect(getSession()).toBeNull();
    const raw = Object.keys(window.localStorage).some((k) =>
      (window.localStorage.getItem(k) ?? "").includes("tok-abc"),
    );
    expect(raw).toBe(false);
  });

  it("forgets the session on sign-out", () => {
    setSession(session(future()));
    clearSession();
    expect(getSession()).toBeNull();
    expect(getToken()).toBeUndefined();
  });

  it("keeps the remembered device profile across sign-out", () => {
    rememberProfile({
      schoolCode: "NEVO-BGA4827",
      loginIdentifier: "amara.k7",
      displayName: "Amara",
      initials: "AK",
    });
    setSession(session(future()));
    clearSession();

    // Signing out is not forgetting the device.
    expect(getRememberedProfile()).toEqual({
      schoolCode: "NEVO-BGA4827",
      loginIdentifier: "amara.k7",
      displayName: "Amara",
      initials: "AK",
    });
  });

  it("reports no remembered profile on a device that has none", () => {
    expect(getRememberedProfile()).toBeNull();
  });

  it("survives unreadable storage rather than throwing into a render", () => {
    // A corrupted value is not hypothetical: this is localStorage, and a half
    // written entry or a value from an older shape both land here. Returning
    // null lets the app route to sign-in; throwing would take a screen down.
    window.localStorage.setItem("nevo.auth.session", "{not json");
    expect(() => getSession()).not.toThrow();
    expect(getSession()).toBeNull();
  });
});

describe("how a session signed in", () => {
  /*
   * Onboarding branches on it - an SSO child skips three steps and the PIN -
   * and it lived only in React state, so a reload put an SSO child on the
   * manual path. It is kept with the session now.
   */
  it("is kept with the session, so a reload still knows it", () => {
    setSession({ ...session(future()), method: "sso" });

    expect(
      JSON.parse(window.localStorage.getItem("nevo.auth.session") ?? "{}"),
    ).toMatchObject({ method: "sso" });
  });

  it("survives a token refresh, which does not say how anyone signed in", () => {
    setSession({ ...session(future()), method: "sso" });
    // `authApi.refresh` stores the login shape, which has no method.
    setSession({ ...session(future()), token: "tok-refreshed" });

    expect(getSession()).toMatchObject({ token: "tok-refreshed", method: "sso" });
  });

  it("is never handed to a different account", () => {
    setSession({ ...session(future()), method: "sso" });
    setSession({ ...session(future()), userId: "user-2" });

    expect(getSession()?.method).toBeUndefined();
  });
});

describe("the name a child is called on a shared tablet", () => {
  /*
   * The name used to come from the ONE legacy remembered profile - whichever
   * child the device remembered last. A child unlocking through the picker was
   * called by another child's name everywhere, and renaming themselves
   * overwrote that other child.
   */
  const as = (userId: string) =>
    setSession({ ...session(future()), userId, role: "student" });

  const remember = (loginIdentifier: string, displayName: string, userId?: string) =>
    rememberProfile({
      schoolCode: "NEVO-1",
      loginIdentifier,
      displayName,
      initials: displayName.slice(0, 2).toUpperCase(),
      ...(userId ? { userId } : {}),
    });

  it("is never the last child the device remembered", () => {
    window.localStorage.clear();
    remember("ada.o", "Ada", "ada");
    remember("bayo.k", "Bayo", "bayo");
    as("ada");

    expect(getStoredDisplayName()).toBe("Ada");
  });

  it("says nothing rather than guessing, for an entry that predates account ids", () => {
    window.localStorage.clear();
    remember("bayo.k", "Bayo");
    as("ada");

    expect(getStoredDisplayName()).toBeNull();
  });

  it("renames only the child who is signed in", () => {
    window.localStorage.clear();
    remember("ada.o", "Ada", "ada");
    remember("bayo.k", "Bayo", "bayo");
    as("ada");

    setStoredDisplayName("Adaeze", "AD");

    expect(getStoredDisplayName()).toBe("Adaeze");
    as("bayo");
    expect(getStoredDisplayName()).toBe("Bayo");
    // And the legacy single profile - Bayo's, the last remembered - untouched.
    expect(getRememberedProfile()?.displayName).toBe("Bayo");
  });

  it("is nobody's when nobody is signed in", () => {
    window.localStorage.clear();
    clearSession();
    remember("ada.o", "Ada", "ada");

    expect(getStoredDisplayName()).toBeNull();
  });
});

/**
 * A role cookie with no session behind it.
 *
 * `setSession` writes the cookie and then the token, and swallows a token
 * write that fails. After a reload the route guard let the child through on
 * the cookie, every screen found no token and drew the signed-out walkthrough,
 * and the PIN door bounced them back to it - signed in for the server, signed
 * out for the app, locked out of the screen that would fix it.
 *
 * `hydrate` runs once per page load, so each case loads the module fresh.
 */
describe("a page load that finds the role cookie but no session", () => {
  const ROLE = "nevo.role";
  const cookieSays = () =>
    document.cookie
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${ROLE}=`) && c.length > ROLE.length + 1);

  const freshLoad = async () => {
    vi.resetModules();
    return import("./session");
  };

  it("drops the cookie, so the door lets the child back in", async () => {
    window.localStorage.clear();
    document.cookie = `${ROLE}=student; Path=/`;

    const fresh = await freshLoad();

    expect(fresh.getSession()).toBeNull();
    expect(cookieSays()).toBeUndefined();
    expect(fresh.arrivedWithoutSession()).toBe(true);
  });

  it("leaves the cookie alone when the session is there", async () => {
    window.localStorage.clear();
    window.localStorage.setItem(
      "nevo.auth.session",
      JSON.stringify(session(future())),
    );
    document.cookie = `${ROLE}=teacher; Path=/`;

    const fresh = await freshLoad();

    expect(fresh.getSession()?.token).toBe("tok-abc");
    expect(cookieSays()).toBe(`${ROLE}=teacher`);
    expect(fresh.arrivedWithoutSession()).toBe(false);
    fresh.clearSession();
  });

  it("says nothing happened on a device with neither", async () => {
    window.localStorage.clear();
    document.cookie = `${ROLE}=; Path=/; Max-Age=0`;

    const fresh = await freshLoad();

    expect(fresh.arrivedWithoutSession()).toBe(false);
  });
});
