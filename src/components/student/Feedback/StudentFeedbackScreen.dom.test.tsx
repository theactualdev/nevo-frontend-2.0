import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StudentFeedbackScreen } from "./StudentFeedbackScreen";

/**
 * "Nevo Feedback", the failed state: a tinted banner above the note that says
 * it could not be sent and that the note is still here, and a Try again that
 * sends it again. It was a violet line under the textarea the frame does not
 * draw.
 */

const { submit } = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock("@/lib/api", () => ({ feedbackApi: { submit } }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/student/profile/feedback",
}));

const write = (note: string) =>
  fireEvent.change(screen.getByPlaceholderText("Tell us what you think..."), {
    target: { value: note },
  });

const send = (name: string) =>
  act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });

beforeEach(() => {
  submit.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("feedback that could not be sent", () => {
  it("says so in the frame's banner, above the note", async () => {
    submit.mockRejectedValue(new Error("offline"));
    render(<StudentFeedbackScreen />);
    write("The quiz was fun");
    await send("Send Feedback");

    const banner = screen.getByRole("alert");
    expect(banner).toHaveTextContent("Your feedback couldn't be sent.");
    expect(banner).toHaveTextContent(
      "Your note is still here. Give it another try in a moment.",
    );
    const note = screen.getByPlaceholderText("Tell us what you think...");
    expect(
      banner.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps the note, and no em dash anywhere", async () => {
    submit.mockRejectedValue(new Error("offline"));
    render(<StudentFeedbackScreen />);
    write("The quiz was fun");
    await send("Send Feedback");

    expect(
      screen.getByPlaceholderText("Tell us what you think..."),
    ).toHaveValue("The quiz was fun");
    expect(document.body.textContent).not.toContain("—");
  });

  it("sends it again from Try again, and only then says thank you", async () => {
    submit.mockRejectedValueOnce(new Error("offline"));
    submit.mockResolvedValueOnce({});
    render(<StudentFeedbackScreen />);
    write("The quiz was fun");
    await send("Send Feedback");
    expect(screen.queryByText(/on its way/)).toBeNull();

    await send("Try again");

    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[1][0]).toMatchObject({ note: "The quiz was fun" });
    expect(screen.getByText("Thank you - that's on its way")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("what the screen promises about where feedback goes", () => {
  /*
   * Design D49, 1 Oct. It said "their teacher sees the themes", and feedback
   * only ever reaches Nevo's own inbox - no teacher view exists. The screen
   * says it reaches Nevo and promises no teacher view until there is one.
   */
  it("says the note reaches Nevo", () => {
    render(<StudentFeedbackScreen />);

    expect(screen.getByText(/their note reaches Nevo./)).toBeInTheDocument();
  });

  it("promises no teacher anything", () => {
    render(<StudentFeedbackScreen />);

    expect(document.body.textContent).not.toMatch(/teacher/i);
    expect(document.body.textContent).not.toMatch(/themes/i);
  });
});
