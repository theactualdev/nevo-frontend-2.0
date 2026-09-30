import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { HowToPayPanel } from "./HowToPayPanel";
import type { PaymentOutcome, ReceivingAccount } from "@/lib/api/billing";

/**
 * The two things here that cost real money if they are wrong.
 *
 * 1. NEVER INVENT AN ACCOUNT. With no receiving account the panel must say so
 *    rather than fall back on the frame's illustrative Kuda details, which
 *    would send a school's transfer to a number nobody sourced.
 * 2. A REPEAT IS NOT A FAILURE. The bank reference is an idempotency key, and
 *    the backend answers a second submission with the ORIGINAL transaction and
 *    a message saying it was already recorded. The panel must show that
 *    message, not a generic "sent" line and not an error.
 */

const account: ReceivingAccount = {
  bankName: "Kuda Bank",
  accountNumber: "3004167012",
  accountName: "Nevo Learning Limited",
  currency: "NGN",
};

const outcome = (
  message: string | null,
  status: PaymentOutcome["status"] = "pending",
): PaymentOutcome => ({
  transactionId: "t1",
  invoiceId: "i3",
  reference: "FBN-TRF-99183",
  status,
  invoicePaid: false,
  message,
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
      onRecord={vi.fn(async () => outcome("Payment sent, pending verification."))}
      onRecorded={vi.fn()}
      {...over}
    />,
  );

/** Open the form, type a valid reference, and press Record. */
async function submit(
  ui: ReturnType<typeof panel>,
  reference = "FBN-TRF-99183",
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
  await waitFor(() =>
    expect((getByText("Record transfer") as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );
  (getByText("Record transfer") as HTMLElement).click();
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

  it("shows the backend's own words when a transfer was already recorded", () => {
    const t = visibleText(
      panel({ recorded: outcome("This transfer was already recorded.") })
        .container,
    );
    expect(t).toMatch(/This transfer was already recorded\./);
    // Not dressed up as a fresh submission, and not as an error.
    expect(t).not.toMatch(/didn't record/);
  });

  it("falls back to a plain pending line when the backend sent no message", () => {
    const t = visibleText(panel({ recorded: outcome(null) }).container);
    expect(t).toMatch(/pending verification/i);
  });

  it("sends the trimmed reference and the invoice id", async () => {
    const onRecord = vi.fn(async () => outcome("ok"));
    const { getByText, container } = panel({ onRecord });

    (getByText(/made this transfer/i) as HTMLElement).click();
    await waitFor(() =>
      expect(container.querySelector("input")).not.toBeNull(),
    );

    const input = container.querySelector("input") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;
    setter.call(input, "  FBN-TRF-99183  ");
    input.dispatchEvent(new Event("input", { bubbles: true }));

    await waitFor(() =>
      expect(
        (getByText("Record transfer") as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    (getByText("Record transfer") as HTMLElement).click();

    await waitFor(() => expect(onRecord).toHaveBeenCalledTimes(1));
    expect(onRecord).toHaveBeenCalledWith("i3", "FBN-TRF-99183");
  });

  it("will not submit a reference shorter than the API allows", async () => {
    const onRecord = vi.fn(async () => outcome("ok"));
    const { getByText, container } = panel({ onRecord });
    (getByText(/made this transfer/i) as HTMLElement).click();
    await waitFor(() =>
      expect(container.querySelector("input")).not.toBeNull(),
    );

    const input = container.querySelector("input") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;
    setter.call(input, "ab");
    input.dispatchEvent(new Event("input", { bubbles: true }));

    await waitFor(() =>
      expect((getByText("Record transfer") as HTMLButtonElement).disabled).toBe(
        true,
      ),
    );
    expect(onRecord).not.toHaveBeenCalled();
  });
  it("does not treat a declined transfer as one on file", async () => {
    /*
     * A 200 carrying `status: "failed"` was stored as a recorded transfer: the
     * invoice row flipped to "Pending verification" and the panel said the
     * money was on its way. The admin stops chasing it, the invoice stays
     * unpaid, and nothing on the screen ever says so.
     */
    const onRecorded = vi.fn();
    const ui = panel({
      onRecord: vi.fn(async () => outcome("We couldn't match that reference.", "failed")),
      onRecorded,
    });

    await submit(ui);

    await waitFor(() =>
      expect(visibleText(ui.container)).toMatch(/couldn't match that reference/i),
    );
    // Never handed upward, so no invoice row can claim it.
    expect(onRecorded).not.toHaveBeenCalled();
    expect(visibleText(ui.container)).not.toMatch(/pending verification/i);
    // Their reference survives, and the button is pressable again.
    expect((ui.container.querySelector("input") as HTMLInputElement).value).toBe(
      "FBN-TRF-99183",
    );
  });

  it("treats an abandoned transfer the same way", async () => {
    const onRecorded = vi.fn();
    const ui = panel({
      onRecord: vi.fn(async () => outcome(null, "abandoned")),
      onRecorded,
    });
    await submit(ui);
    await waitFor(() =>
      expect(visibleText(ui.container)).toMatch(/didn't record/i),
    );
    expect(onRecorded).not.toHaveBeenCalled();
  });

  it("passes a genuinely accepted transfer upward", async () => {
    const onRecorded = vi.fn();
    const ui = panel({
      onRecord: vi.fn(async () => outcome("Payment sent.", "success")),
      onRecorded,
    });
    await submit(ui);
    await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1));
    expect(visibleText(ui.container)).not.toMatch(/didn't record/i);
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
