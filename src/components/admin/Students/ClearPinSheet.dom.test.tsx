import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { clearPin } = vi.hoisted(() => ({ clearPin: vi.fn() }));

vi.mock("@/lib/api/students", () => ({ studentsApi: { clearPin } }));

import { ClearPinSheet } from "./ClearPinSheet";

/**
 * Clearing a child's PIN (SCRUM-216).
 *
 * A clear, not a reset: the endpoint never returns or generates a PIN, and
 * the child chooses the next one. What it does do is invisible in the
 * contract's response - the old PIN stops working and every session the child
 * has ends - so these pin that the sheet says so before anything happens, and
 * that no PIN is ever on screen.
 */

const CLEARED = {
  studentId: "s-1",
  clearedAt: "2026-10-06T10:00:00Z",
  childSetsNext: true,
  pinLength: 4,
};

beforeEach(() => clearPin.mockReset());

const open = () =>
  render(<ClearPinSheet studentId="s-1" studentName="Amara Okafor" onClose={vi.fn()} />);

const confirm = () => fireEvent.click(screen.getByRole("button", { name: /^Clear PIN$/ }));

describe("before anything is cleared", () => {
  it("does not call the endpoint just by opening", () => {
    // Opening the sheet to look must not lock out a child whose PIN works.
    open();
    expect(clearPin).not.toHaveBeenCalled();
  });

  it("says the PIN stops working and the child is signed out, before the button is pressed", () => {
    open();
    expect(screen.getByText(/current PIN stops working straight away/i)).toHaveTextContent(
      /signed out anywhere they.re signed in/i,
    );
    expect(screen.getByText(/choose a new one the next time they sign in/i)).toBeInTheDocument();
  });
});

describe("once cleared", () => {
  const clearAndSettle = async () => {
    clearPin.mockResolvedValueOnce(CLEARED);
    open();
    confirm();
    return screen.findByText(/Amara.s PIN is cleared/);
  };

  it("clears this child, and says so in the teacher frame's words", async () => {
    expect(await clearAndSettle()).toBeInTheDocument();
    expect(clearPin).toHaveBeenCalledWith("s-1");
    expect(screen.getByText("Amara chooses a new PIN at the next sign-in.")).toBeInTheDocument();
    expect(screen.getByText(/You won.t be able to see the new PIN\. Only Amara will know it\./)).toBeInTheDocument();
  });

  it("shows no PIN and offers nothing to copy - there is none", async () => {
    await clearAndSettle();
    expect(document.body.textContent).not.toMatch(/\d{4}/);
    expect(screen.queryByRole("button", { name: /copy/i })).not.toBeInTheDocument();
  });

  it("offers one way out, and it is Done rather than Cancel", async () => {
    await clearAndSettle();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Cancel$/i })).not.toBeInTheDocument();
  });
});

describe("when it fails", () => {
  it("says the child's PIN is unchanged, rather than leaving it ambiguous", async () => {
    clearPin.mockRejectedValueOnce(new Error("nope"));
    open();
    confirm();
    const msg = await screen.findByText(/hasn.t changed/i);
    expect(msg).toHaveTextContent(/can still use their old one/i);
  });

  it("offers a retry", async () => {
    clearPin.mockRejectedValueOnce(new Error("nope"));
    open();
    confirm();
    expect(await screen.findByRole("button", { name: /Try again/i })).toBeInTheDocument();
  });
});
