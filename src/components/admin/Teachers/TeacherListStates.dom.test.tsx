import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TeachersView } from "./TeachersView";

/** A teacher whose classes read failed showed a loading bar for as long as the page was open. */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));
vi.mock("@/lib/api/teachers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/teachers")>();
  return {
    ...actual,
    teachersApi: {
      ...actual.teachersApi,
      list: async () => [
        { id: "t1", name: "Folake Adeyemi", email: "f@school.edu.ng", status: "active" },
      ],
    },
  };
});
vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return {
    ...actual,
    classesApi: { ...actual.classesApi, teacherClasses: () => Promise.reject(new Error("500")) },
  };
});

describe("the Classes column", () => {
  it("marks a failed read as unknown instead of loading forever", async () => {
    render(<TeachersView />);
    await waitFor(() =>
      expect(screen.getByTitle(/couldn't read this teacher's classes/)).toBeInTheDocument(),
    );
  });
});
