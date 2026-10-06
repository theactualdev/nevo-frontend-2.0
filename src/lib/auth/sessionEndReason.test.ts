import { describe, expect, it } from "vitest";
import { sessionEndCopy, sessionEndReason } from "./sessionEndReason";

/**
 * Five wire codes, four screens (design, 16 Sep).
 *
 * Until this shipped, all five landed on one door reading "sessions expire
 * after a period of inactivity for your security" - true of one of them.
 */

describe("mapping the wire code", () => {
  it("sends an expired session to the ordinary screen", () => {
    expect(sessionEndReason("session_expired")).toBe("expired");
  });

  it("sends an invalid token to the SAME screen as an expired one", () => {
    // Design: "invalid" means a malformed or unknown token, which is either our
    // bug or someone tampering, and neither is something to put in front of a
    // teacher. It reads as alarming and tells them nothing they can act on.
    expect(sessionEndReason("invalid_session")).toBe(
      sessionEndReason("session_expired"),
    );
  });

  it("keeps revoked, replaced and paused apart", () => {
    expect(sessionEndReason("session_revoked")).toBe("revoked");
    expect(sessionEndReason("session_replaced")).toBe("replaced");
    expect(sessionEndReason("account_paused")).toBe("paused");
  });

  it("keeps a closed account apart from a paused one (B58)", () => {
    // Its own 401 code since 5 Oct. Folding it into `paused` is the exact
    // thing design ruled against (D53): a removed child told "on pause".
    expect(sessionEndReason("account_closed")).toBe("closed");
  });

  it("falls back to the ordinary screen for a code added after this shipped", () => {
    // The set has already grown once, from four to five. Guessing `paused` or
    // `replaced` would tell someone something specific and false about their
    // own account; "your session ended" is true of every 401 that gets here.
    expect(sessionEndReason("some_future_code")).toBe("expired");
    expect(sessionEndReason(null)).toBe("expired");
    expect(sessionEndReason(undefined)).toBe("expired");
    expect(sessionEndReason("")).toBe("expired");
  });
});

describe("what each screen says", () => {
  it("only the ordinary screen blames inactivity", () => {
    // A session an administrator ended did not time out. Saying it did sends
    // someone looking for a setting to change.
    expect(sessionEndCopy("expired").note).toMatch(/inactivity/i);
    for (const r of ["revoked", "replaced", "paused"] as const) {
      expect(sessionEndCopy(r).note ?? "").not.toMatch(/inactivity/i);
    }
  });

  it("drops only the inactivity line for a revoked session", () => {
    // Per the frame: the ordinary screen with that one line deleted.
    const revoked = sessionEndCopy("revoked");
    expect(revoked.heading).toBe(sessionEndCopy("expired").heading);
    expect(revoked.note).toBeNull();
    expect(revoked.offersSignIn).toBe(true);
  });

  it("says plainly that they signed in somewhere else", () => {
    const replaced = sessionEndCopy("replaced");
    expect(replaced.heading).toMatch(/another device/i);
  });

  it("tells someone what to do if it was not them", () => {
    // The whole reason this state is drawn separately. Design: "if it was not
    // them they need to know."
    expect(sessionEndCopy("replaced", "staff").note).toMatch(
      /wasn’t you.*school administrator/i,
    );
    expect(sessionEndCopy("replaced", "learner").note).toMatch(
      /wasn’t you.*teacher/i,
    );
  });
});

describe("a paused account", () => {
  it("is not dressed as a session ending", () => {
    const paused = sessionEndCopy("paused");
    expect(paused.heading).not.toMatch(/session/i);
    expect(paused.heading).toMatch(/on pause/i);
  });

  it("offers no sign-in button, because retrying does nothing", () => {
    expect(sessionEndCopy("paused").offersSignIn).toBe(false);
    // Every other state IS resolved by signing in again.
    for (const r of ["expired", "revoked", "replaced"] as const) {
      expect(sessionEndCopy(r).offersSignIn).toBe(true);
    }
  });

  it("points staff one level up and learners at their teacher", () => {
    // The learner frame says "talk to your teacher". A teacher cannot be told
    // that, which is why this screen was blocked before the ruling.
    expect(sessionEndCopy("paused", "staff").body).toMatch(
      /school administrator/i,
    );
    expect(sessionEndCopy("paused", "learner").body).toMatch(/your teacher/i);
    expect(sessionEndCopy("paused", "staff").body).not.toMatch(/your teacher/i);
  });
});

describe("the house copy rule", () => {
  it("writes no dashes anywhere in any state", () => {
    for (const r of ["expired", "revoked", "replaced", "paused"] as const) {
      for (const a of ["staff", "learner"] as const) {
        const c = sessionEndCopy(r, a);
        const all = `${c.heading} ${c.body} ${c.note ?? ""}`;
        expect(all).not.toMatch(/[—–]|\s-\s/);
      }
    }
  });
});

describe("a closed account on the staff screen", () => {
  it("shows what it showed before the code had a name, because no staff frame draws it", () => {
    // The learner ruling (D53) is the child's door. Changing what a teacher or
    // an administrator reads is not something to do under it - raised instead.
    expect(sessionEndCopy("closed", "staff")).toEqual(sessionEndCopy("expired", "staff"));
  });
});
