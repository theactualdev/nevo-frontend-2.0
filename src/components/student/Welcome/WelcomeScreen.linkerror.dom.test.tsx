import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { WelcomeScreen } from "./WelcomeScreen";

/**
 * A DEAD JOIN LINK SAID SO AT THE VERY END, OR NEVER.
 *
 * `linkError` renders the dead-link copy - design's words since 24 Sep - for
 * a new one", and **nothing ever set it** - the prop had no caller anywhere in
 * the app. So an expired or revoked invitation looked exactly like a good one:
 * the child gave their name, their school and their class, sat the whole motor
 * baseline, and the link was only redeemed at PIN creation - where it failed
 * and they were told their PIN did not save.
 *
 * `GET /api/v1/join/{token}` is public and answers `status` as valid, expired
 * or revoked. It is the same call the admin console's join landing already
 * makes, so the screen can ask at the door.
 */

const lookupJoin = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/invites", () => ({ invitesApi: { lookupJoin } }));

vi.mock("@/lib/auth/onboarding", () => ({ mergeOnboardingDraft: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  clearSession: vi.fn(),
  getStoredDisplayName: () => null,
}));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => false }));
vi.mock("@/hooks/useHydrated", () => ({ useHydrated: () => true }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

/**
 * Design's words, 24 Sep: "This link is not working any more." / "Ask your
 * teacher to send you a new one."
 *
 * The TENSE is the thing to hold. This used to read "isn't working right now",
 * which says temporary - so a child waits, or tries the same dead link again.
 * A revoked or expired invitation will never work, and the next action is to
 * ask for a different one.
 */
const DEAD = /link is not working any more/i;
const ASK = /ask your teacher to send you a new one/i;
const WAY_IN = "I have a school code";

beforeEach(() => {
  lookupJoin.mockReset().mockResolvedValue({
    status: "valid",
    role: "student",
    schoolName: "Kano Primary",
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  });
});

afterEach(() => {
  cleanup();
});

describe("a child arriving on a join link", () => {
  it("is told at the door when the link has expired", async () => {
    lookupJoin.mockResolvedValue({ status: "expired" });

    render(<WelcomeScreen joinToken="tok-1" />);

    expect(await screen.findByText(DEAD)).toBeInTheDocument();
  });

  it("is told what to do about it, not only that it failed", async () => {
    /*
     * The second line is half the ruling. "This link is not working any more"
     * closes the door; a child still needs to know the next action is to ask
     * for a different link rather than to keep trying this one.
     */
    lookupJoin.mockResolvedValue({ status: "expired" });

    render(<WelcomeScreen joinToken="tok-1" />);

    expect(await screen.findByText(ASK)).toBeInTheDocument();
  });

  it("does not tell a child to wait, which the old copy did", async () => {
    // "isn't working right now" reads as temporary. It never was.
    lookupJoin.mockResolvedValue({ status: "revoked" });

    render(<WelcomeScreen joinToken="tok-1" />);

    await screen.findByText(DEAD);

    expect(document.body.textContent).not.toMatch(/right now|try again|later/i);
  });

  it("is told when it has been revoked", async () => {
    lookupJoin.mockResolvedValue({ status: "revoked" });

    render(<WelcomeScreen joinToken="tok-1" />);

    expect(await screen.findByText(DEAD)).toBeInTheDocument();
  });

  it("walks straight in when the link is good", async () => {
    render(<WelcomeScreen joinToken="tok-1" />);

    await waitFor(() => expect(lookupJoin).toHaveBeenCalledWith("tok-1"));
    expect(screen.getByRole("button", { name: WAY_IN })).toBeInTheDocument();
    expect(screen.queryByText(DEAD)).toBeNull();
  });

  it("is not sent away by a network that dropped", async () => {
    /*
     * A failed lookup says nothing about the invitation. Turning it into "ask
     * your teacher for a new one" would send a child away from a link that
     * works, and a new link would fail the same way.
     */
    lookupJoin.mockRejectedValue(new Error("offline"));

    render(<WelcomeScreen joinToken="tok-1" />);

    await waitFor(() => expect(lookupJoin).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: WAY_IN })).toBeInTheDocument();
    expect(screen.queryByText(DEAD)).toBeNull();
  });
});

describe("a child arriving without a link", () => {
  it("asks the server nothing", () => {
    render(<WelcomeScreen />);

    expect(lookupJoin).not.toHaveBeenCalled();
  });

  it("still honours a caller that already knows the link is bad", async () => {
    // The prop keeps working for callers that have their own reason.
    render(<WelcomeScreen linkError />);

    expect(await screen.findByText(DEAD)).toBeInTheDocument();
  });
});
