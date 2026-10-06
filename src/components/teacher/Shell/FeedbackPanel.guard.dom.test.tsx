import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/teacher/dashboard" }));

import { FeedbackPanel } from "./FeedbackPanel";

/**
 * Half-written feedback is work too (audit C17): a refresh used to throw it
 * away without a word.
 */

/** Whether the browser would ask before leaving: the event was cancelled. */
const leavingAsks = () => {
  const e = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
};

describe("feedback not yet sent", () => {
  it("makes the browser ask before leaving", () => {
    render(<FeedbackPanel onClose={vi.fn()} />);
    expect(leavingAsks()).toBe(false);

    fireEvent.change(screen.getByLabelText("Your feedback"), {
      target: { value: "The upload screen froze." },
    });
    expect(leavingAsks()).toBe(true);
  });
});
