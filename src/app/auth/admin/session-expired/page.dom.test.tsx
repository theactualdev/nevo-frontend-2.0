import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminSessionExpiredPage from "./page";

/**
 * The admin door always read `?next=`, and this screen's Sign in went to it
 * bare - so an admin whose session ended mid-page signed back in to their
 * home, not the page they were on.
 */

const show = async (searchParams: { reason?: string; next?: string | string[] }) =>
  render(await AdminSessionExpiredPage({ searchParams: Promise.resolve(searchParams) }));

describe("the admin's session-expired screen", () => {
  it("hands the door the place they were", async () => {
    const place = `/admin/students/s1?back=${encodeURIComponent("/admin/classes/c-1")}`;
    await show({ next: place });

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      `/auth/admin?next=${encodeURIComponent(place)}`,
    );
  });

  it("hands on nothing that is not an admin console route", async () => {
    await show({ next: "https://elsewhere.test/admin/" });
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/auth/admin");
  });

  it("is the plain door when there was no place", async () => {
    await show({});
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/auth/admin");
  });

  it("does not trip over a repeated next", async () => {
    await show({ next: ["/admin/billing", "/admin/team"] });
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/auth/admin");
  });
});
