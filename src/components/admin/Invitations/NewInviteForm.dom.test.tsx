import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { chooseOption, optionNames } from "@/test/nevoSelect";
import { ApiError } from "@/lib/api/client";
import { NewInviteModal, invitedClasses } from "./NewInviteModal";

/**
 * D19's Invite a teacher, in full (backlog 16; T15, live 21 Nov; Lydia 19 Nov
 * L25): first and last name as two fields, a required email, and "Classes and
 * subjects" - each class with the subjects the teacher takes to it, sent as
 * `classes: [{classId, subjectId}]` and attached when the teacher accepts.
 * A subject is required per class (SCRUM-194). No "(optional)" (SCRUM-207),
 * and the frame's "N things still to fill in" until none are left.
 */

const create = vi.fn();
vi.mock("@/lib/api/invites", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/invites")>();
  return { ...actual, invitesApi: { ...actual.invitesApi, create: (d: unknown) => create(d) } };
});
const subject = (id: string, name: string) => ({
  id,
  name,
  displayName: name,
  origin: "canonical",
  reviewState: "approved",
});
const subjects = vi.fn();
vi.mock("@/lib/api/subjects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/subjects")>();
  return { ...actual, subjectsApi: { ...actual.subjectsApi, list: () => subjects() } };
});

const CLASSES = [
  { id: "c1", name: "JSS 2A", subjects: ["Mathematics", "Basic Science"], archivedAt: null },
  { id: "c2", name: "JSS 2B", subjects: ["mathematics"], archivedAt: null },
  { id: "c3", name: "Old 1A", subjects: ["Mathematics"], archivedAt: "2026-07-01T00:00:00Z" },
] as never[];

beforeEach(() => {
  vi.clearAllMocks();
  subjects.mockResolvedValue([subject("s-maths", "Mathematics"), subject("s-sci", "Basic Science")]);
  create.mockResolvedValue({ id: "i1", token: "tok", email: "f@school.edu.ng", name: "Folake Adeyemi", deliveryStatus: "sent" });
});

const open = () => render(<NewInviteModal classes={CLASSES} onClose={vi.fn()} onSent={vi.fn()} />);
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const rows = (c: HTMLElement) => [...c.querySelectorAll("[data-assign]")] as HTMLElement[];

