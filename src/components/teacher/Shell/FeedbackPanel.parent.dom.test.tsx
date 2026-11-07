import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { submit } = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/parent-portal/settings" }));
vi.mock("@/lib/api/feedback", () => ({ feedbackApi: { submit } }));

import { FeedbackPanel } from "./FeedbackPanel";

/**
 * A PARENT'S THANKS (Lydia, 13f, 7 Nov): "Thank you. We've got your note."
 * The note is stored with the parent's account ({type, note, context}) - not
 * on the child's record, and not passed anywhere - so the line claims nothing
 * about where it sits or goes. The teacher's panel keeps its own words.
 */

const sendNote = () => {
  fireEvent.change(screen.getByLabelText("Your feedback"), {
    target: { value: "The weekly summary is lovely." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send Feedback" }));
};

beforeEach(() => {
  submit.mockReset();
  submit.mockResolvedValue({});
});

describe("a parent's feedback, once sent", () => {
  it("says Lydia's line, and nothing about a record or where it goes", async () => {
    render(<FeedbackPanel role="parent" onClose={vi.fn()} />);
    sendNote();
    const done = await screen.findByRole("dialog", { name: "Feedback sent" });
    expect(done).toHaveTextContent("Thank you. We’ve got your note.");
    expect(done).not.toHaveTextContent(/record|on its way|pass/i);
  });

  it("leaves the teacher's thanks as it was", async () => {
    render(<FeedbackPanel onClose={vi.fn()} />);
    sendNote();
    const done = await screen.findByRole("dialog", { name: "Feedback sent" });
    expect(done).toHaveTextContent("Thank you - that’s on its way");
  });
});
