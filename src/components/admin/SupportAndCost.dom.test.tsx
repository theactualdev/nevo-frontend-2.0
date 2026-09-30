import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { PUBLISHED_SUPPORT_EMAIL, SupportEmailLink } from "./SupportEmail";
import { NewInviteModal } from "./Invitations/NewInviteModal";

/**
 * Two small truths the admin console stated its own way:
 * - the support address was hard-coded in four places while the teacher
 *   console read it live from `GET /api/v1/support-contact`;
 * - D24b's "Add a teacher" tells an admin the cost before they send - "No
 *   charge" - and the invite modal said nothing.
 */

const contact = vi.fn();

vi.mock("@/lib/api/support", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/support")>();
  return { ...actual, supportApi: { contact: () => contact() } };
});

beforeEach(() => vi.clearAllMocks());

describe("the support address", () => {
  it("is the one backend publishes, once the read answers", async () => {
    contact.mockResolvedValue({
      email: "help@nevo.ng",
      whatsapp: { number: "+234 800 000 0000", link: "https://wa.me/2348000000000" },
      responseTime: "Mon-Fri, within 24 hours",
    });
    render(<SupportEmailLink />);
    const link = await screen.findByRole("link", { name: "help@nevo.ng" });
    expect(link.getAttribute("href")).toBe("mailto:help@nevo.ng");
  });

  it("falls back to the published address rather than a sentence with none", async () => {
    contact.mockRejectedValue(new Error("offline"));
    render(<SupportEmailLink>Contact us</SupportEmailLink>);
    await waitFor(() => expect(contact).toHaveBeenCalled());
    expect(screen.getByRole("link", { name: "Contact us" }).getAttribute("href")).toBe(
      `mailto:${PUBLISHED_SUPPORT_EMAIL}`,
    );
  });
});

describe("inviting a teacher", () => {
  beforeEach(() => contact.mockResolvedValue(null));

  it("says what it costs before it is sent: nothing", () => {
    const { container } = render(
      <NewInviteModal role="teacher" classes={[]} onClose={() => {}} onSent={() => {}} />,
    );
    const text = visibleText(container);
    expect(text).toMatch(/No charge/);
    expect(text).toMatch(/Teacher accounts are always free\. Only students count towards your bill\./);
  });

  it("never tells a student invite it is free", () => {
    const { container } = render(
      <NewInviteModal role="student" classes={[]} onClose={() => {}} onSent={() => {}} />,
    );
    expect(visibleText(container)).not.toMatch(/No charge|always free/);
  });
});
