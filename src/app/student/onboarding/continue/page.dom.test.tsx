import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import OnboardingContinuePage from "./page";

/**
 * The way back arrives in the URL, from the 20 Oct production run: a child
 * who tapped Start on a lesson finished onboarding and landed on Home. The
 * route hands on only what it would send a child back to.
 */

vi.mock("@/components/student/Onboarding/OnboardingResume", () => ({
  OnboardingResume: ({ returnTo }: { returnTo?: string }) => (
    <div data-testid="resume" data-return-to={returnTo ?? "(none)"} />
  ),
}));

const show = async (searchParams: Record<string, string | string[] | undefined>) =>
  render(await OnboardingContinuePage({ searchParams: Promise.resolve(searchParams) }));

describe("the continue route's way back", () => {
  it("hands on the lesson the child was refused, assignment and all", async () => {
    await show({ next: "/student/lessons/les-1?assignment=asg-1" });

    expect(screen.getByTestId("resume")).toHaveAttribute(
      "data-return-to",
      "/student/lessons/les-1?assignment=asg-1",
    );
  });

  it("hands on nothing that is not a plain student page", async () => {
    for (const next of [
      "https://evil.example/student/lessons/x",
      "//evil.example",
      "/student/onboarding/continue",
      "/teacher/classes",
    ]) {
      const { unmount } = await show({ next });
      expect(screen.getByTestId("resume")).toHaveAttribute("data-return-to", "(none)");
      unmount();
    }
  });

  it("hands on nothing when there is no way back, or more than one", async () => {
    const { unmount } = await show({});
    expect(screen.getByTestId("resume")).toHaveAttribute("data-return-to", "(none)");
    unmount();

    await show({ next: ["/student/lessons/a", "/student/lessons/b"] });
    expect(screen.getByTestId("resume")).toHaveAttribute("data-return-to", "(none)");
  });
});
