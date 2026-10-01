import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { Invitation } from "@/lib/api/invites";
import { InvitationsView } from "./InvitationsView";

/**
 * D19 draws the three counters as this screen's primary filter control, and
 * they were three numbers nobody could press. The table beneath them had no
 * pagination at all, on a screen whose own bulk import accepts five hundred
 * rows in one go.
 */

const list = vi.fn();

vi.mock("@/lib/api/invites", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/invites")>();
  return {
    ...actual,
    invitesApi: { ...actual.invitesApi, list: () => list() },
  };
});
vi.mock("@/lib/api/classes", () => ({ classesApi: { list: async () => [] } }));

const invite = (over: Partial<Invitation> = {}): Invitation => ({
  id: Math.random().toString(36).slice(2),
  token: null,
  role: "student",
  email: "amara@school.edu.ng",
  name: "Amara Okafor",
  status: "pending",
  expiresAt: "2099-01-01T00:00:00Z", // far off: InvitationsView judges expiry against today
  consentStatus: null,
  deliveryStatus: "sent",
  ...over,
});

const many = (n: number, over: Partial<Invitation> = {}) =>
  Array.from({ length: n }, (_, i) =>
    invite({ name: `Student ${i + 1}`, ...over }),
  );

function tile(container: HTMLElement, label: string): HTMLElement {
  const hit = Array.from(container.querySelectorAll("button")).find((b) =>
    (b.textContent ?? "").includes(label),
  );
  if (!hit) throw new Error(`no ${label} tile`);
  return hit;
}

function studentTab(container: HTMLElement) {
  const tab = Array.from(container.querySelectorAll('[role="tab"]')).find(
    (t) => t.textContent === "Students",
  )!;
  fireEvent.click(tab);
}

describe("the status counters", () => {
  it("count the frame's three, not a total", async () => {
    list.mockResolvedValue([
      invite({ role: "teacher" }),
      invite({ role: "teacher", status: "joined" }),
      invite({ role: "teacher", status: "expired" }),
    ]);
    const { container } = render(<InvitationsView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Pending/));
    const text = visibleText(container);
    expect(text).toMatch(/Expired/);
    expect(text).not.toMatch(/\bInvited\b/);
  });

  it("filter the table when pressed, and clear when pressed again", async () => {
    list.mockResolvedValue([
      invite({ role: "teacher", name: "Still waiting" }),
      invite({ role: "teacher", name: "Already here", status: "joined" }),
    ]);
    const { container } = render(<InvitationsView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Still waiting/));

    fireEvent.click(tile(container, "Joined"));
    await waitFor(() =>
      expect(visibleText(container)).not.toMatch(/Still waiting/),
    );
    expect(visibleText(container)).toMatch(/Already here/);

    fireEvent.click(tile(container, "Joined"));
    await waitFor(() => expect(visibleText(container)).toMatch(/Still waiting/));
  });
});

describe("the consent filter", () => {
  it("finds a withdrawn family whose invitation already joined", async () => {
    // A status-only filter can never surface these: the invitation is joined,
    // and it is the PARENT's decision the admin is looking for.
    list.mockResolvedValue([
      invite({ name: "Amara Okafor", status: "joined", consentStatus: "withdrawn" }),
      invite({ name: "Chidi Eze", status: "joined", consentStatus: "confirmed" }),
    ]);
    const { container } = render(<InvitationsView />);
    // Teachers is the landing tab and every row here is a student, so the
    // first thing to settle is that tab's empty state.
    await waitFor(() => expect(visibleText(container)).toMatch(/No invites yet/));
    studentTab(container);
    await waitFor(() => expect(visibleText(container)).toMatch(/Amara Okafor/));

    const select = container.querySelector("select")!;
    fireEvent.change(select, { target: { value: "consent_withdrawn" } });

    await waitFor(() => expect(visibleText(container)).not.toMatch(/Chidi Eze/));
    expect(visibleText(container)).toMatch(/Amara Okafor/);
  });

  it("is not offered on the teacher tab, which has no parent behind it", async () => {
    list.mockResolvedValue([invite({ role: "teacher" })]);
    const { container } = render(<InvitationsView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Pending/));
    const options = Array.from(container.querySelectorAll("option")).map(
      (o) => o.value,
    );
    expect(options).not.toContain("consent_withdrawn");
  });
});

describe("pagination", () => {
  it("shows one page of twenty, and says how many there are", async () => {
    list.mockResolvedValue(many(47, { role: "teacher" }));
    const { container } = render(<InvitationsView />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Showing 1-20 of 47/),
    );
    const text = visibleText(container);
    expect(text).toMatch(/Student 20/);
    expect(text).not.toMatch(/Student 21\b/);
    expect(text).toMatch(/Page 1 of 3/);
  });

  it("moves through the pages", async () => {
    list.mockResolvedValue(many(47, { role: "teacher" }));
    const { container } = render(<InvitationsView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Page 1 of 3/));

    const next = container.querySelector('[aria-label="Next page"]')!;
    fireEvent.click(next);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Showing 21-40 of 47/),
    );
    expect(visibleText(container)).toMatch(/Student 21\b/);
  });

  it("does not strand a reader on a page a filter has removed", async () => {
    list.mockResolvedValue([
      ...many(40, { role: "teacher" }),
      invite({ role: "teacher", name: "The only joiner", status: "joined" }),
    ]);
    const { container } = render(<InvitationsView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Page 1 of 3/));

    fireEvent.click(container.querySelector('[aria-label="Next page"]')!);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Showing 21-40 of 41/),
    );

    fireEvent.click(tile(container, "Joined"));
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/The only joiner/),
    );
    expect(visibleText(container)).toMatch(/Showing 1-1 of 1/);
  });

  it("stays out of the way of a list that fits", async () => {
    list.mockResolvedValue(many(3, { role: "teacher" }));
    const { container } = render(<InvitationsView />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Showing 1-3 of 3/),
    );
    expect(visibleText(container)).not.toMatch(/Page 1 of/);
  });
});
