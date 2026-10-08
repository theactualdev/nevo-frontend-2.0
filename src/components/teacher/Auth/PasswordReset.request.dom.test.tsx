import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { requestPasswordReset } = vi.hoisted(() => ({ requestPasswordReset: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/api", () => ({
  authApi: { requestPasswordReset, loginPassword: vi.fn(), completePasswordReset: vi.fn() },
  teamApi: { acceptInvitation: vi.fn() },
}));
vi.mock("@/lib/api/invites", () => ({ invitesApi: { acceptJoin: vi.fn(), lookupJoin: vi.fn() } }));

import { ApiError } from "@/lib/api/client";
import { TeacherPasswordReset } from "./TeacherPasswordReset";

/**
 * T239. The reset request screen, which three routes mount and no test read.
 *
 * Two promises it has to keep. Any answer the SERVER gives gets the same
 * "check your inbox", or the screen tells a stranger which addresses have an
 * account. And a request that never reached the server is the one case that
 * must NOT say a link is on its way.
 */

const ask = () => {
  render(<TeacherPasswordReset />);
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "someone@school.ng" } });
  fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
};
const SENT = /Check your inbox/;
const UNREACHABLE = /couldn.t reach Nevo/i;

beforeEach(() => {
  requestPasswordReset.mockReset();
});

describe("asking for a reset link", () => {
  it("says the link is on its way when the server took it", async () => {
    requestPasswordReset.mockResolvedValue({});
    ask();

    expect(await screen.findByText(SENT, {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it.each([
    ["an address with no account", 404],
    ["an address the server would not take", 422],
    ["a server that broke", 500],
  ])("says exactly the same for %s", async (_, status) => {
    requestPasswordReset.mockRejectedValue(new ApiError(status, "no"));
    ask();

    expect(await screen.findByText(SENT, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByText(UNREACHABLE)).not.toBeInTheDocument();
  });

  it("does not promise a link when the request never reached the server", async () => {
    requestPasswordReset.mockRejectedValue(new ApiError(0, "network"));
    ask();

    expect(await screen.findByText(UNREACHABLE, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByText(SENT)).not.toBeInTheDocument();
  });

  it("will not send until the address could be one", () => {
    render(<TeacherPasswordReset />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "not-an-address" } });

    expect(screen.getByRole("button", { name: "Send reset link" })).toBeDisabled();
  });
});
