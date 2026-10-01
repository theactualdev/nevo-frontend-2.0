import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";
import { StudentEntry } from "./StudentEntry";

/**
 * The entry check, and the three answers it can get.
 *
 * The one worth defending is the FAILURE branch. "Not consented" and "we could
 * not ask" look identical from here, and holding on the second would turn a
 * dropped network into a wall a child cannot pass and cannot be told about.
 * `useConsentGate` made exactly this ruling for withdrawal and it is made the
 * same way here, deliberately, so the two cannot drift.
 */

const { resolve, replace } = vi.hoisted(() => ({
  resolve: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("@/lib/api/studentEntry", () => ({
  studentEntryApi: { resolve, setPin: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn() }),
}));
// The Welcome brings the auth context and its own link check with it. What
// matters here is only which of its states the entry link asks for.
vi.mock("@/components/student/Welcome/WelcomeScreen", () => ({
  WelcomeScreen: ({ linkError }: { linkError?: boolean }) => (
    <p>{linkError ? "welcome: dead link" : "welcome"}</p>
  ),
}));

const held = () => screen.queryByText(/isn't quite ready for you yet/i);
const toldDead = () => screen.queryByText("welcome: dead link");

beforeEach(() => {
  resolve.mockReset();
  replace.mockReset();
});

afterEach(() => {
  cleanup();
});

const state = (over: Record<string, unknown> = {}) => ({
  firstName: "Amara",
  className: "JSS 1B",
  consentState: "given",
  age: 11,
  accountReady: false,
  ...over,
});

describe("when consent is not in yet", () => {
  it("holds the child at the waiting screen", async () => {
    resolve.mockResolvedValue(state({ consentState: "pending" }));

    render(<StudentEntry token="t-1" />);

    await waitFor(() => expect(held()).toBeTruthy());
  });

  it("does not send them onward", async () => {
    // The whole point of moving the check to entry: they never start.
    resolve.mockResolvedValue(state({ consentState: "pending" }));

    render(<StudentEntry token="t-1" />);

    await waitFor(() => expect(held()).toBeTruthy());
    expect(replace).not.toHaveBeenCalled();
  });

  it("asks once and never again", async () => {
    // 00d replaced a gate that polled.
    resolve.mockResolvedValue(state({ consentState: "pending" }));

    render(<StudentEntry token="t-1" />);

    await waitFor(() => expect(held()).toBeTruthy());
    expect(resolve).toHaveBeenCalledTimes(1);
  });
});

describe("when consent is in", () => {
  it("hands the child onward, carrying the token", async () => {
    resolve.mockResolvedValue(state({ consentState: "given" }));

    render(<StudentEntry token="t-1" />);

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/student/onboarding?token=t-1"),
    );
    expect(held()).toBeNull();
  });
});

describe("when the read fails", () => {
  it("does not hold them - a dropped network is not a missing consent", async () => {
    /*
     * The decisive one. Treating an unanswerable read as "not consented" locks
     * a child out on an outage, and the destination validates the link itself,
     * so a genuinely bad link is still refused there with words.
     */
    resolve.mockRejectedValue(new Error("network"));

    render(<StudentEntry token="t-1" />);

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(held()).toBeNull();
  });

  it("does not call the link dead when the server is the one failing", async () => {
    resolve.mockRejectedValue(new ApiError(503, "cold start"));

    render(<StudentEntry token="t-1" />);

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(toldDead()).toBeNull();
  });
});

describe("when the server says the link is dead", () => {
  it("tells the child here, in the Welcome's dead-link words", async () => {
    // `entry_link_invalid`, live, for an unknown, expired or revoked token.
    resolve.mockRejectedValue(
      new ApiError(404, "not found", {
        detail: { code: "entry_link_invalid", message: "Ask your teacher for a new link." },
      }),
    );

    render(<StudentEntry token="t-1" />);

    await waitFor(() => expect(toldDead()).toBeTruthy());
  });

  it("does not hand a dead link onward into onboarding", async () => {
    resolve.mockRejectedValue(new ApiError(404, "not found"));

    render(<StudentEntry token="t-1" />);

    await waitFor(() => expect(toldDead()).toBeTruthy());
    expect(replace).not.toHaveBeenCalled();
    expect(held()).toBeNull();
  });
});

describe("while the answer is in flight", () => {
  it("shows nothing rather than a spinner", async () => {
    // A spinner here is the "door held shut" the frame refuses, and a
    // consented child would see it flash on their way past for no reason.
    resolve.mockReturnValue(new Promise(() => {}));

    const { container } = render(<StudentEntry token="t-1" />);

    expect(container.innerHTML).toBe("");
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("what it leaves alone", () => {
  it("branches on consent only, not on accountReady", async () => {
    /*
     * `accountReady` has two plausible readings - "no account yet, create a
     * PIN" and "not cleared to have one" - which route a child to different
     * screens. Asked 23 Sep. Until it is answered it must change nothing, or
     * we ship a guess about a child's access.
     */
    resolve.mockResolvedValue(
      state({ consentState: "given", accountReady: false }),
    );

    render(<StudentEntry token="t-1" />);

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(held()).toBeNull();
  });

});

describe("a disputed date of birth", () => {
  it("holds at the same screen, with the same words", async () => {
    /*
     * RULED 23 SEP. Two reasons, one screen, and the child is told neither.
     * The obvious "improvement" here is to explain - and explaining invites a
     * child to go and settle a disagreement between their parent and their
     * school, which is the one thing that must never happen.
     */
    resolve.mockResolvedValue(
      state({ consentState: "given", ageCheckPending: true }),
    );

    render(<StudentEntry token="t-1" />);

    await waitFor(() => expect(held()).toBeTruthy());
    expect(replace).not.toHaveBeenCalled();
  });

  it("says nothing about why, in either state", async () => {
    // The screen is the same object in both cases, so this pins that no
    // branch ever grows its own words.
    resolve.mockResolvedValue(
      state({ consentState: "given", ageCheckPending: true }),
    );

    render(<StudentEntry token="t-1" />);

    await waitFor(() => expect(held()).toBeTruthy());
    const text = (document.body.textContent ?? "").replace(/\s+/g, " ").trim();

    expect(text).toBe("Nevo isn't quite ready for you yetIt will be soon.");
  });
});
