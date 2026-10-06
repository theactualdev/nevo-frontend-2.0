import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const { list } = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/lib/api/notifications", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/notifications")>();
  return { ...actual, notificationsApi: { ...actual.notificationsApi, list } };
});

import { useTeacherNotifications } from "./useTeacherNotifications";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * THE MARK ON EACH ROW, BY THE CONTRACT'S TYPES.
 *
 * Marks were guessed from words inside the type string, and the deployed
 * types contain almost none of them - so an attention summary wore the
 * "done" tick.
 */

const row = (id: string, type: string, category: string | null = null) => ({
  notificationId: id,
  recipientId: "t-1",
  recipientRole: "teacher",
  type,
  category,
  title: `Row ${id}`,
  description: "",
  read: false,
  createdAt: "2026-10-06T08:00:00Z",
  navigatesTo: null,
  archived: false,
  archivedAt: null,
});

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: "t-1",
    role: "teacher",
  });
  list.mockReset();
});

const kinds = async (rows: ReturnType<typeof row>[]) => {
  list.mockResolvedValue({ notifications: rows, unreadCount: rows.length });
  const { result } = renderHook(() => useTeacherNotifications());
  await waitFor(() => expect(result.current.notes).toHaveLength(rows.length));
  return result.current.notes.map((n) => n.kind);
};

describe("the mark on a notification", () => {
  it("is the flag for an attention summary", async () => {
    expect(await kinds([row("1", "attention_summary")])).toEqual(["flag"]);
  });

  it("is the speech mark for a reply", async () => {
    expect(await kinds([row("1", "teacher_replied")])).toEqual(["message"]);
  });

  it("is the class mark for a roster sync, either way it went", async () => {
    expect(
      await kinds([row("1", "roster_sync_completed"), row("2", "roster_sync_needs_attention")]),
    ).toEqual(["klass", "klass"]);
  });

  it("is the support mark for a PIN reset request and a consent action", async () => {
    expect(
      await kinds([row("1", "pin_reset_requested"), row("2", "consent_action_required")]),
    ).toEqual(["support", "support"]);
  });

  it("falls back to the row's category for a type it has no mark for", async () => {
    expect(
      await kinds([row("1", "something_new", "attention"), row("2", "something_else", "messages")]),
    ).toEqual(["flag", "message"]);
  });

  it("takes the neutral mark when neither says anything", async () => {
    expect(await kinds([row("1", "invoice_issued", "billing")])).toEqual(["done"]);
  });
});
