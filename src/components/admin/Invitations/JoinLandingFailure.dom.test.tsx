import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { ApiError } from "@/lib/api/client";
import { JoinLanding } from "./JoinLanding";

/**
 * The one public page a teacher or child reaches from a message. Any failed
 * lookup - a network blip, a 5xx - used to tell them "This invite is no longer
 * valid", with no way to try again. Only a 404 or 410 means that.
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
});
