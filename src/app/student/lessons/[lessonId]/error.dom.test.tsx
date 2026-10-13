import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import LessonRouteError from "./error";

/**
 * The lesson's own boundary says "Something went wrong. We're on it." and
 * carried a `TODO(observability)` where the "on it" should have been. B36 gave
 * it somewhere to go.
 */

const reportClientError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/clientErrors", () => ({ reportClientError }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  reportClientError.mockReset();
  vi.restoreAllMocks();
});

describe("the lesson's error boundary", () => {
  it("reports what it caught as the student console's, once", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("segment failed");
    const { rerender } = render(
      <LessonRouteError error={error} unstable_retry={vi.fn()} />,
    );
    rerender(<LessonRouteError error={error} unstable_retry={vi.fn()} />);

    expect(reportClientError).toHaveBeenCalledTimes(1);
    expect(reportClientError).toHaveBeenCalledWith(error, "student");
    // And the screen is the one the child was always shown.
    expect(screen.getByText(/We.re on it/)).toBeInTheDocument();
  });
});
