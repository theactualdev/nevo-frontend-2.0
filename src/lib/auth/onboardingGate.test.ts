import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import {
  isOnboardingRequired,
  ONBOARDING_CONTINUE_ROUTE,
  onboardingDoor,
  onboardingPath,
} from "./onboardingGate";

/**
 * Lydia, 17 Oct (SCRUM-244): all four onboarding modules run before any
 * lesson. The deployed backend refuses a student's lesson reads, `next-work`
 * and the adaptation context with 409 `onboarding_required` until they have
 * (`learning_runtime.require_onboarding`). The half that can be wrong is who
 * is sent, on what, from where, and to where.
 */
const GATE = {
  detail: {
    code: "onboarding_required",
    message: "Finish getting started before opening a lesson.",
    missingModules: ["domain_probe"],
    navigatesTo: "/student/onboarding",
  },
};
const LESSON = "/student/lessons/les-1";

describe("onboardingDoor", () => {
  it("sends a child refused a lesson to finish onboarding", () => {
    expect(onboardingDoor("student", 409, GATE, LESSON)).toBe(
      "/student/onboarding/continue",
    );
  });

  it("does not follow the server's /student/onboarding literally", () => {
    // That is Welcome, the first door of the flow that MAKES an account, and
    // `proxy.ts` bounces a signed-in child from it to Home - whose lessons
    // answer 409 again.
    expect(onboardingDoor("student", 409, GATE, LESSON)).not.toBe(
      "/student/onboarding",
    );
  });

  it("does nothing for staff, another 409, or another code", () => {
    expect(onboardingDoor("teacher", 409, GATE, LESSON)).toBeNull();
    expect(onboardingDoor("senco_admin", 409, GATE, LESSON)).toBeNull();
    expect(onboardingDoor("student", 409, { detail: "conflict" }, LESSON)).toBeNull();
    expect(
      onboardingDoor("student", 409, { detail: { code: "probe_item_stale" } }, LESSON),
    ).toBeNull();
    expect(onboardingDoor("student", 403, GATE, LESSON)).toBeNull();
  });

  it("never moves a child who is already finishing onboarding", () => {
    // A refusal met there must not reload the flow that is finishing it.
    expect(
      onboardingDoor("student", 409, GATE, "/student/onboarding/continue"),
    ).toBeNull();
    expect(
      onboardingDoor("student", 409, GATE, "/student/onboarding/sequence"),
    ).toBeNull();
  });
});

describe("onboardingPath - only /student/onboarding paths are honoured", () => {
  it("takes an onboarding path that finishes rather than makes an account", () => {
    expect(onboardingPath("/student/onboarding/continue")).toBe(
      "/student/onboarding/continue",
    );
    expect(onboardingPath("/student/onboarding/continue/")).toBe(
      "/student/onboarding/continue",
    );
  });

  it("refuses the account-making doors", () => {
    for (const door of [
      "/student/onboarding",
      "/student/onboarding/",
      "/student/onboarding/school",
      "/student/onboarding/teacher-join",
      "/student/onboarding/sequence",
    ]) {
      expect(onboardingPath(door)).toBe(ONBOARDING_CONTINUE_ROUTE);
    }
  });

  it("refuses anything that is not a bare onboarding path", () => {
    for (const elsewhere of [
      "/student/dashboard",
      "/admin",
      "https://example.com/student/onboarding",
      "//example.com/student/onboarding",
      "/student/onboarding/../dashboard",
      "/student/onboarding/continue?next=/admin",
      "/student/onboardingx",
      "",
      null,
      42,
    ]) {
      expect(onboardingPath(elsewhere)).toBe(ONBOARDING_CONTINUE_ROUTE);
    }
  });
});

describe("isOnboardingRequired", () => {
  it("is the gate's refusal and nothing else", () => {
    expect(isOnboardingRequired(new ApiError(409, "x", GATE))).toBe(true);
    expect(isOnboardingRequired(new ApiError(409, "x"))).toBe(false);
    expect(isOnboardingRequired(new ApiError(404, "x", GATE))).toBe(false);
    expect(isOnboardingRequired(new Error("x"))).toBe(false);
    expect(isOnboardingRequired(null)).toBe(false);
  });
});
