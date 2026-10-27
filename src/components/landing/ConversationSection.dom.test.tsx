import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { submit } = vi.hoisted(() => ({ submit: vi.fn() }));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  partnerInquiriesApi: { submit },
}));

import { ConversationSection } from "./ConversationSection";

/**
 * The landing page's one conversion path. It used to thank the visitor at
 * once and fire the POST and forget it, so an inquiry that failed - every one
 * sent while the backend was suspended on 24 Oct - was lost while the page
 * promised a reply within 24 hours.
 */

const fill = () => {
  fireEvent.change(screen.getByPlaceholderText("Full name"), { target: { value: "Ada Okoro" } });
  fireEvent.change(screen.getByPlaceholderText("Your school's name"), {
    target: { value: "Greenfield College" },
  });
  fireEvent.change(screen.getByPlaceholderText("How should we reach you?"), {
    target: { value: "ada@greenfield.edu.ng" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Request an introduction" }));
};


describe("an inquiry that is saved", () => {
  it("thanks the visitor only once the save lands", async () => {
    let land: (v: unknown) => void = () => {};
    submit.mockReturnValue(new Promise((resolve) => (land = resolve)));
    render(<ConversationSection />);
    fill();

    // Sending, not thanked yet.
    expect(screen.getByRole("button", { name: "Sending…" })).toBeInTheDocument();
    expect(screen.queryByText(/Thank you/)).not.toBeInTheDocument();

    land({ id: "inq-1" });
    expect(await screen.findByText("Thank you. We will be in touch soon.")).toBeInTheDocument();
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: "Ada Okoro",
        schoolName: "Greenfield College",
        contact: "ada@greenfield.edu.ng",
      }),
    );
  });
});

describe("an inquiry that does not send", () => {
  it("says so, keeps what was typed, and promises nothing", async () => {
    submit.mockRejectedValue(new Error("Service Suspended"));
    render(<ConversationSection />);
    fill();

    expect(await screen.findByRole("alert")).toHaveTextContent(/didn't send/);
    expect(screen.queryByText(/Thank you/)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Full name")).toHaveValue("Ada Okoro");
    expect(screen.getByPlaceholderText("How should we reach you?")).toHaveValue(
      "ada@greenfield.edu.ng",
    );
    // And it can be sent again.
    expect(screen.getByRole("button", { name: "Request an introduction" })).toBeInTheDocument();
  });
});
