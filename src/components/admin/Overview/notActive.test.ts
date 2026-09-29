import { describe, expect, it } from "vitest";
import type { OnboardingState } from "@/lib/api/onboarding";
import { leadFor, momentFor, setupSteps } from "./notActive";

/**
 * D24 OB-00's spine. The stage is the server's; the counts only fill the
 * sub-lines. These pin which step is current in each of the frame's three
 * moments, and that the last step - the one nothing linked to before - leads
 * to paying.
 */

const state = (over: Partial<OnboardingState> = {}): OnboardingState => ({
  stage: "uploading",
  classes: [],
  teacherCount: 0,
  studentCount: 0,
  rejected: [],
  invoiceId: null,
  amountDue: null,
  currency: null,
  periodLabel: null,
  canConfirm: false,
  canPay: false,
  canActivate: false,
  inOnboarding: true,
  ...over,
});

const CLASS = {
  name: "JSS 1A",
  normalisedName: "jss 1a",
  yearGroup: "jss1",
  section: "A",
  studentCount: 30,
  teacherCount: 1,
};

const current = (s: OnboardingState) =>
  setupSteps(s, null).filter((x) => x.state === "current");

describe("momentFor", () => {
  it("is the invitation when nothing is uploaded", () => {
    expect(momentFor(state())).toBe("nothing_uploaded");
  });

  it("is the half-finished job once either file is in", () => {
    expect(momentFor(state({ teacherCount: 18 }))).toBe("part_uploaded");
    expect(momentFor(state({ studentCount: 340 }))).toBe("part_uploaded");
  });

  it("reads the stage for paying, not the counts", () => {
    // A confirmed roster is "to pay" whatever the counts say.
    expect(momentFor(state({ stage: "confirmed" }))).toBe("to_pay");
    expect(momentFor(state({ stage: "awaiting_payment", studentCount: 340 }))).toBe("to_pay");
  });
});

describe("setupSteps", () => {
  it("makes uploading staff the one thing to do when nothing is in", () => {
    const steps = setupSteps(state(), null);
    expect(steps.map((s) => s.state)).toEqual(["current", "todo", "todo", "todo"]);
    expect(steps[0]).toMatchObject({ action: "Upload staff", href: "/admin/roster" });
  });

  it("moves on to students once staff are in, and says how many", () => {
    const steps = setupSteps(state({ teacherCount: 18 }), null);
    expect(steps[0]).toMatchObject({ state: "done", sub: "18 teachers added", action: null });
    expect(steps[1]).toMatchObject({ state: "current", action: "Upload students" });
  });

  it("takes the files in either order", () => {
    // OB-01: "Upload either file first".
    const steps = setupSteps(state({ studentCount: 340, classes: [CLASS] }), null);
    expect(steps[1]).toMatchObject({ state: "done", sub: "340 students across 1 class" });
    expect(steps[0]).toMatchObject({ state: "current", action: "Upload staff" });
  });

  it("makes confirming current once both files are in", () => {
    const [step] = current(state({ teacherCount: 18, studentCount: 340 }));
    expect(step).toMatchObject({ n: 3, action: "Review and confirm", href: "/admin/roster" });
  });

  it("never offers paying before the roster is confirmed", () => {
    const pay = setupSteps(state({ teacherCount: 18, studentCount: 340 }), null)[3];
    expect(pay).toMatchObject({ state: "todo", action: null, href: null });
  });

  it("leads a confirmed school to the pay-and-activate screen", () => {
    /*
     * THE STEP NOTHING LINKED TO. /admin/activate had no inbound link, so a
     * school that confirmed its roster was stranded one step from the end.
     */
    const steps = setupSteps(
      state({ stage: "confirmed", teacherCount: 18, studentCount: 340, classes: [CLASS] }),
      "₦54,825,000 for 2026/27",
    );
    expect(steps.slice(0, 3).map((s) => s.state)).toEqual(["done", "done", "done"]);
    expect(steps[3]).toMatchObject({
      state: "current",
      sub: "₦54,825,000 for 2026/27",
      action: "Pay now",
      href: "/admin/activate",
    });
  });

  it("does not claim a staff count for a roster confirmed without staff", () => {
    const [staff] = setupSteps(state({ stage: "confirmed", studentCount: 340 }), null);
    expect(staff.sub).not.toMatch(/\d+ teachers? added/);
    expect(staff.sub).toMatch(/No staff file/);
  });

  it("falls back to the frame's sub-line when there is no amount to show", () => {
    const pay = setupSteps(state({ stage: "confirmed", studentCount: 1 }), null)[3];
    expect(pay.sub).toMatch(/By bank transfer/);
  });
});

describe("leadFor", () => {
  it("says nothing has been sent, in every moment before paying", () => {
    expect(leadFor(state())).toMatch(/Nothing has been sent to anyone/);
    expect(leadFor(state({ teacherCount: 18 }))).toMatch(/Your staff are in.*Still nothing sent/);
    expect(leadFor(state({ studentCount: 3 }))).toMatch(/Your students are in/);
  });

  it("is one question with one answer once confirmed", () => {
    expect(leadFor(state({ stage: "awaiting_payment" }))).toMatch(
      /roster is confirmed\. One step is left: pay for the year/,
    );
  });
});
