import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { submit } = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/teacher/dashboard" }));
vi.mock("@/lib/api/feedback", () => ({ feedbackApi: { submit } }));

import { FeedbackPanel } from "./FeedbackPanel";

/**
 * Two dialogs take turns in this panel (C07): the form, then the thank-you
 * that replaces it. Focus has to follow, or it is left on a Send button that
 * no longer exists.
 */

beforeEach(() => {
  submit.mockReset().mockResolvedValue(undefined);
});

describe("the feedback panel's focus", () => {
  it("moves into the form when the panel opens", () => {
    render(<FeedbackPanel onClose={vi.fn()} />);

    expect(
      screen.getByRole("dialog", { name: "Share feedback" }).contains(document.activeElement),
    ).toBe(true);
  });

  it("follows the thank-you when the note is sent", async () => {
    render(<FeedbackPanel onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Your feedback"), {
      target: { value: "The upload screen froze." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send Feedback" }));

    const thanks = await screen.findByRole("dialog", { name: "Feedback sent" });
    expect(document.activeElement).toBe(thanks);
  });
});
