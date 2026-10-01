import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { ApiError } from "@/lib/api/client";
import { JoinLanding } from "./JoinLanding";

/**
 * The one public page a teacher or child reaches from a message. Any failed
 * lookup - a network blip, a 5xx - used to tell them "This invite is no longer
 * valid", with no way to try again. Only the server's answer about the link
 * (404, 410 or the contract's 422) means that.
 */

const lookupJoin = vi.fn();
vi.mock("@/lib/api/invites", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/invites")>();
  return { ...actual, invitesApi: { ...actual.invitesApi, lookupJoin: (t: string) => lookupJoin(t) } };
});

beforeEach(() => lookupJoin.mockReset());

describe("JoinLanding when the lookup fails", () => {
  it("does not call a link dead because Nevo could not be reached", async () => {
    lookupJoin.mockRejectedValueOnce(new ApiError(503, "down"));
    const { container } = render(<JoinLanding token="tok" />);

    await waitFor(() => expect(visibleText(container)).toMatch(/couldn.t check your invite/));
    expect(visibleText(container)).not.toMatch(/no longer valid/);
  });

  it("tries again when asked", async () => {
    lookupJoin.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce({
      status: "valid",
      role: "teacher",
      schoolName: "Brightgate Academy",
      expiresAt: "2099-01-01T00:00:00Z",
    });
    const { container } = render(<JoinLanding token="tok" />);

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await waitFor(() => expect(lookupJoin).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(visibleText(container)).toMatch(/Brightgate Academy/));
  });

  it("still says a link is dead when the server says so", async () => {
    lookupJoin.mockRejectedValueOnce(new ApiError(404, "gone"));
    const { container } = render(<JoinLanding token="tok" />);

    await waitFor(() => expect(visibleText(container)).toMatch(/no longer valid/));
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("reads the contract's own refusal as a dead link, not an outage", async () => {
    // 422 is the only error `GET /join/{token}` declares.
    lookupJoin.mockRejectedValueOnce(new ApiError(422, "unreadable"));
    const { container } = render(<JoinLanding token="tok" />);

    await waitFor(() => expect(visibleText(container)).toMatch(/no longer valid/));
    expect(visibleText(container)).not.toMatch(/couldn.t check/);
  });
});

describe("JoinLanding when the lookup answers", () => {
  it("does not turn a good invite away because this device's clock runs fast", async () => {
    /*
     * A 200 is the server saying the link is good - `status` is the constant
     * "valid" on the wire. The page used to compare `expiresAt` with the
     * device clock, so a tablet a few days fast was told a working invite
     * had expired.
     */
    lookupJoin.mockResolvedValueOnce({
      status: "valid",
      role: "student",
      schoolName: "Brightgate Academy",
      expiresAt: "2001-01-01T00:00:00Z",
    });
    const { container } = render(<JoinLanding token="tok" />);

    await waitFor(() => expect(visibleText(container)).toMatch(/Brightgate Academy/));
    expect(visibleText(container)).not.toMatch(/expired|no longer valid/);
    expect(screen.getByRole("link", { name: "Get started" })).toBeVisible();
  });
});
