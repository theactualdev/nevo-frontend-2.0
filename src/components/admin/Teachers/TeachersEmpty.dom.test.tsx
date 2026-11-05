import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { TeachersView } from "./TeachersView";

/**
 * D06's empty state as redrawn in design 1397ec4 (Lydia's item 7, no SSO).
 * It offered "Import a roster" - the setup upload - which refuses a school
 * that is already running (`/onboarding/imports` 409 `school_already_active`),
 * so the way in it named led nowhere. Inviting is the way a teacher joins.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
}));
vi.mock("@/lib/api/teachers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/teachers")>();
  return { ...actual, teachersApi: { ...actual.teachersApi, list: async () => [] } };
});
vi.mock("@/lib/api/invites", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/invites")>();
  return { ...actual, invitesApi: { ...actual.invitesApi, list: async () => [] } };
});

describe("Teachers with nobody on it yet", () => {
  it("says what inviting does, in D06's words, and offers only the invitation", async () => {
    const { container } = render(<TeachersView />);
    expect(await screen.findByRole("heading", { name: "No teachers yet" })).toBeInTheDocument();
    const text = visibleText(container);
    expect(text).toMatch(/Invite your teachers and each one gets their own console\./);
    expect(text).toMatch(
      /Everyone you invite gets an email to set a password and join their classes - nothing goes out until you invite them\./,
    );
    expect(screen.getByRole("link", { name: /Invite a teacher/ })).toHaveAttribute(
      "href",
      "/admin/invitations",
    );
    expect(screen.queryByRole("link", { name: /Import a roster/ })).toBeNull();
    expect(text).not.toMatch(/staff file/);
  });
});
