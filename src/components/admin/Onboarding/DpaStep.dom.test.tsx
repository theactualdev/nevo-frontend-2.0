import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import type { DpaAgreement } from "@/lib/api/school";
import { DpaStep } from "./DpaStep";

/**
 * Design's 7 Sep ruling: tapping Continue without ticking the box shows an
 * inline message, not a modal and not silence.
 *
 * That required enabling the button — it was `disabled={!accepted}`, so the tap
 * could never happen. The gate that must NOT soften is read-to-end: this
 * screen's whole point is that a school can read the agreement in the product
 * before agreeing to it, so Continue stays disabled until the pane is scrolled.
 *
 * jsdom gives every element a scrollHeight of 0, so the "nothing to scroll"
 * branch treats the pane as read on mount — which is the state these tests
 * need. It runs in a `setTimeout(0)`, though, so every test here waits for
 * Continue to be ENABLED rather than merely present. Waiting only for the
 * element passed in isolation and failed under a loaded suite, because the
 * click landed on a still-disabled button and did nothing.
 */

/** Continue, once the read gate has opened. */
async function enabledContinue(getByText: (t: string) => HTMLElement) {
  const btn = () => getByText("Continue") as HTMLButtonElement;
  await waitFor(() => expect(btn().disabled).toBe(false));
  return btn();
}

// Forwards EVERY argument. An earlier version of this mock forwarded only the
// first, which made the "sends only the version" assertion below structurally
// unable to fail - a second argument was swallowed before the spy saw it.
const acceptDpa = vi.fn(async (...args: unknown[]) => {
  void args;
  return {
    id: "a1",
    schoolId: "s1",
    version: "0.9-draft",
    acceptedByUserId: "u1",
    acceptedByName: "Mrs. Adebayo",
    acceptedAt: "2026-09-08T09:00:00Z",
  };
});
/** The agreement as the server states it (8 Oct) - its version is the one accepted. */
const AGREEMENT: DpaAgreement = {
  version: "2026-10",
  schoolId: "s1",
  schoolName: "Brightgate Academy",
  schoolAddress: "12 Awolowo Road, Ikoyi, Lagos",
  contractStart: "2026-09-01T00:00:00Z",
  contractEnd: "2027-08-31T00:00:00Z",
  controller: "The school",
  processor: "Nevo Learning Limited",
  summary: ["The school remains the data controller for its learners and staff."],
};
const dpaAgreement = vi.fn(async () => AGREEMENT);
vi.mock("@/lib/api/school", () => ({
  schoolApi: {
    acceptDpa: (...args: unknown[]) => acceptDpa(...args),
    dpaAgreement: () => dpaAgreement(),
  },
}));

const shown = (c: HTMLElement) => (c.textContent ?? "").replace(/\u2019/g, "'");

const renderStep = () =>
  render(
    <DpaStep schoolName="Brightgate Academy" onBack={() => {}} onDone={() => {}} />,
  );

describe("DpaStep acceptance gate", () => {
  it("says why, inline, when Continue is tapped unticked", async () => {
    const { container, getByText } = renderStep();
    const go = await enabledContinue(getByText);

    expect(shown(container)).not.toMatch(/Please accept the terms/);
    go.click();

    await waitFor(() =>
      expect(shown(container)).toMatch(
        /Please accept the agreement to continue/,
      ),
    );
    // Inline only - the ruling was explicit that this is not a modal.
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("clears the message once the box is ticked", async () => {
    const { container, getByText } = renderStep();
    const go = await enabledContinue(getByText);
    go.click();
    await waitFor(() => expect(shown(container)).toMatch(/Please accept/));

    (container.querySelector('[role="checkbox"]') as HTMLElement).click();

    await waitFor(() => expect(shown(container)).not.toMatch(/Please accept/));
  });

  it("records the acceptance as a typed record, sending only the version", async () => {
    // The admin and the timestamp are stamped server-side from the session, so
    // neither is sent - and neither can drift from what actually happened.
    const { container, getByText } = renderStep();
    const go = await enabledContinue(getByText);
    (container.querySelector('[role="checkbox"]') as HTMLElement).click();
    await waitFor(() =>
      expect(shown(container)).not.toMatch(/Please accept/),
    );
    go.click();
    await waitFor(() => expect(acceptDpa).toHaveBeenCalledTimes(1));
    expect(acceptDpa.mock.calls[0]).toHaveLength(1);
    // The server's version, never a local one the backend has not heard of.
    expect(acceptDpa.mock.calls[0][0]).toBe("2026-10");
  });

  it("keeps Continue shut until the agreement has been read", () => {
    // The read gate is legal, not cosmetic - this screen exists so a school
    // CAN read the agreement before agreeing. Asserted synchronously, at first
    // paint, before the "nothing to scroll" effect opens the gate.
    const { getByText } = renderStep();
    expect((getByText("Continue") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("the agreement as the server states it (8 Oct)", () => {
  it("leads with the parties, this school's address and term, and the server's summary", async () => {
    const { container } = renderStep();
    await waitFor(() => expect(shown(container)).toMatch(/Nevo Learning Limited/));
    const text = shown(container);
    expect(text).toMatch(/Brightgate Academy, 12 Awolowo Road, Ikoyi, Lagos/);
    expect(text).toMatch(/1 September 2026 to 31 August 2027/);
    expect(text).toMatch(/The school remains the data controller for its learners and staff\./);
    expect(text).toMatch(/Version 2026-10/);
    expect(text).not.toMatch(/0\.9-draft/);
  });

  it("leaves off a term it was not given, rather than a blank", async () => {
    dpaAgreement.mockResolvedValueOnce({ ...AGREEMENT, contractStart: null, contractEnd: null, schoolAddress: null });
    const { container } = renderStep();
    await waitFor(() => expect(shown(container)).toMatch(/Nevo Learning Limited/));
    expect(shown(container)).not.toMatch(/Contract/);
  });

  it("accepts nothing while the version is unknown, and offers a retry", async () => {
    dpaAgreement.mockRejectedValueOnce(new Error("500"));
    const { container, getByText } = renderStep();
    await waitFor(() => expect(shown(container)).toMatch(/the agreement's version and details/));
    expect((getByText("Continue") as HTMLButtonElement).disabled).toBe(true);
    getByText("Try again").click();
    await waitFor(() => expect((getByText("Continue") as HTMLButtonElement).disabled).toBe(false));
  });
});
