import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return { ...actual, studentsApi: { ...actual.studentsApi, clearPin: vi.fn() } };
});

import { RosterRowMenu } from "./RosterRowMenu";

/**
 * The menu's own guard, beside the roster's: a deactivated child has no PIN to
 * clear, so Clear PIN never comes out onto their row - even if a request to
 * reset one is on the record from before the account was switched off.
 */

const props = {
  studentId: "s-1",
  firstName: "Amara",
  profileHref: "/teacher/students/s-1",
  open: false,
  onToggle: vi.fn(),
  onClose: vi.fn(),
  onCleared: vi.fn(),
};

describe("the actions out on the row", () => {
  it("offers Clear PIN to an active child who asked", () => {
    render(<RosterRowMenu {...props} status="active" pinAsked />);

    expect(screen.getByRole("button", { name: "Clear PIN" })).toBeInTheDocument();
  });

  it("never offers it to a deactivated child, asked or not", () => {
    render(<RosterRowMenu {...props} status="deactivated" pinAsked onAsk={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Clear PIN" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Ask an admin/ })).toBeInTheDocument();
  });

  it("offers no way to ask an admin about an active child", () => {
    render(<RosterRowMenu {...props} status="active" onAsk={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /^Ask an admin/ })).not.toBeInTheDocument();
  });
});
