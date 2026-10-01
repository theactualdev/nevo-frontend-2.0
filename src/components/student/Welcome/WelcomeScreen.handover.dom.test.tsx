import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WelcomeScreen } from "./WelcomeScreen";

/**
 * A JOIN LINK ARRIVING ON A TABLET SOMEBODY IS ALREADY SIGNED INTO.
 *
 * Onboarding collects a name, a school and a class and then runs the motor
 * baseline, and none of it knows a session is live - so the measurements come
 * from whoever is holding the tablet and are written against whoever was still
 * signed in. The parked-baseline ownership guard stops the send; this stops the
 * walk from starting under the wrong session at all.
 *
 * The route guard lets `?token=` through deliberately: bouncing it would
 * discard the invitation in silence and drop the arriving child into the
 * signed-in child's dashboard, which is a worse version of the same bug. That
 * was the right call while there was nowhere to hand the tablet over TO.
 *
 * 28c is what changed. The tablet remembers up to six children, so signing the
 * current one out costs a PIN rather than their account - which is both why
 * this is buildable and what the screen is able to promise.
 */

const hasSession = vi.hoisted(() => ({ value: false }));
vi.mock("@/hooks/useHasSession", () => ({
  useHasSession: () => hasSession.value,
}));

const hydrated = vi.hoisted(() => ({ value: true }));
vi.mock("@/hooks/useHydrated", () => ({ useHydrated: () => hydrated.value }));

const auth = vi.hoisted(() => ({
  cleared: 0,
  name: null as string | null,
}));
vi.mock("@/lib/auth/session", () => ({
  clearSession: () => {
    auth.cleared += 1;
  },
  getStoredDisplayName: () => auth.name,
}));

const draft = vi.hoisted(() => ({ merged: [] as unknown[] }));
vi.mock("@/lib/auth/onboarding", () => ({
  // The draft each arrival starts with - a fresh one, never a merge.
  startOnboardingDraft: (seed: unknown) => draft.merged.push(seed),
}));

const signOut = vi.hoisted(() => vi.fn());
vi.mock("@/hooks", () => ({ useAuth: () => ({ signOut }) }));

const replace = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, back: vi.fn() }),
}));

const body = () => document.body.textContent ?? "";

