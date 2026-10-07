import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { Notification } from "@/lib/api/notifications";
import { NotificationRow } from "./NotificationRow";
import { NotificationPreferences } from "./NotificationPreferences";

/**
 * Two small truths about notifications.
 *
 * A row's label is its CATEGORY's name (backend B34, 1 Oct) or nothing. It
 * used to print the raw type, which could put an engine event name such as
 * "MODALITY SHIFT" in front of an admin.
 *
 * A preference the server answers with `rejected` did not save, whatever the
 * status code says, so it must not flash "Saved".
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const list = vi.fn();
const update = vi.fn();
vi.mock("@/lib/api/settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/settings")>();
  return {
    ...actual,
    notificationPrefsApi: {
      ...actual.notificationPrefsApi,
      list: () => list(),
      update: (rows: unknown) => update(rows),
    },
  };
});

const note = (over: Partial<Notification> = {}): Notification => ({
  notificationId: "n1",
  recipientId: "u1",
  recipientRole: "senco_admin",
  type: "modality_shift",
  category: null,
  title: "Something to look at",
  description: "",
  read: false,
  createdAt: "2026-10-06T09:00:00Z",
  navigatesTo: null,
  archived: false,
  archivedAt: null,
  ...over,
} as Notification);

const row = (n: Notification) =>
  render(
    <NotificationRow
      notification={n}
      archived={false}
      now={Date.parse("2026-10-07T09:00:00Z")}
      onRead={vi.fn()}
      onArchive={vi.fn()}
      onRestore={vi.fn()}
    />,
  );

beforeEach(() => {
  vi.clearAllMocks();
  list.mockResolvedValue([]);
});

describe("a notification row's label", () => {
  it("is the category's own name", () => {
    const { container } = row(note({ type: "consent_action_required", category: "consent" }));
    expect(visibleText(container)).toMatch(/Consent/);
    expect(visibleText(container)).not.toMatch(/consent action required/i);
  });

  it("is absent when there is no category - never the raw type", () => {
    const { container } = row(note({ type: "modality_shift", category: null }));
    expect(visibleText(container)).not.toMatch(/modality/i);
  });

  it("is absent for a category this console does not show", () => {
    const { container } = row(note({ type: "modality_shift", category: "engine_internal" }));
    expect(visibleText(container)).not.toMatch(/engine internal|modality/i);
  });
});

describe("a preference the server rejects", () => {
  it("does not say Saved, puts the switch back, and says it didn't save", async () => {
    update.mockResolvedValue({ preferences: [], savedCount: 0, rejected: [{ category: "billing" }] });
    const { container } = render(<NotificationPreferences scopes={["oversight", "billing"]} />);
    const sw = await screen.findByRole("switch", { name: "Billing in Nevo" });
    expect(sw).toHaveAttribute("aria-checked", "true");
    fireEvent.click(sw);
    await waitFor(() => expect(visibleText(container)).toMatch(/didn.t save, so nothing has changed/));
    expect(screen.getByRole("switch", { name: "Billing in Nevo" })).toHaveAttribute("aria-checked", "true");
    expect(visibleText(container)).not.toMatch(/\bSaved\b/);
  });

  it("still says Saved when nothing was rejected", async () => {
    update.mockResolvedValue({ preferences: [], savedCount: 1, rejected: [] });
    const { container } = render(<NotificationPreferences scopes={["oversight", "billing"]} />);
    fireEvent.click(await screen.findByRole("switch", { name: "Billing in Nevo" }));
    await waitFor(() => expect(visibleText(container)).toMatch(/\bSaved\b/));
  });
});
