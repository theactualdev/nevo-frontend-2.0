import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({ allOpen: vi.fn() }));
vi.mock("@/lib/api/escalations", () => ({ escalationsApi: { allOpen: h.allOpen } }));
vi.mock("@/lib/auth/session", () => ({ getToken: () => "tok" }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => true }));

import { useEscalated } from "./useEscalated";

/**
 * Flagged is an OPEN escalation, scoped by the SERVER (backlog item 7): a
 * holder of Learning Support would otherwise get the whole school's list, and
 * filtering that on the device is the line the T2/L9 ruling draws.
 */

const row = (studentId: string) => ({ id: `e-${studentId}`, studentId });

beforeEach(() => {
  h.allOpen.mockReset();
});

describe("useEscalated", () => {
  it("asks the server for one class's open escalations", async () => {
    h.allOpen.mockResolvedValue({ open: [row("s-1"), row("s-2")], complete: true });
    const { result } = renderHook(() => useEscalated({ classId: "c-1" }));

    await waitFor(() => expect(result.current.known).toBe(true));
    expect(h.allOpen).toHaveBeenCalledWith(10, { classId: "c-1" });
    expect([...result.current.students].sort()).toEqual(["s-1", "s-2"]);
  });

  it("asks for one child's when it is given one", async () => {
    h.allOpen.mockResolvedValue({ open: [row("s-9")], complete: true });
    const { result } = renderHook(() => useEscalated({ studentId: "s-9" }));

    await waitFor(() => expect(result.current.students.has("s-9")).toBe(true));
    expect(h.allOpen).toHaveBeenCalledWith(10, { studentId: "s-9" });
  });

  it("knows nothing over a read that stopped short", async () => {
    h.allOpen.mockResolvedValue({ open: [row("s-1")], complete: false });
    const { result } = renderHook(() => useEscalated({ classId: "c-1" }));

    await waitFor(() => expect(result.current.students.has("s-1")).toBe(true));
    expect(result.current.known).toBe(false);
  });
});
