import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const { list, update } = vi.hoisted(() => ({ list: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/api/settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/settings")>();
  return { ...actual, notificationPrefsApi: { list, update } };
});

import { useTeacherSettings } from "./useTeacherSettings";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * T195. The preferences write answers with what it refused, "so a settings
 * screen can show what landed" - and the screen said "Saved" over any 2xx.
 */

const ROWS = [
  { category: "attention", inApp: true, email: false },
  { category: "messages", inApp: true, email: true },
  { category: "reports", inApp: false, email: false },
];

beforeEach(() => {
  clearSession();
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: "t-1",
    role: "teacher" as never,
  });
  list.mockReset().mockResolvedValue(ROWS);
  update.mockReset();
});

const saving = async () => {
  const { result } = renderHook(() => useTeacherSettings());
  await waitFor(() => expect(result.current.ready).toBe(true));
  let ok: boolean | undefined;
  await act(async () => {
    ok = await result.current.save();
  });
  return { result, ok };
};

describe("saving notification preferences", () => {
  it("says Saved when everything was taken", async () => {
    update.mockResolvedValue({ preferences: ROWS, savedCount: 3, rejected: [] });
    const { result, ok } = await saving();

    expect(ok).toBe(true);
    expect(result.current.saveState).toBe("saved");
  });

  it("does not say Saved when the server refused some of it", async () => {
    update.mockResolvedValue({
      preferences: ROWS.slice(0, 2),
      savedCount: 2,
      rejected: [{ category: "reports", reason: "unknown_category" }],
    });
    const { result, ok } = await saving();

    expect(ok).toBe(false);
    expect(result.current.saveState).toBe("failed");
  });

  it("still says Saved for a deployment that reports nothing refused", async () => {
    update.mockResolvedValue({ preferences: ROWS, savedCount: 3 });
    const { result } = await saving();

    expect(result.current.saveState).toBe("saved");
  });
});
