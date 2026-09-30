import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LessonExitProvider, useLessonExit } from "./LessonExit";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

function Leave() {
  const exit = useLessonExit();
  return (
    <button type="button" onClick={() => exit("/student/lessons")}>
      Leave
    </button>
  );
}

afterEach(() => {
  cleanup();
  push.mockReset();
});

describe("where a lesson goes when a child leaves it", () => {
  it("navigates, for a lesson opened from its own route", () => {
    render(<Leave />);
    fireEvent.click(screen.getByText("Leave"));

    expect(push).toHaveBeenCalledWith("/student/lessons");
  });

  it("goes wherever the opener says instead, and does not navigate", () => {
    const onExit = vi.fn();
    render(
      <LessonExitProvider onExit={onExit}>
        <Leave />
      </LessonExitProvider>,
    );
    fireEvent.click(screen.getByText("Leave"));

    expect(onExit).toHaveBeenCalledWith("/student/lessons");
    expect(push).not.toHaveBeenCalled();
  });
});
