import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";
import { SetupGateProvider } from "./SetupGateContext";
import { useSetupGate } from "@/hooks/useSetupGate";

/**
 * Why the admin console is read-only, when it is.
 *
 * Two frames arrive at the same behaviour by different routes — D01b AC-05
 * (address not confirmed) and D24 OB-00 (school not paid for) — so this is one
 * mechanism with two sentences rather than two mechanisms that would disagree.
 *
 * The tests that matter most here are the FAILURE ones. This is an explanation
 * layer, not a security boundary: the server refuses these writes either way.
 * So a broken read must never produce "your school isn't active yet", which is
 * the most alarming sentence available on the least evidence.
 */

const read = vi.fn();
const getOnboarding = vi.fn();

vi.mock("@/lib/api/emailConfirmation", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/api/emailConfirmation")>();
  return {
    ...actual,
    emailConfirmationApi: { ...actual.emailConfirmationApi, read: () => read() },
  };
});

vi.mock("@/lib/api/onboarding", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/onboarding")>();
  return {
    ...actual,
    onboardingApi: { ...actual.onboardingApi, get: () => getOnboarding() },
  };
});

function Probe() {
  const { writesPaused, pause, resolved, note, email } = useSetupGate();
  return (
    <div>
      <span data-testid="paused">{String(writesPaused)}</span>
      <span data-testid="pause">{pause ?? "-"}</span>
      <span data-testid="resolved">{String(resolved)}</span>
      <span data-testid="note">{note ?? "-"}</span>
      <span data-testid="email">{email ?? "-"}</span>
    </div>
  );
}

const mount = () =>
  render(
    <SetupGateProvider>
      <Probe />
    </SetupGateProvider>,
  );

const at = (id: string) => screen.getByTestId(id).textContent;

const confirmation = (status: string) => ({
  status,
  email: "f.adebayo@brightgate.edu.ng",
  expiresAt: null,
  message: "x",
});

const onboarding = (stage: string) => ({
  stage,
  classes: [],
  teacherCount: 0,
  studentCount: 0,
  rejected: [],
  invoiceId: null,
  amountDue: null,
  currency: null,
  periodLabel: null,
  canConfirm: false,
  canPay: false,
  canActivate: false,
});

beforeEach(() => {
  vi.clearAllMocks();
  read.mockResolvedValue(confirmation("confirmed"));
  getOnboarding.mockResolvedValue(onboarding("activated"));
});

describe("SetupGate", () => {
  it("pauses nothing for a confirmed, active school", async () => {
    mount();
    await waitFor(() => expect(at("resolved")).toBe("true"));
    expect(at("paused")).toBe("false");
    expect(at("note")).toBe("-");
  });

  it("pauses on an unconfirmed address, in AC-05's words", async () => {
    read.mockResolvedValue(confirmation("pending"));
    mount();

    await waitFor(() => expect(at("paused")).toBe("true"));
    expect(at("pause")).toBe("email_unconfirmed");
    expect(at("note")).toBe("Paused until your email is confirmed.");
    expect(at("email")).toBe("f.adebayo@brightgate.edu.ng");
  });

  it("pauses on a school that is not active yet", async () => {
    getOnboarding.mockResolvedValue({
      ...onboarding("awaiting_payment"),
      inOnboarding: true,
    });
    mount();

    await waitFor(() => expect(at("paused")).toBe("true"));
    expect(at("pause")).toBe("not_active");
    expect(at("note")).toBe("Paused until your school is active.");
  });

  it("does NOT pause an established school whatever its stage says", async () => {
    /*
     * THE REGRESSION TEST FOR A LIVE DEFECT. This gate read
     * `stage !== "activated"`, and backend then found the read route was
     * CREATING the record it claimed to read - every established school's
     * first admin page load wrote a row saying it was back at "uploading".
     *
     * So the console held every established school read-only on the strength
     * of its own page load. The stage here is deliberately the worst case; the
     * only thing that may decide this is `inOnboarding`.
     */
    getOnboarding.mockResolvedValue({
      ...onboarding("uploading"),
      inOnboarding: false,
    });
    mount();

    await waitFor(() => expect(at("resolved")).toBe("true"));
    expect(at("paused")).toBe("false");
    expect(at("pause")).toBe("-");
  });

  it("treats an absent inOnboarding as not in onboarding", async () => {
    // Not `required`, default false. A school we cannot place is left alone
    // rather than paused - the safe direction for an explanation layer.
    // Built without the key at all, the way an older deployment answers.
    getOnboarding.mockResolvedValue(onboarding("uploading"));
    mount();

    await waitFor(() => expect(at("resolved")).toBe("true"));
    expect(at("paused")).toBe("false");
  });

  it("names the email reason first when both are true", async () => {
    // It is the one a person can act on in the next thirty seconds.
    read.mockResolvedValue(confirmation("pending"));
    getOnboarding.mockResolvedValue(onboarding("uploading"));
    mount();

    await waitFor(() => expect(at("paused")).toBe("true"));
    expect(at("pause")).toBe("email_unconfirmed");
  });

  it("does not infer the answer from empty arrays", async () => {
    /*
     * Backend's own schema note: the state is typed "so the server decides
     * which step a school is on, rather than a console inferring it from which
     * arrays happen to be empty". This one has nothing in it at all; anything
     * deriving from counts would call it mid-setup.
     */
    getOnboarding.mockResolvedValue({
      ...onboarding("activated"),
      inOnboarding: false,
    });
    mount();

    await waitFor(() => expect(at("resolved")).toBe("true"));
    expect(at("paused")).toBe("false");
  });

  it("PAUSES NOTHING when both reads fail", async () => {
    /*
     * The one that must not be "fixed" into failing closed. The server refuses
     * these writes anyway, so pausing here buys no safety — it only turns a
     * transient 500 into a console telling a school it is not active.
     */
    read.mockRejectedValue(new Error("network"));
    getOnboarding.mockRejectedValue(new Error("network"));
    mount();

    await waitFor(() => expect(at("resolved")).toBe("false"));
    expect(at("paused")).toBe("false");
    expect(at("pause")).toBe("-");
    expect(at("note")).toBe("-");
  });

  it("still answers on the half it did hear", async () => {
    // A failed stage read does not erase a known-unconfirmed address.
    getOnboarding.mockRejectedValue(new Error("network"));
    read.mockResolvedValue(confirmation("pending"));
    mount();

    await waitFor(() => expect(at("paused")).toBe("true"));
    expect(at("pause")).toBe("email_unconfirmed");
  });

  it("does not pause when the onboarding read fails outright", async () => {
    // The 404 case this used to test cannot happen - the route never 404s.
    // A failed read is still not a school mid-setup.
    getOnboarding.mockRejectedValue(new ApiError(500, "boom", {}));
    read.mockResolvedValue(confirmation("confirmed"));
    mount();

    await waitFor(() => expect(at("resolved")).toBe("true"));
    expect(at("paused")).toBe("false");
  });

  it("answers outside the provider without throwing", async () => {
    // Shared components ask this too; throwing is how the check ends up
    // duplicated inline instead.
    render(<Probe />);
    expect(at("paused")).toBe("false");
    expect(at("resolved")).toBe("false");
  });
});
