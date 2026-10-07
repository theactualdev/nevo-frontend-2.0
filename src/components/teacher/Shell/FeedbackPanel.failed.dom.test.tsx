import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { submit } = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/teacher/dashboard" }));
vi.mock("@/lib/api/feedback", () => ({ feedbackApi: { submit } }));

import { FeedbackPanel } from "./FeedbackPanel";
import { ApiError } from "@/lib/api/client";

/**
 * The failure the frame has drawn since 30 Aug: a card above the note with a
 * retry glyph, its heading and its sentence, and a glyphed Try again in place
 * of Send. This said "the frame draws no failure state" for a month.
 */

const sendNote = () => {
  fireEvent.change(screen.getByLabelText("Your feedback"), {
    target: { value: "The upload screen froze." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send Feedback" }));
};

beforeEach(() => {
  submit.mockReset();
});

describe("feedback that could not be sent", () => {
  it("says so in the frame's words, above the note", async () => {
    submit.mockRejectedValue(new ApiError(500, "server"));
    render(<FeedbackPanel onClose={vi.fn()} />);
    sendNote();

    const card = await screen.findByRole("alert");
    expect(card).toHaveTextContent("Your feedback couldn’t be sent.");
    expect(card).toHaveTextContent("Your note is still here. Give it another try in a moment.");
    const note = screen.getByLabelText("Your feedback");
    expect(card.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(note).toHaveValue("The upload screen froze.");
  });

  it("offers Try again where Send was", async () => {
    submit.mockRejectedValue(new ApiError(0, "network"));
    render(<FeedbackPanel onClose={vi.fn()} />);
    sendNote();

    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send Feedback" })).not.toBeInTheDocument();
  });

  it("asks for an edit, not a wait, when the note itself was refused", async () => {
    submit.mockRejectedValue(new ApiError(422, "unprocessable"));
    render(<FeedbackPanel onClose={vi.fn()} />);
    sendNote();

    const card = await screen.findByRole("alert");
    expect(card).toHaveTextContent("Your feedback couldn’t be sent.");
    expect(card).toHaveTextContent(/edit it and send again/);
    expect(card).not.toHaveTextContent(/another try in a moment/);
  });
});
