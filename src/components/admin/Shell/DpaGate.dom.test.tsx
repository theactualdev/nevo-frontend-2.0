import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { DpaGate } from "./DpaGate";

/**
 * A proprietor who confirmed their email, closed the wizard tab and signed in
 * landed in the full console with no data agreement accepted, and nothing
 * sent them back. `GET /api/v1/school/dpa-acceptance` answers null in that
 * case; it was wrapped and never called.
 */

const dpaAcceptance = vi.fn();
const gate = vi.fn();
const perms = vi.fn();

vi.mock("@/hooks", () => ({
  useSetupGate: () => gate(),
  usePermissions: () => perms(),
}));
vi.mock("@/lib/api/school", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/school")>();
  return {
    ...actual,
    schoolApi: {
      ...actual.schoolApi,
      dpaAcceptance: () => dpaAcceptance(),
      get: () => Promise.resolve({ name: "Brightgate Academy" }),
    },
  };
});

const ACCEPTED = {
  id: "d1",
  schoolId: "s1",
  version: "0.9-draft",
  acceptedByUserId: "u1",
  acceptedByName: "Folake Adebayo",
  acceptedAt: "2026-09-20T09:00:00Z",
};

const page = <h2>Classes</h2>;

beforeEach(() => {
  vi.clearAllMocks();
  gate.mockReturnValue({ pause: null });
  perms.mockReturnValue({ resolved: true, hasScope: (s: string) => s === "oversight" });
});

describe("DpaGate", () => {
  it("holds every page on the agreement when the school has not accepted it", async () => {
    dpaAcceptance.mockResolvedValue(null);
    const { container } = render(<DpaGate>{page}</DpaGate>);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/How we handle your students' data/),
    );
    expect(screen.queryByRole("heading", { name: "Classes" })).toBeNull();
    // There is no earlier step to go back to from inside the console.
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });

  it("opens the console once the school has accepted", async () => {
    dpaAcceptance.mockResolvedValue(ACCEPTED);
    render(<DpaGate>{page}</DpaGate>);
    await waitFor(() => expect(dpaAcceptance).toHaveBeenCalled());
    expect(screen.getByRole("heading", { name: "Classes" })).toBeInTheDocument();
  });

  it("fails open: a read that broke is not 'nothing was agreed'", async () => {
    dpaAcceptance.mockRejectedValue(new Error("500"));
    render(<DpaGate>{page}</DpaGate>);
    await waitFor(() => expect(dpaAcceptance).toHaveBeenCalled());
    expect(screen.getByRole("heading", { name: "Classes" })).toBeInTheDocument();
    expect(screen.queryByText(/How we handle your students' data/)).toBeNull();
  });

  it("lets an unconfirmed email come first, as the wizard does", async () => {
    gate.mockReturnValue({ pause: "email_unconfirmed" });
    dpaAcceptance.mockResolvedValue(null);
    render(<DpaGate>{page}</DpaGate>);
    await waitFor(() => expect(dpaAcceptance).toHaveBeenCalled());
    expect(screen.getByRole("heading", { name: "Classes" })).toBeInTheDocument();
  });

  it("tells an admin without oversight who can agree, rather than handing them the box", async () => {
    perms.mockReturnValue({ resolved: true, hasScope: () => false });
    dpaAcceptance.mockResolvedValue(null);
    const { container } = render(<DpaGate>{page}</DpaGate>);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/administrator with general oversight needs to/),
    );
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Classes" })).toBeNull();
  });
});
