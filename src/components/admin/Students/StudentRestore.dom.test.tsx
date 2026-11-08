import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";
import { StudentDetailView } from "./StudentDetailView";

/**
 * A refused restore said "We couldn't restore Amara just now... Try again in a
 * moment" whatever the server answered - including the two refusals no retry
 * can change (the 2 Nov audit). Those now say what the server said.
 */

const restore = vi.fn();

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
        status: "deactivated",
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
      restore: () => restore(),
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

// Braced: an arrow that returns the mock has vitest call it as cleanup.
beforeEach(() => {
  restore.mockReset();
});

const press = async () =>
  fireEvent.click(await screen.findByRole("button", { name: "Restore this student" }));

describe("restoring a removed student", () => {
  it("says the records are erased, in the server's words, when they are", async () => {
    restore.mockRejectedValue(
      new ApiError(410, "gone", {
        detail: {
          code: "learner_retention_purged",
          message: "This learner's records have been erased and cannot be restored.",
        },
      }),
    );
    render(<StudentDetailView studentId="s1" />);
    await press();
    expect(
      await screen.findByText("This learner's records have been erased and cannot be restored."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Try again in a moment/)).toBeNull();
  });

  it("says consent has to be renewed first, in the server's words", async () => {
    restore.mockRejectedValue(
      new ApiError(409, "conflict", {
        detail: {
          code: "consent_withdrawn",
          message: "Processing consent must be renewed before restoring access.",
        },
      }),
    );
    render(<StudentDetailView studentId="s1" />);
    await press();
    expect(
      await screen.findByText("Processing consent must be renewed before restoring access."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Try again in a moment/)).toBeNull();
  });

  it("keeps the try-again line for a failure a retry could fix", async () => {
    restore.mockRejectedValue(new ApiError(503, "down"));
    render(<StudentDetailView studentId="s1" />);
    await press();
    expect(await screen.findByText(/We couldn.t restore Amara just now/)).toBeInTheDocument();
  });
});
