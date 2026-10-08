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

/**
 * T237. Every write sends all three categories - so saving over preferences it
 * never managed to read would overwrite the two untouched ones with defaults,
 * and switch off each category's email, which has no control on this screen.
 */
describe("the guards on a preferences write", () => {
  it("refuses to save over preferences it could not read", async () => {
    list.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useTeacherSettings());
    await waitFor(() => expect(result.current.failed).toBe(true));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.save();
    });

    expect(ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
    expect(result.current.saveState).toBe("failed");
  });

  it("sends back the email choice it read, which this screen has no switch for", async () => {
    update.mockResolvedValue({ preferences: ROWS, savedCount: 3, rejected: [] });
    await saving();

    const sent = update.mock.calls[0][0] as { category: string; email: boolean }[];
    expect(sent.find((r) => r.category === "messages")?.email).toBe(true);
    expect(sent.find((r) => r.category === "attention")?.email).toBe(false);
  });

  it("sends the in-app choice the teacher changed", async () => {
    update.mockResolvedValue({ preferences: ROWS, savedCount: 3, rejected: [] });
    const { result } = renderHook(() => useTeacherSettings());
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.set("reports", true));
    await act(async () => {
      await result.current.save();
    });

    const sent = update.mock.calls[0][0] as { category: string; inApp: boolean }[];
    expect(sent.find((r) => r.category === "reports")?.inApp).toBe(true);
  });
});
