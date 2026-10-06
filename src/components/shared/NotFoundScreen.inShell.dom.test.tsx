import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { NotFoundScreen } from "./SystemScreens";
import TeacherNotFound from "@/app/teacher/not-found";

/**
 * A missing record inside the teacher console stays inside it: the screen
 * draws within the shell rather than as a page of its own.
 */
describe("the not-found screen", () => {
  it("takes the whole viewport on its own", () => {
    const { container } = render(<NotFoundScreen />);

    expect(container.firstElementChild?.className).toMatch(/min-h-\[100dvh\]/);
  });

  it("draws inside the teacher console's shell", () => {
    const { container } = render(<TeacherNotFound />);

    expect(container.firstElementChild?.className).not.toMatch(/min-h-\[100dvh\]/);
    expect(container.textContent).toMatch(/This page doesn.t exist/);
  });
});
