import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { Invitation, InvitationDeliveryStatus } from "@/lib/api/invites";
import { BulkImportModal } from "./BulkImportModal";

/**
 * "N invites sent" was printed over a navy tick for every created row, without
 * reading the field the backend returns precisely to say nobody was emailed.
 *
 * `email_not_configured` is defined in the contract as "the invitation exists
 * and its link is valid, but nobody was emailed, so the caller has to deliver
 * it another way". A school with no mail set up imports its staff on day one,
 * every invite is created, none is emailed, and the console reports success -
 * while the join tokens that were the only recovery arrive on that very
 * response and are dropped when this modal unmounts.
 */

const bulk = vi.fn();

vi.mock("@/lib/api/invites", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/invites")>();
  return {
    ...actual,
    invitesApi: { ...actual.invitesApi, bulk: (d: unknown) => bulk(d) },
  };
});

const created = (
  i: number,
  deliveryStatus: InvitationDeliveryStatus | null,
  token: string | null = `tok${i}`,
): Invitation => ({
  id: `inv${i}`,
  token,
  role: "teacher",
  email: `teacher${i}@school.edu.ng`,
  name: `Teacher ${i}`,
  status: "pending",
  expiresAt: "2026-10-01T00:00:00Z",
  consentStatus: null,
  deliveryStatus,
});

const CSV =
  "name,email,class\n" +
  "Folake Adeyemi,adeyemi.f@school.edu.ng,\n" +
  "Ngozi Okonkwo,okonkwo.n@school.edu.ng,\n";

/** Drive upload -> preview -> send, which is the only way to reach "done". */
async function importFile(container: HTMLElement) {
  const input = container.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  const file = new File([CSV], "staff.csv", { type: "text/csv" });
  Object.defineProperty(input, "files", { value: [file] });
  fireEvent.change(input);

  const send = await screen.findByRole("button", { name: /^Send 2 invites$/ });
  fireEvent.click(send);
}

function open() {
  return render(
    <BulkImportModal
      role="teacher"
      classes={[]}
      onClose={() => {}}
      onSent={() => {}}
    />,
  );
}

describe("BulkImportModal delivery", () => {
  it("does not say invites were sent when nobody was emailed", async () => {
    bulk.mockResolvedValue({
      created: [
        created(1, "email_not_configured"),
        created(2, "email_not_configured"),
      ],
      rejected: [],
    });

    const { container } = open();
    await importFile(container);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/2 invitations created/),
    );
    // The word that was false.
    expect(visibleText(container)).not.toMatch(/2 invites sent/);
    expect(visibleText(container)).toMatch(/No email went out/i);
  });

  it("hands over the links it used to throw away", async () => {
    bulk.mockResolvedValue({
      created: [
        created(1, "email_not_configured"),
        created(2, "email_not_configured"),
      ],
      rejected: [],
    });

    const { container } = open();
    await importFile(container);

    await waitFor(() => expect(visibleText(container)).toMatch(/2 links/));
    // The actual join addresses, per person, plus a copy-all.
    expect(visibleText(container)).toMatch(/\/join\/tok1/);
    expect(visibleText(container)).toMatch(/\/join\/tok2/);
    expect(visibleText(container)).toMatch(/Teacher 1/);
    expect(
      screen.getByRole("button", { name: "Copy all" }),
    ).toBeInTheDocument();
  });

  it("still says sent when the backend actually emailed them", async () => {
    bulk.mockResolvedValue({
      created: [created(1, "sent"), created(2, "sent")],
      rejected: [],
    });

    const { container } = open();
    await importFile(container);

    await waitFor(() => expect(visibleText(container)).toMatch(/2 invites sent/));
    expect(visibleText(container)).not.toMatch(/No email went out/i);
    expect(visibleText(container)).not.toMatch(/\/join\//);
  });

  it("counts a partial failure without generalising it", async () => {
    bulk.mockResolvedValue({
      created: [created(1, "sent"), created(2, "email_not_configured")],
      rejected: [],
    });

    const { container } = open();
    await importFile(container);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/2 invitations created/),
    );
    expect(visibleText(container)).toMatch(/No email went out for 1 of them/);
    // Only the undelivered one's link is handed over.
    expect(visibleText(container)).toMatch(/\/join\/tok2/);
    expect(visibleText(container)).not.toMatch(/\/join\/tok1/);
  });

  it("admits a missing token rather than inventing a link", async () => {
    bulk.mockResolvedValue({
      created: [created(1, "email_not_configured", null)],
      rejected: [],
    });

    const { container } = open();
    await importFile(container);

    await waitFor(() => expect(visibleText(container)).toMatch(/No email went out/i));
    expect(visibleText(container)).not.toMatch(/\/join\/null/);
    expect(visibleText(container)).toMatch(/Resend from the invitations list/i);
  });
  it("does not report invites as sent when the response carried no status", async () => {
    // `allDelivered` asked "is none of them known-manual?", so a null status
    // took the confident arm and printed "2 invites sent".
    bulk.mockResolvedValue({
      created: [created(1, null), created(2, null)],
      rejected: [],
    });

    const { container } = open();
    await importFile(container);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/2 invitations created/),
    );
    expect(visibleText(container)).not.toMatch(/2 invites sent/);
    expect(visibleText(container)).toMatch(/couldn't confirm an email/i);
    // The links are handed over for these too - not knowing is reason enough.
    expect(visibleText(container)).toMatch(/\/join\/tok1/);
  });

  it("tells a certain non-delivery apart from an unknown one", async () => {
    bulk.mockResolvedValue({
      created: [created(1, "email_not_configured"), created(2, null)],
      rejected: [],
    });

    const { container } = open();
    await importFile(container);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/No email went out for 1 of them/),
    );
    expect(visibleText(container)).toMatch(/couldn't confirm one for 1 more/i);
  });
});

describe("BulkImportModal server-rejected rows", () => {
  it("lists each rejected row once, with the server's own row number", async () => {
    /*
     * Every server-rejected row used to appear twice: once as "Row N" in the
     * rejected list and again as "Row N+2" in a second violet list below - the
     * base-guess `RejectedRows` refuses to make. One of the two was always the
     * wrong line in the admin's spreadsheet.
     */
    bulk.mockResolvedValue({
      created: [created(1, "sent")],
      rejected: [{ row: 5, reason: "That email is already invited." }],
    });

    const { container } = open();
    await importFile(container);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/That email is already invited\./),
    );
    const text = visibleText(container);
    expect(text.split("That email is already invited.").length - 1).toBe(1);
    expect(text).toMatch(/Row 5\b/);
    expect(text).not.toMatch(/Row 7\b/);
  });
});
