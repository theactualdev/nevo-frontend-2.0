import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AdminClass } from "@/lib/api/classes";
import type { SchoolSubject } from "@/lib/api/subjects";
import { BulkClassSheet } from "./BulkClassSheet";

/**
 * Backlog 25: D05 draws "Download the class template" beside "Subjects for
 * each class" in Add several. It is the server's own classes file (GET
 * /onboarding/templates/classes), saved as the roster importer saves its own,
 * in the importer's words while it fetches and if it fails.
 */

const list = vi.fn();
const subjects = vi.fn();
const template = vi.fn();

vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return { ...actual, classesApi: { ...actual.classesApi, list: () => list() } };
});
vi.mock("@/lib/api/subjects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/subjects")>();
  return { ...actual, subjectsApi: { ...actual.subjectsApi, list: () => subjects(), canonical: async () => [] } };
});
vi.mock("@/lib/api/onboarding", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/onboarding")>();
  return { ...actual, onboardingApi: { ...actual.onboardingApi, template: (name: string) => template(name) } };
});

const cls = (name: string, yearGroup: string): AdminClass =>
  ({
    id: name,
    name,
    code: null,
    yearGroup,
    source: null,
    subjects: [],
    studentCount: 0,
    section: null,
    academicSession: "2026/27",
    capacity: null,
    teacherCount: 0,
    teachers: [],
    archivedAt: null,
  }) as AdminClass;

const subject = (name: string): SchoolSubject => ({
  id: name,
  name,
  displayName: name,
  origin: "canonical",
  reviewState: "approved",
});

let saved: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  saved = [];
  list.mockResolvedValue([cls("JSS 1A", "jss1")]);
  subjects.mockResolvedValue(["Mathematics"].map(subject));
  // jsdom has no object URLs; record what would have been saved.
  URL.createObjectURL = vi.fn(() => "blob:class-template");
  URL.revokeObjectURL = vi.fn();
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    saved.push(this.download);
  };
});

async function reachSubjects() {
  render(<BulkClassSheet onClose={() => {}} onCreated={() => {}} />);
  const jss1 = await screen.findByRole("group", { name: "JSS 1" });
  fireEvent.click(within(jss1).getByRole("button", { name: "B" }));
  await screen.findByText(/Subjects for each class/);
}

describe("Add several's class template (backlog 25)", () => {
  it("downloads the server's classes file from beside Subjects for each class", async () => {
    template.mockResolvedValue(new Blob(["class_name\n"], { type: "text/csv" }));
    await reachSubjects();
    fireEvent.click(screen.getByRole("button", { name: "Download the class template" }));
    await waitFor(() => expect(saved).toEqual(["nevo-classes.csv"]));
    expect(template).toHaveBeenCalledWith("classes");
  });

  it("says so in the importer's words when it can't, and stays pressable", async () => {
    template.mockRejectedValueOnce(new Error("500"));
    await reachSubjects();
    fireEvent.click(screen.getByRole("button", { name: "Download the class template" }));
    expect(await screen.findByText("That didn’t download. Try again in a moment.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download the class template" })).toBeEnabled();
  });
});
