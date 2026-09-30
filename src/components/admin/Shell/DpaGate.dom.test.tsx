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
      get: () => getSchool(),
    },
  };
});

const getSchool = vi.fn();
const SCHOOL = { name: "Brightgate Academy", profile: {} };

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
  getSchool.mockResolvedValue(SCHOOL);
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
    expect(await screen.findByRole("heading", { name: "Classes" })).toBeInTheDocument();
  });

  it("fails open: a read that broke is not 'nothing was agreed'", async () => {
    dpaAcceptance.mockRejectedValue(new Error("500"));
    render(<DpaGate>{page}</DpaGate>);
    await waitFor(() => expect(dpaAcceptance).toHaveBeenCalled());
    expect(await screen.findByRole("heading", { name: "Classes" })).toBeInTheDocument();
    expect(screen.queryByText(/How we handle your students' data/)).toBeNull();
  });

  it("lets an unconfirmed email come first, as the wizard does", async () => {
    gate.mockReturnValue({ pause: "email_unconfirmed" });
    dpaAcceptance.mockResolvedValue(null);
    render(<DpaGate>{page}</DpaGate>);
    await waitFor(() => expect(dpaAcceptance).toHaveBeenCalled());
    expect(await screen.findByRole("heading", { name: "Classes" })).toBeInTheDocument();
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

describe("DpaGate and schools that agreed before the typed record", () => {
  it("counts an acceptance the wizard recorded the old way", async () => {
    /*
     * Before `dpa-acceptance` existed the wizard wrote it into
     * profile.onboarding. Reading the new table alone locked the end-to-end
     * school out of its own console - and would have done the same to every
     * school that agreed before the migration.
     */
    dpaAcceptance.mockResolvedValue(null);
    getSchool.mockResolvedValue({
      ...SCHOOL,
      profile: { onboarding: { dpaVersion: "0.9-draft", dpaAcceptedAt: "2026-08-30T10:00:00Z" } },
    });
    render(<DpaGate>{page}</DpaGate>);

    await waitFor(() => expect(getSchool).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Classes" })).toBeInTheDocument(),
    );
    expect(screen.queryByText(/How we handle your students' data/)).toBeNull();
  });

  it("fails open when the school cannot be read to check", async () => {
    dpaAcceptance.mockResolvedValue(null);
    getSchool.mockRejectedValue(new Error("500"));
    render(<DpaGate>{page}</DpaGate>);

    await waitFor(() => expect(getSchool).toHaveBeenCalled());
    expect(await screen.findByRole("heading", { name: "Classes" })).toBeInTheDocument();
  });
});

describe("DpaGate while it is still checking", () => {
  it("shows no page until it knows, so a school without an agreement never glimpses one", () => {
    // A read that never answers: the first paint.
    dpaAcceptance.mockReturnValue(new Promise(() => {}));
    render(<DpaGate>{page}</DpaGate>);
    expect(screen.queryByRole("heading", { name: "Classes" })).toBeNull();
  });
});
