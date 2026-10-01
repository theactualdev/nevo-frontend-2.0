import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ObservedInteractionSequence } from "./ObservedInteractionSequence";
import {
  clearOnboardingDraft,
  mergeOnboardingDraft,
} from "@/lib/auth/onboarding";
import { clearSession, getRememberedProfile } from "@/lib/auth/session";

/**
 * The last two screens of onboarding, walked end to end with each earlier
 * screen reduced to the one button that moves it on.
 *
 * Two things went wrong here for every child who joined by link or class code:
 *   - "You're In" sent them to the Lessons tab, never their first lesson. The
 *     dashboard read was mounted with the sequence, before the account existed,
 *     so it had no token, returned early, and nothing ran it again.
 *   - The tablet never remembered them. The join gives no school code, and the
 *     one the account has on `users/me` was never asked for.
 */

const { push, acceptJoin, me, myDashboard, myConsentGate } = vi.hoisted(
  () => ({
    push: vi.fn(),
    acceptJoin: vi.fn(),
    me: vi.fn(),
    myDashboard: vi.fn(),
    myConsentGate: vi.fn(),
  }),
);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks", () => ({
  useAuth: () => ({ user: null }),
  useSignals: () => ({ trackEvent: vi.fn(), flush: vi.fn() }),
}));
vi.mock("@/lib/api", () => ({ authApi: {} }));
vi.mock("@/lib/api/invites", () => ({ invitesApi: { acceptJoin } }));
vi.mock("@/lib/api/users", () => ({ usersApi: { me } }));
vi.mock("@/lib/api/students", () => ({ studentsApi: { myDashboard } }));
vi.mock("@/lib/api/consents", () => ({ consentsApi: { myConsentGate } }));
vi.mock("@/lib/profiling/pendingBaseline", () => ({
  flushPendingBaseline: vi.fn(async () => {}),
  readPendingBaseline: () => null,
}));

vi.mock("./TransitionScreen", () => ({
  TransitionScreen: ({ onDone }: { onDone: () => void }) => (
    <button onClick={onDone}>after transition</button>
  ),
}));
vi.mock("@/components/student/Profiling/ProfilingFlow", () => ({
  ProfilingFlow: ({ onDone }: { onDone: (run: string) => void }) => (
    <button onClick={() => onDone("run-1")}>after profiling</button>
  ),
}));
vi.mock("./PinCreationScreen", () => ({
  PinCreationScreen: ({
    storePin,
    onComplete,
  }: {
    storePin: (pin: string) => Promise<void>;
    onComplete: () => void;
  }) => (
    <button onClick={() => void storePin("1234").then(onComplete)}>
      set pin
    </button>
  ),
}));
vi.mock("./YoureInScreen", () => ({
  YoureInScreen: ({
    onDone,
    deviceRemembered,
  }: {
    onDone: () => void;
    deviceRemembered: boolean;
  }) => (
    <div>
      <p>remembered:{String(deviceRemembered)}</p>
      <button onClick={onDone}>you are in</button>
    </div>
  ),
}));

const future = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  clearSession();
  window.localStorage.clear();
  clearOnboardingDraft();
  // A child who arrived by join link: a name, an invitation, no school code.
  mergeOnboardingDraft({ name: "Amara Kalu", joinToken: "tok-1" });
  acceptJoin.mockResolvedValue({
    userId: "student-9",
    role: "student",
    loginIdentifier: "amara.k",
    session: {
      accessToken: "tok-s",
      tokenType: "bearer",
      expiresAt: future(),
      userId: "student-9",
      role: "student",
    },
  });
  me.mockResolvedValue({ school: { code: "751A1136" } });
  myDashboard.mockResolvedValue({
    student: {},
    assignments: [
      { status: "assigned", availableFrom: null, lesson: { id: "L-7" } },
    ],
    recentProgress: [],
  });
  myConsentGate.mockResolvedValue({ blocked: false });
});

afterEach(() => {
  cleanup();
  clearSession();
  window.localStorage.clear();
  clearOnboardingDraft();
});

/** Walk the sequence to "You're In", creating the account on the way. */
async function walkToYoureIn() {
  render(<ObservedInteractionSequence />);
  fireEvent.click(screen.getByRole("button", { name: "after transition" }));
  fireEvent.click(screen.getByRole("button", { name: "after profiling" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  fireEvent.click(screen.getByRole("button", { name: "set pin" }));
  await screen.findByRole("button", { name: "you are in" });
}

describe("You're In, for a child who joined by link", () => {
  it("reads their lessons once the account exists", async () => {
    await walkToYoureIn();

    await waitFor(() => expect(myDashboard).toHaveBeenCalled());
  });

  it("hands them into their first lesson, not the Lessons tab", async () => {
    await walkToYoureIn();
    await waitFor(() => expect(myDashboard).toHaveBeenCalled());
    // Let the read land before the hand-off, as the celebration's hold does.
    await act(async () => {});

    fireEvent.click(screen.getByRole("button", { name: "you are in" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/student/lessons/L-7"));
  });

  it("is remembered by the tablet, with the account's own school code", async () => {
    await walkToYoureIn();

    expect(screen.getByText("remembered:true")).toBeInTheDocument();
    expect(getRememberedProfile()).toMatchObject({
      schoolCode: "751A1136",
      loginIdentifier: "amara.k",
    });
  });

  it("is told to ask their teacher only when the account's code cannot be read", async () => {
    me.mockRejectedValue(new Error("offline"));

    await walkToYoureIn();

    expect(screen.getByText("remembered:false")).toBeInTheDocument();
    expect(getRememberedProfile()).toBeNull();
  });
});

describe("where the learning notice sits (D10, 1 Oct)", () => {
  it("comes after the baseline and before the PIN", () => {
    // The parent consents, the child is informed. Placed after, the notice
    // says what the activities just done were for.
    render(<ObservedInteractionSequence />);
    fireEvent.click(screen.getByRole("button", { name: "after transition" }));

    expect(screen.queryByText(/get to know how you learn/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "after profiling" }));

    expect(screen.getByText(/get to know how you learn/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "set pin" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByRole("button", { name: "set pin" })).toBeInTheDocument();
  });
});
