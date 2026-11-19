import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { NewInviteModal } from "./NewInviteModal";

/**
 * D19's teacher invite, as far as the contract goes (backlog 16): first and
 * last name as two fields, a required email, no "(optional)" (SCRUM-207), and
 * the frame's "N things still to fill in" line until none are left. One class:
 * `POST /invites` takes one `classId` and no subjects.
 */

const create = vi.fn();
vi.mock("@/lib/api/invites", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/invites")>();
  return { ...actual, invitesApi: { ...actual.invitesApi, create: (d: unknown) => create(d) } };
});

beforeEach(() => {
  vi.clearAllMocks();
  create.mockResolvedValue({ id: "i1", token: "tok", email: "f@school.edu.ng", name: "Folake Adeyemi", deliveryStatus: "sent" });
});

const open = () =>
  render(
    <NewInviteModal
      classes={[{ id: "c1", name: "JSS 2A", archivedAt: null } as never]}
      onClose={vi.fn()}
      onSent={vi.fn()}
    />,
  );
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("Invite a teacher (D19)", () => {
  it("asks for a first and a last name, and an email, with nothing marked optional", () => {
    const { container } = open();
    expect(screen.getByLabelText("First name")).toBeInTheDocument();
    expect(screen.getByLabelText("Last name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).toBeNull();
    expect(visibleText(container)).not.toMatch(/optional/i);
  });

  it("counts what is still to fill in, and holds Send until it's nothing", () => {
    const { container } = open();
    expect(visibleText(container)).toMatch(/3 things still to fill in/);
    expect(screen.getByRole("button", { name: "Send invite" })).toBeDisabled();
    type("First name", "Folake");
    type("Last name", "Adeyemi");
    expect(visibleText(container)).toMatch(/1 thing still to fill in/);
    type("Email", "not an email");
    expect(visibleText(container)).toMatch(/1 thing still to fill in/);
    type("Email", "f@school.edu.ng");
    expect(container.querySelector("[data-missing]")).toBeNull();
    expect(screen.getByRole("button", { name: "Send invite" })).not.toBeDisabled();
  });

  it("sends the names as typed - never a name split on the device - with the one class", async () => {
    open();
    type("First name", "Mary Ann");
    type("Last name", "Okafor-Bello");
    type("Email", " f@school.edu.ng ");
    fireEvent.change(screen.getByLabelText("Class"), { target: { value: "c1" } });
    fireEvent.click(screen.getByRole("button", { name: "Send invite" }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        role: "teacher",
        firstName: "Mary Ann",
        lastName: "Okafor-Bello",
        email: "f@school.edu.ng",
        classId: "c1",
      }),
    );
  });
});
