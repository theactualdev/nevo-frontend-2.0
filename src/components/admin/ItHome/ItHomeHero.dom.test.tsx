import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";
import { ItHomeView } from "./ItHomeView";

/**
 * A school that never connected a sign-in provider was told "Every account,
 * class and piece of work stays exactly as it is" - D10b's line for a school
 * that DISCONNECTED one (the 2 Nov audit). It now gets D10's own line.
 */

const status = vi.fn();
vi.mock("@/lib/api/school", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/school")>();
  return { ...actual, schoolApi: { ...actual.schoolApi, get: async () => ({ code: "K7DQ" }) } };
});
vi.mock("@/lib/api/sso", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/sso")>();
  return {
    ...actual,
    ssoApi: { ...actual.ssoApi, status: () => status(), syncHistory: async () => ({ runs: [] }) },
  };
});

// Braced: an arrow that returns the mock has vitest call it as cleanup.
beforeEach(() => {
  status.mockReset();
});

describe("the IT home's first line", () => {
  it("says the school code works, for a school that never connected a provider", async () => {
    status.mockRejectedValue(new ApiError(404, "none"));
    render(<ItHomeView />);
    expect(await screen.findByText("Your school code K7DQ works right now - no setup needed.")).toBeInTheDocument();
    expect(screen.queryByText(/stays exactly as it is/)).toBeNull();
  });

  it("keeps the disconnect line for a school that disconnected one", async () => {
    status.mockResolvedValue({ provider: "google", status: "disconnected", lastSuccessfulSyncAt: null });
    render(<ItHomeView />);
    expect(await screen.findByText(/stays exactly as it is/)).toBeInTheDocument();
  });
});
