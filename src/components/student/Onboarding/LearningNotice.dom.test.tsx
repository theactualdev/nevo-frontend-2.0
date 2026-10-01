import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LearningNotice } from "./LearningNotice";

/**
 * The notice opened on a 1.4-second spinner - "Just a moment, we're getting
 * things ready for you" over a disabled Continue - waiting on nothing. It was
 * a timer left behind by a consent check that had been removed, and it told
 * the signal stream the system was busy authenticating when no auth happened.
 * The frame draws only the notice.
 */

afterEach(() => cleanup());

describe("LearningNotice", () => {
  it("shows the notice at once, with nothing to wait for", () => {
    render(<LearningNotice onContinue={() => {}} />);

    expect(screen.getByText("Nevo will get to know how you learn")).toBeVisible();
    expect(screen.queryByText(/just a moment/i)).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("lets the child go on straight away", () => {
    const onContinue = vi.fn();
    render(<LearningNotice onContinue={onContinue} />);

    const go = screen.getByRole("button", { name: "Continue" });
    expect(go).toBeEnabled();
    fireEvent.click(go);

    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("sets no timer of its own", () => {
    // A wait with nothing behind it is the thing this replaced.
    vi.useFakeTimers();
    try {
      render(<LearningNotice onContinue={() => {}} />);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
