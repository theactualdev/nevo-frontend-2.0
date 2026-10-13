import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { HowToPayPanel } from "./HowToPayPanel";
import type { ReceivingAccount, TransferReport } from "@/lib/api/billing";
import { ApiError } from "@/lib/api/client";

/**
 * The two things here that cost real money if they are wrong.
 *
 * 1. NEVER INVENT AN ACCOUNT. With no receiving account the panel must say so
 *    rather than fall back on the frame's illustrative Kuda details, which
 *    would send a school's transfer to a number nobody sourced.
 * 2. A REPORT IS NOT A PAYMENT. "I've made this transfer" files the school's
 *    claim (`transfer-report`); Nevo finance confirms the money. The panel
 *    says "pending verification" and never that the invoice is settled.
 */

const account: ReceivingAccount = {
  bankName: "Kuda Bank",
  accountNumber: "3004167012",
  accountName: "Nevo Learning Limited",
  currency: "NGN",
};

const report = (
  status: TransferReport["status"] = "awaiting_confirmation",
): TransferReport => ({
  transactionId: "t1",
  invoiceId: "i3",
  bankReference: "FBN-TRF-99183",
  status,
  message: "Transfer reported. Nevo finance will confirm it against the bank statement.",
});

const panel = (over: Partial<Parameters<typeof HowToPayPanel>[0]> = {}) =>
  render(
    <HowToPayPanel
      account={account}
      reference="NEV-2026-0001"
      amount="₦54,825,000"
      invoiceId="i3"
      billedIn="NGN"
      recorded={null}
      onRecord={vi.fn(async () => report())}
      onRecorded={vi.fn()}
      {...over}
    />,
  );

/** Open the form and type a reference. */
async function typeReference(
  ui: ReturnType<typeof panel>,
  reference: string,
): Promise<void> {
  const { getByText, container } = ui;
  (getByText(/made this transfer/i) as HTMLElement).click();
  await waitFor(() => expect(container.querySelector("input")).not.toBeNull());
  const input = container.querySelector("input") as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )!.set!;
  setter.call(input, reference);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Open the form, type a valid reference, and press Record. */
async function submit(
  ui: ReturnType<typeof panel>,
  reference = "FBN-TRF-99183",
): Promise<void> {
  await typeReference(ui, reference);
  await waitFor(() =>
    expect(
      (ui.getByText("Record transfer") as HTMLButtonElement).disabled,
    ).toBe(false),
  );
  (ui.getByText("Record transfer") as HTMLElement).click();
}

describe("HowToPayPanel", () => {
  it("never shows an account when none was supplied", () => {
    const t = visibleText(panel({ account: null }).container);
    expect(t).toMatch(/couldn.t load Nevo.s bank details just now/);
    expect(t).not.toMatch(/available here yet/);
    expect(t).not.toMatch(/Kuda|3004167012|Nevo Learning Limited/);
    // The reference IS known - it is on the invoice - so it still helps.
    expect(t).toMatch(/NEV-2026-0001/);
  });

  it("shows D11c's pending line for a reported transfer, not the server's note", () => {
    const t = visibleText(panel({ recorded: report() }).container);
    expect(t).toMatch(/Payment sent, pending verification\./);
    expect(t).not.toMatch(/bank statement/);
    expect(t).not.toMatch(/made this transfer/i);
  });

  it("sends the trimmed reference and the invoice id", async () => {
    const onRecord = vi.fn(async () => report());
    const ui = panel({ onRecord });
    await submit(ui, "  FBN-TRF-99183  ");
    await waitFor(() => expect(onRecord).toHaveBeenCalledTimes(1));
    expect(onRecord).toHaveBeenCalledWith("i3", "FBN-TRF-99183");
  });

  it("will not submit a reference shorter than the API allows", async () => {
    const onRecord = vi.fn(async () => report());
    const ui = panel({ onRecord });
    await typeReference(ui, "ab");
    await waitFor(() =>
      expect(
        (ui.getByText("Record transfer") as HTMLButtonElement).disabled,
      ).toBe(true),
    );
    expect(onRecord).not.toHaveBeenCalled();
  });

  it("no longer promises the invoice won't be paid twice - a report pays nothing", async () => {
    const ui = panel();
    await typeReference(ui, "FBN");
    const t = visibleText(ui.container);
    expect(t).toMatch(/find your transfer on our bank statement/);
    expect(t).not.toMatch(/pay the invoice twice/);
  });

  it("passes any report the server returns upward", async () => {
    const onRecorded = vi.fn();
    const ui = panel({ onRecord: vi.fn(async () => report()), onRecorded });
    await submit(ui);
    await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1));
    expect(onRecorded.mock.calls[0][0].status).toBe("awaiting_confirmation");
    expect(visibleText(ui.container)).not.toMatch(/didn't record/i);
  });

  it("shows the server's words when it refuses, and keeps the reference", async () => {
    const onRecorded = vi.fn();
    const ui = panel({
      onRecord: vi.fn(async () => {
        throw new ApiError(409, "Conflict", {
          detail: {
            code: "invoice_already_paid",
            message: "This invoice is already paid.",
          },
        });
      }),
      onRecorded,
    });
    await submit(ui);
    await waitFor(() =>
      expect(visibleText(ui.container)).toMatch(/This invoice is already paid\./),
    );
    expect(onRecorded).not.toHaveBeenCalled();
    expect(visibleText(ui.container)).not.toMatch(/pending verification/i);
    expect((ui.container.querySelector("input") as HTMLInputElement).value).toBe(
      "FBN-TRF-99183",
    );
  });

  it("says nothing changed when the report never arrived", async () => {
    const onRecorded = vi.fn();
    const ui = panel({
      onRecord: vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
      onRecorded,
    });
    await submit(ui);
    await waitFor(() =>
      expect(visibleText(ui.container)).toMatch(/didn.t record, so nothing has changed/i),
    );
    expect(onRecorded).not.toHaveBeenCalled();
  });

  it("does not tell a pound-billed school to transfer into a naira account", () => {
    const t = visibleText(
      panel({ billedIn: "GBP", amount: "£54,825" }).container,
    );
    expect(t).toMatch(/this account receives NGN/i);
    expect(t).toMatch(/Check with us before you transfer/i);
    // The instruction to send it is gone - that is the money-losing sentence.
    expect(t).not.toMatch(/Transfer £54,825 from your school's bank/);
  });

  it("gives the plain instruction when the currencies agree", () => {
    const t = visibleText(panel({ billedIn: "NGN" }).container);
    expect(t).toMatch(/Transfer ₦54,825,000 from your school's bank/);
    expect(t).not.toMatch(/Check with us/i);
  });
});
