import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";
import { visibleText } from "@/test/visibleText";
import { StudentDetailView } from "./StudentDetailView";

/**
 * Olayinka's TO-DO item 8 (24 Nov): "removed a student from nevo and this was
 * the writeup: We couldn't read Binta's guardians just now..."
 *
 * Remove deactivates the child, and the record reads again. The server keeps a
 * deactivated child's guardians to itself - `parent-links` answers 404 for one
 * (`_require_student` skips them) - so the card said a read had failed when it
 * had been refused on purpose: an untrue state. D07c's deactivated record
 * draws no guardians card, so none is drawn and none is asked for.
 */

const h = vi.hoisted(() => ({
  status: "active" as string,
  parentLinks: vi.fn(),
  deactivate: vi.fn(),
  restore: vi.fn(),
}));

vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return {
    ...actual,
    studentsApi: {
      ...actual.studentsApi,
      get: async () => ({
        id: "s1",
        firstName: "Binta",
        lastName: "Musa",
        loginIdentifier: "binta.m",
        email: null,
        status: h.status,
        ageBand: "11-14",
        classIds: [],
        firstUse: false,
        consent: { status: "confirmed" as const, actorId: null, actorName: null, timestamp: null, channel: null },
      }),
      parentLinks: (id: string) => h.parentLinks(id),
      deactivate: (id: string) => h.deactivate(id),
      restore: (id: string) => h.restore(id),
    },
  };
});
vi.mock("@/lib/api/classes", () => ({
  classesApi: { list: async () => [], classStudents: async () => [] },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const MOTHER = {
  id: "pl1", schoolId: "sch1", studentId: "s1", parentId: "p1", parentName: "Hauwa Musa",
  parentContact: "hauwa@example.com", contactMethod: "email", accountCreated: true,
};
// What the live route answers for a deactivated child.
const refusedForRemoved = () =>
  Promise.reject(new ApiError(404, "Not Found", { detail: "Student not found" }));

beforeEach(() => {
  h.status = "active";
  h.parentLinks.mockReset().mockImplementation(() =>
    h.status === "deactivated" ? refusedForRemoved() : Promise.resolve([MOTHER]),
  );
  h.deactivate.mockReset().mockImplementation(async () => {
    h.status = "deactivated";
  });
  h.restore.mockReset().mockImplementation(async () => {
    h.status = "active";
  });
});

describe("a removed child's record", () => {
  it("after Remove, says nothing about guardians - never a failed read", async () => {
    const { container } = render(<StudentDetailView studentId="s1" />);
    expect(await screen.findByText("Hauwa Musa")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Remove Binta from the school/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Deactivate Binta" }));

    await screen.findByRole("button", { name: "Restore this student" });
    const text = visibleText(container);
    expect(text).not.toMatch(/couldn.t read Binta.s guardians/);
    expect(text).not.toMatch(/Parent \/ guardian accounts/i);
    expect(screen.queryByText("Hauwa Musa")).toBeNull();
    // Asked once, for the active child; never again for the removed one.
    expect(h.parentLinks).toHaveBeenCalledTimes(1);
  });

  it("opened already removed, doesn't ask for its guardians at all", async () => {
    h.status = "deactivated";
    const { container } = render(<StudentDetailView studentId="s1" />);
    await screen.findByRole("button", { name: "Restore this student" });

    expect(h.parentLinks).not.toHaveBeenCalled();
    expect(visibleText(container)).not.toMatch(/guardian/i);
  });

  it("brings the guardians back when the child is restored", async () => {
    h.status = "deactivated";
    render(<StudentDetailView studentId="s1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Restore this student" }));

    expect(await screen.findByText("Hauwa Musa")).toBeInTheDocument();
  });

  it("takes any 404 from the guardians read as withheld, never as lost", async () => {
    h.parentLinks.mockImplementation(refusedForRemoved);
    const { container } = render(<StudentDetailView studentId="s1" />);
    await screen.findByRole("button", { name: /Remove Binta from the school/ });

    await waitFor(() => expect(h.parentLinks).toHaveBeenCalled());
    await waitFor(() => expect(visibleText(container)).not.toMatch(/Parent \/ guardian accounts/i));
    expect(visibleText(container)).not.toMatch(/couldn.t read Binta.s guardians/);
  });

  it("still says a read that really failed failed", async () => {
    h.parentLinks.mockRejectedValue(new ApiError(500, "down"));
    const { container } = render(<StudentDetailView studentId="s1" />);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/couldn.t read Binta.s guardians just now/),
    );
  });
});