describe("Invite a teacher (D19, T15)", () => {
  it("asks for a first and a last name, an email, and classes with their subjects - nothing marked optional", () => {
    const { container } = open();
    expect(screen.getByLabelText("First name")).toBeInTheDocument();
    expect(screen.getByLabelText("Last name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).toBeNull();
    expect(screen.getByRole("group", { name: "Classes and subjects" })).toBeInTheDocument();
    expect(visibleText(container)).not.toMatch(/optional/i);
  });

  it("offers the subjects the chosen class takes, in D19's words, and never an archived class", async () => {
    const { container } = open();
    // "Select a class" is the prompt, never a row (NevoSelect).
    expect(screen.getByLabelText("Class")).toHaveTextContent("Select a class");
    expect(optionNames(screen.getByLabelText("Class"))).toEqual(["JSS 2A", "JSS 2B"]);
    await chooseOption(screen.getByLabelText("Class"), "JSS 2A");
    expect(visibleText(container)).toMatch(/Subjects JSS 2A offers\. Tick the ones they take\./);
    const group = screen.getByRole("group", { name: "Subjects JSS 2A offers" });
    await within(group).findByRole("checkbox", { name: "Mathematics" });
    expect(within(group).getAllByRole("checkbox").map((b) => b.textContent)).toEqual([
      "Mathematics",
      "Basic Science",
    ]);
  });

  it("counts what is still to fill in - a class with no subject ticked among it - and holds Send until it's nothing", async () => {
    const { container } = open();
    expect(visibleText(container)).toMatch(/4 things still to fill in/);
    expect(screen.getByRole("button", { name: "Send invite" })).toBeDisabled();
    type("First name", "Folake");
    type("Last name", "Adeyemi");
    type("Email", "not an email");
    expect(visibleText(container)).toMatch(/2 things still to fill in/);
    type("Email", "f@school.edu.ng");
    expect(visibleText(container)).toMatch(/1 thing still to fill in/);
    await chooseOption(screen.getByLabelText("Class"), "JSS 2A");
    expect(visibleText(container)).toMatch(/1 thing still to fill in/);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Mathematics" }));
    expect(container.querySelector("[data-missing]")).toBeNull();
    expect(screen.getByRole("button", { name: "Send invite" })).not.toBeDisabled();
  });

  it("sends the names as typed and every class with each ticked subject - never the legacy single class", async () => {
    const { container } = open();
    type("First name", "Mary Ann");
    type("Last name", "Okafor-Bello");
    type("Email", " m@school.edu.ng ");
    await chooseOption(screen.getByLabelText("Class"), "JSS 2A");
    fireEvent.click(await screen.findByRole("checkbox", { name: "Mathematics" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Basic Science" }));
    fireEvent.click(screen.getByRole("button", { name: /Add another class/ }));
    const second = rows(container)[1];
    // A class chosen above is not offered again.
    const select2 = within(second).getByLabelText("Class");
    expect(optionNames(select2)).toEqual(["JSS 2B"]);
    await chooseOption(select2, "JSS 2B");
    // JSS 2B writes it "mathematics": the same school subject, by any spelling.
    fireEvent.click(await within(second).findByRole("checkbox", { name: "Mathematics" }));
    fireEvent.click(screen.getByRole("button", { name: "Send invite" }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    const body = create.mock.calls[0][0];
    expect(body).toEqual({
      role: "teacher",
      firstName: "Mary Ann",
      lastName: "Okafor-Bello",
      email: "m@school.edu.ng",
      classes: [
        { classId: "c1", subjectId: "s-maths" },
        { classId: "c1", subjectId: "s-sci" },
        { classId: "c2", subjectId: "s-maths" },
      ],
    });
    expect(body).not.toHaveProperty("classId");
  });

  it("removes a class row, but never the last one", () => {
    const { container } = open();
    expect(screen.queryByRole("button", { name: "Remove this class" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Add another class/ }));
    expect(rows(container)).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "Remove this class" })[1]);
    expect(rows(container)).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Remove this class" })).toBeNull();
  });

  it("takes a class that has gone since out of the form, without the server's words", async () => {
    create.mockRejectedValueOnce(
      new ApiError(404, "Class not found", { detail: { code: "class_not_found", classId: "c1" } }),
    );
    const { container } = open();
    type("First name", "Folake");
    type("Last name", "Adeyemi");
    type("Email", "f@school.edu.ng");
    await chooseOption(screen.getByLabelText("Class"), "JSS 2A");
    fireEvent.click(await screen.findByRole("checkbox", { name: "Mathematics" }));
    fireEvent.click(screen.getByRole("button", { name: "Send invite" }));
    await waitFor(() => expect(visibleText(container)).toMatch(/1 thing still to fill in/));
    expect(screen.getByLabelText("Class")).toHaveTextContent("Select a class");
    expect(visibleText(container)).not.toMatch(/Class not found/);
  });

  it("drops a subject that has gone since and reads the subjects again", async () => {
    create.mockRejectedValueOnce(
      new ApiError(404, "Subject not found", { detail: { code: "subject_not_found", subjectId: "s-maths" } }),
    );
    const { container } = open();
    type("First name", "Folake");
    type("Last name", "Adeyemi");
    type("Email", "f@school.edu.ng");
    await chooseOption(screen.getByLabelText("Class"), "JSS 2A");
    fireEvent.click(await screen.findByRole("checkbox", { name: "Mathematics" }));
    expect(subjects).toHaveBeenCalledTimes(1);
    subjects.mockResolvedValue([subject("s-sci", "Basic Science")]);
    fireEvent.click(screen.getByRole("button", { name: "Send invite" }));
    await waitFor(() => expect(visibleText(container)).toMatch(/1 thing still to fill in/));
    await waitFor(() => expect(screen.queryByRole("checkbox", { name: "Mathematics" })).toBeNull());
    expect(subjects).toHaveBeenCalledTimes(2);
    expect(visibleText(container)).not.toMatch(/Subject not found/);
  });

  it("says when the school's subjects can't be read", async () => {
    subjects.mockRejectedValueOnce(new Error("500"));
    const { container } = open();
    await waitFor(() => expect(visibleText(container)).toMatch(/couldn.t read your school.s subject list/));
  });
});

describe("invitedClasses", () => {
  it("is one entry per class and ticked subject, and nothing for an unfinished row", () => {
    expect(
      invitedClasses([
        { key: 0, classId: "c1", subjectIds: ["a", "b"] },
        { key: 1, classId: "", subjectIds: [] },
        { key: 2, classId: "c2", subjectIds: [] },
      ]),
    ).toEqual([
      { classId: "c1", subjectId: "a" },
      { classId: "c1", subjectId: "b" },
    ]);
  });
});