beforeEach(() => {
  hasSession.value = false;
  hydrated.value = true;
  auth.cleared = 0;
  auth.name = null;
  draft.merged = [];
  replace.mockReset();
  signOut.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("a join link on a tablet somebody is signed into", () => {
  it("hands the tablet over rather than starting onboarding", () => {
    hasSession.value = true;
    auth.name = "Ada";

    render(<WelcomeScreen joinToken="tok-1" />);

    expect(body()).toMatch(/Someone new is joining/i);
    expect(screen.getByRole("button", { name: "Carry on" })).toBeInTheDocument();
  });

  it("says plainly what carrying on costs, and that it is recoverable", () => {
    // The promise only became true with 28c. Before it, signing the current
    // child out meant losing them: the device remembered exactly one.
    hasSession.value = true;
    auth.name = "Ada";

    render(<WelcomeScreen joinToken="tok-1" />);

    expect(body()).toMatch(/Carrying on signs Ada out/i);
    expect(body()).toMatch(/remembers Ada/i);
    expect(body()).toMatch(/takes a PIN/i);
  });

  it("does not touch the session until the tablet is actually handed over", () => {
    // A child handed their own tablet who tapped the wrong thing loses nothing.
    hasSession.value = true;

    render(<WelcomeScreen joinToken="tok-1" />);

    expect(auth.cleared).toBe(0);
  });

  it("ends the session BEFORE onboarding starts", () => {
    /*
     * The ordering is the whole fix. Everything downstream - the baseline
     * especially - must not be able to attribute itself to the child who was
     * here, and the only way to guarantee that is for the session to be gone
     * before the first onboarding screen renders.
     */
    hasSession.value = true;
    render(<WelcomeScreen joinToken="tok-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Carry on" }));

    expect(auth.cleared).toBe(1);
    expect(body()).not.toMatch(/Someone new is joining/i);
  });

  it("signs the previous child out, not only forgets their token", () => {
    /*
     * Clearing the stored token alone left the server session live, the auth
     * context still holding the previous child, and the on-device signal store
     * still tagged with them - so the new account was born under an old
     * child's context. `signOut` is the one call that ends all three.
     */
    hasSession.value = true;
    render(<WelcomeScreen joinToken="tok-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Carry on" }));

    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("keeps the invitation, so the child does not arrive as nobody", () => {
    // The token is what makes this an invited child rather than a stranger
    // inventing an account. Dropping it here would undo the fix that first
    // made join links work at all.
    hasSession.value = true;
    render(<WelcomeScreen joinToken="tok-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Carry on" }));

    expect(draft.merged).toContainEqual({ joinToken: "tok-1" });
  });

  it("lets the child who is already here stay, and keeps their invitation out of the draft", () => {
    // Writing the token while the hand-over is still up would attach somebody
    // else's invitation to this child's draft.
    hasSession.value = true;
    auth.name = "Ada";
    render(<WelcomeScreen joinToken="tok-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Keep Ada signed in" }));

    expect(replace).toHaveBeenCalledWith("/student/dashboard");
    expect(draft.merged).toEqual([]);
    expect(auth.cleared).toBe(0);
  });

  it("invents no name when the device does not know one", () => {
    // A PIN login returns a session rather than a profile, so the device
    // genuinely may not know who is signed in.
    hasSession.value = true;
    auth.name = null;

    render(<WelcomeScreen joinToken="tok-1" />);

    expect(body()).toMatch(/Someone is already signed in/i);
    expect(
      screen.getByRole("button", { name: "Keep me signed in" }),
    ).toBeInTheDocument();
  });
});

describe("every other arrival is untouched", () => {
  it("shows the welcome to an invited child on a tablet nobody is signed into", () => {
    hasSession.value = false;

    render(<WelcomeScreen joinToken="tok-1" />);

    expect(body()).not.toMatch(/Someone new is joining/i);
    expect(draft.merged).toContainEqual({ joinToken: "tok-1" });
  });

  it("shows the welcome to a child arriving with no invitation at all", () => {
    hasSession.value = true; // and it still does not matter, with no token

    render(<WelcomeScreen />);

    expect(body()).not.toMatch(/Someone new is joining/i);
  });
});

describe("before the client can see the session", () => {
  it("draws neither screen for a token arrival", () => {
    /*
     * `useHasSession`'s server snapshot is hardcoded false, so an early render
     * would show the arriving child the welcome and then swap it - or let them
     * start onboarding under someone else's session for a frame.
     */
    hydrated.value = false;
    hasSession.value = true;

    const { container } = render(<WelcomeScreen joinToken="tok-1" />);

    expect(container).toBeEmptyDOMElement();
    expect(draft.merged).toEqual([]);
  });

  it("still renders immediately when there is no token to judge", () => {
    // The gate must not cost every ordinary arrival its server render.
    hydrated.value = false;
    hasSession.value = false;

    const { container } = render(<WelcomeScreen />);

    expect(container).not.toBeEmptyDOMElement();
  });
});

describe("each arrival starts its own draft", () => {
  /*
   * The draft was merged into and only cleared when a child finished, so a
   * child who walked away left their name and invitation for the next child
   * on the tablet. Every arrival now replaces it with only what it brought.
   */
  it("starts an empty draft for a child with no invitation", () => {
    render(<WelcomeScreen />);

    expect(draft.merged).toEqual([{}]);
  });

  it("starts a draft holding only this child's invitation", () => {
    render(<WelcomeScreen joinToken="tok-2" />);

    expect(draft.merged).toEqual([{ joinToken: "tok-2" }]);
  });
});
