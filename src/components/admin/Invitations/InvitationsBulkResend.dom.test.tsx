import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";
import type { Invitation } from "@/lib/api/invites";
import { visibleText } from "@/test/visibleText";
import { InvitationsView } from "./InvitationsView";

/**
 * Olayinka's TO-DO item 9 (24 Nov): "should be able to mass resend invites in
 * the Invitations tab to teachers." No bulk route exists, and D19 draws no
 * selection, so it is D07's drawn bulk pattern over the row's own resend.
 */

const h = vi.hoisted(() => ({ list: vi.fn(), resend: vi.fn() }));
vi.mock("@/lib/api/invites", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/invites")>();
  return {
    ...actual,
    invitesApi: {
      ...actual.invitesApi,
      list: () => h.list(),
      resend: (id: string) => h.resend(id),
    },
  };
});
vi.mock("@/lib/api/classes", () => ({ classesApi: { list: async () => [] } }));

const invite = (name: string, status: string, expiresAt = "2099-01-01T00:00:00Z"): Invitation => ({
  id: name,
  token: null,
  role: "teacher",
  email: `${name.split(" ")[0].toLowerCase()}@school.edu.ng`,
  name,
  status,
  expiresAt,
  consentStatus: null,
  deliveryStatus: "sent",
});

const ROWS = [
  invite("Amaka Obi", "pending"),
  invite("Bayo Ade", "expired", "2020-01-01T00:00:00Z"),
  invite("Chidi Eze", "revoked"),
  invite("Dayo Ola", "accepted"),
];

const answered = (id: string, deliveryStatus: string) => ({
  ...ROWS.find((r) => r.id === id)!,
  status: "pending",
  token: `tok-${id}`,
  expiresAt: "2099-02-01T00:00:00Z",
  deliveryStatus,
});

beforeEach(() => {
  h.list.mockReset().mockResolvedValue(ROWS);
  h.resend.mockReset().mockImplementation(async (id: string) => answered(id, "sent"));
});

async function ready() {
  render(<InvitationsView />);
  await waitFor(() => expect(screen.getByText("Dayo Ola")).toBeInTheDocument());
}

describe("mass resend", () => {
  it("offers a tick only where Resend is offered", async () => {
    await ready();
    expect(screen.getByRole("checkbox", { name: "Select Amaka Obi" })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: "Select Bayo Ade" })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: "Select Chidi Eze" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Select Dayo Ola" })).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: "Select every invite that can be resent" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select Chidi Eze" })).not.toBeChecked();
  });

  it("confirms who, resends each in turn, and says what it came to in one line", async () => {
    await ready();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Amaka Obi" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Bayo Ade" }));
    fireEvent.click(screen.getByRole("button", { name: "Resend invites" }));

    const dialog = await screen.findByRole("dialog");
    expect(visibleText(dialog)).toMatch(/Resend 2 invites\?/);
    expect(within(dialog).getByText("Amaka Obi")).toBeInTheDocument();
    expect(within(dialog).getByText("Bayo Ade")).toBeInTheDocument();
    expect(h.resend).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Resend" }));
    await waitFor(() => expect(screen.getByText("2 invites resent.")).toBeInTheDocument());
    expect(h.resend.mock.calls.map((c) => c[0])).toEqual(["Amaka Obi", "Bayo Ade"]);
    // Done: nothing still ticked, and no bar.
    expect(screen.queryByText(/selected$/)).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Select Amaka Obi" })).not.toBeChecked();
  });

  it("accounts for every answer, the ones that didn't go included", async () => {
    h.resend.mockImplementation(async (id: string) => {
      if (id === "Bayo Ade") throw new ApiError(500, "down");
      return answered(id, "email_not_configured");
    });
    await ready();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select every invite that can be resent" }));
    fireEvent.click(screen.getByRole("button", { name: "Resend invites" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Resend" }));

    await waitFor(() =>
      expect(screen.getByText("No email went out for 1 - their link is in their row.")).toBeInTheDocument(),
    );
    expect(
      screen.getByText("1 didn’t resend, and nothing changed for those. Try them again in a moment."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/invites? resent\./)).toBeNull();
    // The resent row now carries its link to hand over.
    const amaka = screen.getByText("Amaka Obi").closest("div.px-6") as HTMLElement;
    expect(within(amaka).getByRole("button", { name: "Copy link" })).toBeInTheDocument();
  });
});
