import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

/**
 * "Request another account" was a PRIMARY NAVY BUTTON THAT DID NOTHING.
 *
 * `<button type="button">` with no `onClick`, no handler, and no `<form>`
 * anywhere in the file to catch a submit — sitting under copy promising
 * "We'll add it at no charge - just ask", and inert when asked. It broke this
 * console's own stated law, at `SettingsView.tsx`: a screen that appears to
 * act and does not is worse than one that admits the control is not built.
 *
 * The old marker read "TODO(api): no endpoint requests an extra account",
 * which was true and beside the point. No bespoke endpoint is needed —
 * `POST /api/v1/feedback` is deployed, consumed, and carries `context`.
 *
 * These mount the REAL view. An earlier draft of this file re-implemented the
 * control inside the test and would have passed with the button still dead,
 * which is the exact failure mode this repo keeps naming.
 */

const { submit, getSchool } = vi.hoisted(() => ({
  submit: vi.fn(),
  getSchool: vi.fn(),
}));

vi.mock("@/lib/api/feedback", () => ({ feedbackApi: { submit } }));
vi.mock("@/lib/api/school", () => ({
  schoolApi: { get: getSchool },
  readOnboarding: () => ({ band: "starter" }),
}));

import { AdminTeamView } from "./AdminTeamView";
import { teamApi } from "@/lib/api/team";

const MEMBERS = [
  {
    userId: "u1",
    adminId: "a1",
    email: "head@brightgate.edu.ng",
    firstName: "Ada",
    lastName: "Nwosu",
    role: "senco_admin",
    status: "active",
    scopes: ["oversight"],
  },
  {
    userId: "u2",
    adminId: "a2",
    email: "it@brightgate.edu.ng",
    firstName: "Bem",
    lastName: "Tor",
    role: "other_admin",
    status: "active",
    scopes: ["integrations"],
  },
];

beforeEach(() => {
  submit.mockReset();
  submit.mockResolvedValue({});
  getSchool.mockResolvedValue({ id: "sch", name: "Brightgate" });
  // The server's two-seat limit, so two members puts the school at its
  // allowance and the at-allowance card - the only place this control exists -
  // renders.
  vi.spyOn(teamApi, "list").mockResolvedValue({
    members: MEMBERS,
    seatLimit: 2,
    seatsUsed: 2,
    seatsRemaining: 0,
  } as never);
});

const openAtAllowance = async () => {
  render(<AdminTeamView />);
  return screen.findByRole("button", { name: /Request another account/i });
};

const press = () =>
  fireEvent.click(
    screen.getByRole("button", { name: /Request another account/i }),
  );

describe("the control", () => {
  it("is no longer inert — pressing it actually sends something", async () => {
    // The defect in one line: this expectation failed against the old button
    // for the simple reason that it had no handler at all.
    await openAtAllowance();
    press();

    await screen.findByText(/Asked\./i);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("uses the deployed feedback route rather than provisioning a seat", async () => {
    // Nothing on this screen should create an admin account. The ask is a
    // sentence to a human, under copy that says "just ask".
    await openAtAllowance();
    press();

    await screen.findByText(/Asked\./i);
    const payload = submit.mock.calls[0][0];
    expect(payload.type).toBe("account_request");
    expect(payload.context).toBe("/admin/team");
    expect(payload.note).toMatch(/admin accounts are in use/i);
  });

  it("confirms, rather than leaving the press ambiguous", async () => {
    await openAtAllowance();
    press();

    expect(await screen.findByText(/Asked\./i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Request another account/i }),
    ).not.toBeInTheDocument();
  });

  it("does not send twice", async () => {
    await openAtAllowance();
    press();
    await screen.findByText(/Asked\./i);
    expect(submit).toHaveBeenCalledTimes(1);
  });
});

describe("when the send fails", () => {
  it("says so, and never claims the request went in", async () => {
    // The dangerous failure: an admin who believes they have asked waits for
    // a reply that is never coming.
    submit.mockReset();
    submit.mockRejectedValueOnce(new Error("nope"));
    await openAtAllowance();
    press();

    expect(await screen.findByText(/didn.t send/i)).toBeInTheDocument();
    expect(screen.queryByText(/Asked\./i)).not.toBeInTheDocument();
  });

  it("is never a dead end — it names a route that still works", async () => {
    submit.mockReset();
    submit.mockRejectedValueOnce(new Error("nope"));
    await openAtAllowance();
    press();

    expect(
      await screen.findByText(/support@nevolearning\.com/i),
    ).toBeInTheDocument();
  });
});
