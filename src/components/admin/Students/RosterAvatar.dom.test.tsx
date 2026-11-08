import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AdminStudentRow } from "@/lib/api/students";
import { StudentsView } from "./StudentsView";

/**
 * THE ROSTER DRAWS EACH CHILD'S OWN LOOK (SCRUM-324; Lydia's 928cf30 build
 * list): their shape in their tone, beside their name, never their initials.
 * `GET /students` carries `avatarTone`, `avatarShape` and `avatarColourway`.
 */

vi.mock("@/context/PermissionContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/context/PermissionContext")>();
  const { createContext } = await import("react");
  return {
    ...actual,
    PermissionContext: createContext({
      scopes: ["roster"],
      resolved: true,
      status: "ready",
      refresh: () => {},
    } as never),
  };
});

const rows: AdminStudentRow[] = [
  {
    id: "s1",
    name: "Chisom Eze",
    loginIdentifier: "chisom",
    status: "active",
    ageBand: "11-14",
    consent: { status: "confirmed", actorId: null, actorName: null, timestamp: null, channel: null },
    avatarTone: null,
    avatarShape: "star",
    avatarColourway: "near_black",
  },
  {
    id: "s2",
    name: "Tunde Bello",
    loginIdentifier: "tunde",
    status: "active",
    ageBand: "11-14",
    consent: { status: "confirmed", actorId: null, actorName: null, timestamp: null, channel: null },
  },
];

vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return {
    ...actual,
    studentsApi: { ...actual.studentsApi, list: async () => rows, parentLinks: async () => [] },
  };
});
vi.mock("@/lib/api/classes", () => ({ classesApi: { list: async () => [] } }));
vi.mock("@/lib/api/ageChecks", () => ({ ageChecksApi: { held: async () => [] } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("the roster's avatars", () => {
  it("draws each child's own look beside their name, and no initials", async () => {
    const { container } = render(<StudentsView />);
    await screen.findByText("Chisom Eze");
    expect(container.querySelector('[data-avatar-look="star-near_black"]')).not.toBeNull();
    // A child with nothing chosen gets the nothing-chosen navy circle.
    expect(container.querySelector('[data-avatar-look="circle-navy"]')).not.toBeNull();
    expect(screen.queryByText("CE")).toBeNull();
    expect(screen.queryByText("TB")).toBeNull();
  });
});
