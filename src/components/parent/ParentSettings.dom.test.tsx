import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { ApiError } from "@/lib/api/client";
import type { ParentChild } from "@/lib/api/parent";

const { myChildren, me, logout, replace, submit } = vi.hoisted(() => ({
  myChildren: vi.fn(),
  me: vi.fn(),
  logout: vi.fn(),
  replace: vi.fn(),
  submit: vi.fn(),
}));

// Replaced wholesale - see ParentDataManagement.test.tsx for why importOriginal
// deadlocks the jsdom worker on the parent module.
vi.mock("@/lib/api/parent", () => ({ parentApi: { myChildren } }));
vi.mock("@/lib/api/users", () => ({ usersApi: { me } }));
vi.mock("@/lib/api/auth", () => ({ authApi: { logout } }));
vi.mock("@/lib/api/feedback", () => ({ feedbackApi: { submit } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/parent-portal/settings",
}));

import { ParentSettings } from "./ParentSettings";

/**
 * D01f Parent Settings (design 1397ec4), reduced to the rows a real endpoint
 * stands behind: the account (read-only), each child with their school,
 * Consent & data, Sign out, and Share feedback at the foot in the parent's
 * words. Left out: the email-updates toggle (no stream to switch), "Contact
 * {child}'s school" (no contact on any parent read) and the class name (not on
 * the children read) - raised, rule 10.
 */

const AMARA: ParentChild = {
  studentId: "s-1",
  firstName: "Amara",
  lastName: "Okafor",
  status: "active",
  schoolId: "sc-1",
  schoolName: "Corona Secondary School",
};

beforeEach(() => {
  vi.clearAllMocks();
  me.mockResolvedValue({
    userId: "p-1",
    role: "parent_guardian",
    firstName: "Ada",
    lastName: "Okoro",
    displayName: "Ada Okoro",
    email: "ada.okoro@gmail.com",
    school: null,
  });
  myChildren.mockResolvedValue([AMARA]);
  logout.mockResolvedValue(undefined);
});

describe("parent settings", () => {
  it("shows the account, the child with their school, and the way to consent and data", async () => {
    const { container } = render(<ParentSettings />);
    expect(await screen.findByText("Ada Okoro · ada.okoro@gmail.com")).toBeInTheDocument();
    expect(screen.getByText("Amara")).toBeInTheDocument();
    expect(screen.getAllByText("Corona Secondary School").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Consent & data/ })).toHaveAttribute(
      "href",
      "/parent-portal/data?child=s-1",
    );
    expect(container.textContent).toMatch(/Signed in as Ada Okoro · Corona Secondary School\./);
  });

  it("offers no control a server doesn't stand behind", async () => {
    const { container } = render(<ParentSettings />);
    await screen.findByText("Ada Okoro · ada.okoro@gmail.com");
    const text = visibleText(container);
    expect(text).not.toMatch(/Email updates|reaches you|Contact .* school|JSS/);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("signs out on the server and goes to sign-in", async () => {
    render(<ParentSettings />);
    fireEvent.click(await screen.findByRole("button", { name: /Sign out/ }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/parent-sign-in"));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it("opens Share feedback in the parent's words, with no consent-routing promise", async () => {
    render(<ParentSettings />);
    fireEvent.click(await screen.findByRole("button", { name: "Share feedback" }));
    expect(
      await screen.findByText(
        "How is Nevo working for your child? Anything you share helps us make it better for your family.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Your feedback")).toHaveAttribute(
      "placeholder",
      "How is Nevo going for your child at home?",
    );
    expect(document.body.textContent).not.toMatch(/consent request|pass it there/i);
  });

  it("sends a signed-out parent to the home, where they sign in", async () => {
    me.mockRejectedValue(new ApiError(401, "Unauthorized"));
    render(<ParentSettings />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/parent-portal"));
  });

  it("says a failed read failed, and asks again on Try again", async () => {
    myChildren.mockRejectedValueOnce(new Error("down"));
    render(<ParentSettings />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Ada Okoro · ada.okoro@gmail.com")).toBeInTheDocument();
  });
});
