import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import AdminError from "@/app/admin/error";
import { adminActivationLink } from "@/lib/api/team";

/**
 * The admin console's error boundary, and the admin activation link.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

describe("the admin error boundary", () => {
  it("owns the failure calmly, retries the page, and goes back to the console's door", () => {
    const retry = vi.fn();
    render(<AdminError error={new Error("boom")} unstable_retry={retry} />);
    expect(screen.getByText("This part of the console stalled")).toBeInTheDocument();
    // Never the error itself.
    expect(screen.queryByText(/boom/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Back to my console" }));
    expect(push).toHaveBeenCalledWith("/admin");
  });
});

describe("the admin activation link", () => {
  it("carries the token and never the invitee's email", () => {
    const link = adminActivationLink({
      invitationToken: "tok 1",
      email: "deputy@school.ng",
    } as Parameters<typeof adminActivationLink>[0]);
    expect(link).toMatch(/\/auth\/admin\/activate\?token=tok%201$/);
    expect(link).not.toMatch(/email|deputy|school\.ng/);
  });
});
