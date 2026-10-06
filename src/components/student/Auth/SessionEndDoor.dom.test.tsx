import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SessionExpiredPage, {
  generateMetadata,
} from "@/app/auth/session-expired/page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

/**
 * The child's half of the five 401 codes.
 *
 * #422 made the reason survive the redirect as `?reason=`; this door ignored
 * it and rendered "You've been away for a while" for all five. That is a
 * statement about the child's behaviour and it is untrue for four of them -
 * worst for `account_paused`, where a child whose school closed their account
 * mid-lesson was told they had been idle and went back to try again.
 */

const doorFor = async (reason?: string, next?: string) =>
  render(
    await SessionExpiredPage({
      searchParams: Promise.resolve({
        ...(reason ? { reason } : {}),
        ...(next ? { next } : {}),
      }),
    }),
  );

describe("the child's session-end door", () => {
  it("says the account is on pause, and offers no way to retry", async () => {
    await doorFor("account_paused");

    expect(screen.getByText(/on pause/i)).toBeInTheDocument();
    // The whole point: retrying is the one action that cannot work, so the
    // screen must not invite it.
    expect(screen.queryByRole("button", { name: /log back in/i })).toBeNull();
  });

  it("does not tell a child their session timed out when it was ended for them", async () => {
    await doorFor("session_revoked");

    expect(screen.getByText("Your session has ended.")).toBeInTheDocument();
    expect(screen.queryByText(/away for a while/i)).toBeNull();
  });

  it("tells a child they signed in somewhere else", async () => {
    await doorFor("session_replaced");

    expect(screen.getByText(/another device/i)).toBeInTheDocument();
    expect(screen.getByText(/progress is saved/i)).toBeInTheDocument();
  });

  it("keeps board 28's gentler wording for an ordinary timeout", async () => {
    await doorFor("session_expired");

    // Not the console's "sessions expire after a period of inactivity for your
    // security" - a child gets the screen design drew for them.
    expect(screen.getByText(/away for a while/i)).toBeInTheDocument();
  });

  it("under-claims on an unknown code, an absent one, and a hand-typed one", async () => {
    for (const reason of [undefined, "invalid_session", "something_new", ""]) {
      const { unmount } = await doorFor(reason);
      // "You've been away" is true of every 401 that reaches this point.
      // Guessing `paused` would tell a child something false about their own
      // account, so absence and nonsense both land here.
      expect(screen.getByText(/away for a while/i)).toBeInTheDocument();
      unmount();
    }
  });
});

describe("the way back in", () => {
  it("returns the child to the lesson they were in", async () => {
    // IA 31: "Log back in -> Student Login Screen (lesson position
    // preserved)". It pushed a bare /auth/login, so a lapse mid-lesson signed
    // the child back in to Home.
    await doorFor("session_expired", "/student/lessons/frac-3");

    expect(screen.getByRole("link", { name: "Log back in" })).toHaveAttribute(
      "href",
      "/auth/login?next=%2Fstudent%2Flessons%2Ffrac-3",
    );
  });

  it("does not carry a destination that leaves the site", async () => {
    await doorFor("session_expired", "//evil.test/x");

    expect(screen.getByRole("link", { name: "Log back in" })).toHaveAttribute(
      "href",
      "/auth/login",
    );
  });

  it("says Sign in on the revoked screen, as 28a draws it", async () => {
    await doorFor("session_revoked", "/student/progress");

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/auth/login?next=%2Fstudent%2Fprogress",
    );
    expect(screen.queryByText(/log back in/i)).toBeNull();
  });
});

describe("what each screen carries, per board 28 and 28a", () => {
  it("puts the logo and the drawn art on the timed-out screen", async () => {
    await doorFor("session_expired");

    expect(screen.getByAltText("Nevo")).toBeInTheDocument();
    expect(
      document.querySelector('img[src*="session-expired"]'),
    ).not.toBeNull();
  });

  it("puts the concurrent-session art on the signed-in-elsewhere screen", async () => {
    await doorFor("session_replaced");

    expect(
      document.querySelector('img[src*="concurrent-session"]'),
    ).not.toBeNull();
  });

  it("draws no picture on the revoked screen, only the wordmark", async () => {
    // 28a: "Calm and neutral, with one way forward." No icon, no art.
    await doorFor("session_revoked");

    expect(document.querySelectorAll("img")).toHaveLength(1);
    expect(screen.getByAltText("Nevo")).toBeInTheDocument();
    expect(document.querySelector("svg")).toBeNull();
  });
});

describe("the tab title", () => {
  it("does not call a paused account an expired session", async () => {
    const title = async (reason?: string) =>
      (
        await generateMetadata({
          searchParams: Promise.resolve(reason ? { reason } : {}),
        })
      ).title;

    expect(await title("account_paused")).toBe("Account on pause - Nevo");
    expect(await title("account_closed")).toBe("Account closed - Nevo");
    expect(await title("session_expired")).toBe("Session expired - Nevo");
    expect(await title()).toBe("Session expired - Nevo");
  });
});

describe("what a child is told to do next (1 Oct rulings)", () => {
  it("tells a child signed in somewhere else who to tell if it was not them (D51)", async () => {
    await doorFor("session_replaced");

    expect(screen.getByText(/that wasn.t you, tell your teacher/i)).toBeInTheDocument();
  });

  it("does not say it on the screens where nobody else signed in", async () => {
    for (const reason of ["session_expired", "session_revoked"]) {
      const { unmount } = await doorFor(reason);
      expect(screen.queryByText(/wasn.t you/i)).toBeNull();
      unmount();
    }
  });

  it("gives a paused screen a way back to the picker, and still no retry (D52)", async () => {
    // A shared tablet left on a screen with no controls locks every other
    // child out of it.
    await doorFor("account_paused");

    expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute(
      "href",
      "/auth/login",
    );
    expect(screen.queryByText(/log back in|try again/i)).toBeNull();
  });
});

/**
 * B58 and D53. A removed child gets 401 `account_closed`, and reads that the
 * account is closed. Before the code existed it reached this door as
 * `account_paused` and was told the account was on pause - which says it
 * will start again, and brings them back to the tablet to try.
 */
describe("a closed account at the door", () => {
  it("says closed, never on pause, and offers no way to retry", async () => {
    await doorFor("account_closed");

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Your Nevo account is closed.",
    );
    expect(document.body.textContent).not.toMatch(/pause/i);
    expect(screen.queryByText(/log back in|try again|away for a while/i)).toBeNull();
  });

  it("keeps the way back to the picker for whoever is next (D52)", async () => {
    await doorFor("account_closed");

    expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute(
      "href",
      "/auth/login",
    );
  });
});
