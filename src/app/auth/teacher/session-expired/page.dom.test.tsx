import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import TeacherSessionExpiredPage from "./page";

/**
 * T217. The screen promises "continue where you left off", and its Sign in
 * went to a bare door that could not know where that was.
 */

const show = async (searchParams: { reason?: string; next?: string }) =>
  render(await TeacherSessionExpiredPage({ searchParams: Promise.resolve(searchParams) }));

describe("the teacher's session-expired screen", () => {
  it("hands the door the place they were", async () => {
    await show({ next: "/teacher/classes/c-1?tab=roster" });

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      `/auth/teacher?next=${encodeURIComponent("/teacher/classes/c-1?tab=roster")}`,
    );
  });

  it("hands on nothing that is not a teacher console route", async () => {
    await show({ next: "https://elsewhere.test/teacher/" });

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/auth/teacher");
  });

  it("is the plain door when there was no place", async () => {
    await show({});

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/auth/teacher");
  });
});
