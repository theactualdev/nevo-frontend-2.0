import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { useStudentDirectory, useTeacherClasses, useHasSession } = vi.hoisted(
  () => ({
    useStudentDirectory: vi.fn(),
    useTeacherClasses: vi.fn(),
    useHasSession: vi.fn(),
  }),
);
vi.mock("@/hooks/useStudentDirectory", () => ({ useStudentDirectory }));
vi.mock("@/hooks/useTeacherClasses", () => ({ useTeacherClasses }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession }));

import { ComposeModal } from "./ComposeModal";

/**
 * THE CLASS CHIPS OVER A REAL ROSTER.
 *
 * They were built from `useTeacherClasses().options` with no guard - the
 * fixture three while the read is in flight and after it fails - so a
 * signed-in teacher picking "JSS 2A" filtered their REAL roster by an invented
 * class's name. The roster was already guarded; its filter was not.
 */

const FIXTURE_OPTIONS = [
  { id: "jss-2a", name: "JSS 2A" },
  { id: "jss-2b", name: "JSS 2B" },
];

const classes = (over: Record<string, unknown>) =>
  useTeacherClasses.mockReturnValue({
    options: FIXTURE_OPTIONS,
    live: false,
    loading: false,
    sample: false,
    ...over,
  });

beforeEach(() => {
  useHasSession.mockReturnValue(true);
  useStudentDirectory.mockReturnValue({
    students: [{ studentId: "s-1", name: "Ada Obi", className: "Year 7 Blue", initials: "AO" }],
    loading: false,
    failed: false,
    live: true,
  });
});

const chip = (name: string) => screen.queryByRole("button", { name });

describe("the class chips", () => {
  it("offers no invented class while the class read is in flight", () => {
    classes({ loading: true });
    render(<ComposeModal onClose={vi.fn()} onSend={vi.fn()} />);

    expect(chip("JSS 2A")).not.toBeInTheDocument();
    expect(chip("All classes")).toBeInTheDocument();
  });

  it("offers no invented class when the class read failed", () => {
    classes({ sample: true });
    render(<ComposeModal onClose={vi.fn()} onSend={vi.fn()} />);

    expect(chip("JSS 2A")).not.toBeInTheDocument();
  });

  it("offers the teacher's own classes once they are in", () => {
    classes({ live: true, options: [{ id: "c-1", name: "Year 7 Blue" }] });
    render(<ComposeModal onClose={vi.fn()} onSend={vi.fn()} />);

    expect(chip("Year 7 Blue")).toBeInTheDocument();
  });

  it("keeps the designed three for a visitor with no session", () => {
    useHasSession.mockReturnValue(false);
    classes({});
    render(<ComposeModal onClose={vi.fn()} onSend={vi.fn()} />);

    expect(chip("JSS 2A")).toBeInTheDocument();
  });
});

/** Whether the browser would ask before leaving: the event was cancelled. */
const leavingAsks = () => {
  const e = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
};

describe("a new message not yet sent", () => {
  it("makes the browser ask before leaving", async () => {
    const { fireEvent } = await import("@testing-library/react");
    classes({ live: true });
    render(<ComposeModal onClose={vi.fn()} onSend={vi.fn()} />);
    expect(leavingAsks()).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /Ada Obi/ }));
    fireEvent.change(screen.getByPlaceholderText("Write your message…"), {
      target: { value: "Can we talk about Friday?" },
    });
    expect(leavingAsks()).toBe(true);
  });
});

describe("the student search (C10)", () => {
  it("is named, not only placeholdered", () => {
    classes({ live: true, options: [] });
    render(<ComposeModal onClose={vi.fn()} onSend={vi.fn()} />);

    expect(screen.getByLabelText("Search your students")).toHaveAttribute(
      "placeholder",
      "Search your students",
    );
  });
});
