import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { StudentDetailView } from "./StudentDetailView";

/**
 * Removing a child from the school swallowed its failure completely.
 *
 * `.catch(() => undefined)`, under a dialog whose own words are "{firstName}
 * will stop having access, and their seat frees up." The DELETE fails, the
 * dialog returns to rest exactly as it does on success, and the admin believes
 * a child who still has access has lost it - and a seat they are still paying
 * for has been freed.
 */

const deactivate = vi.fn();

vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return {
    ...actual,
    studentsApi: {
      ...actual.studentsApi,
      get: async () => ({
        id: "s1",
        firstName: "Amara",
        lastName: "Okafor",
        loginIdentifier: "amara.o",
        email: null,
        status: "active",
        ageBand: "11-14",
        classIds: [],
        firstUse: false,
        consent: {
          status: "confirmed" as const,
          actorId: null,
          actorName: null,
          timestamp: null,
          channel: null,
        },
      }),
      parentLinks: async () => [],
      deactivate: () => deactivate(),
    },
  };
});
// The child's look comes from their class roster (#1055's useChildLook).
vi.mock("@/lib/api/classes", () => ({
  classesApi: { list: async () => [], classStudents: async () => [] },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

async function openDialog() {
  fireEvent.click(
    await screen.findByRole("button", { name: /Remove Amara from the school/i }),
  );
  return screen.findByRole("dialog");
}

describe("StudentDetailView deactivate", () => {
  it("does not let a refused removal look like a completed one", async () => {
    deactivate.mockRejectedValue(new Error("500"));

    render(<StudentDetailView studentId="s1" />);
    const dialog = await openDialog();
    fireEvent.click(screen.getByRole("button", { name: "Deactivate Amara" }));

    await waitFor(() =>
      expect(visibleText(dialog)).toMatch(
        /couldn't remove Amara from the school/i,
      ),
    );
    expect(visibleText(dialog)).toMatch(/nothing has changed/i);
    // Still open, still pressable - the admin's intent has not been served.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Deactivate Amara" }),
    ).toBeInTheDocument();
  });

  it("closes when the removal actually happened", async () => {
    deactivate.mockResolvedValue(undefined);

    render(<StudentDetailView studentId="s1" />);
    await openDialog();
    fireEvent.click(screen.getByRole("button", { name: "Deactivate Amara" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
