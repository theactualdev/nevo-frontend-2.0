import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import {
  isOnboardingRequired,
  ONBOARDING_CONTINUE_ROUTE,
  onboardingDoor,
  onboardingPath,
  returnPathOf,
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
  it("sends a child refused a lesson to finish onboarding, and back", () => {
    expect(onboardingDoor("student", 409, GATE, LESSON)).toBe(
      `/student/onboarding/continue?next=${encodeURIComponent(LESSON)}`,
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

/*
 * THE WAY BACK, from the 20 Oct production run: a child who tapped Start on a
 * lesson finished the probe and landed on Home, not in the lesson.
 */
describe("onboardingDoor - the page the child was refused rides along", () => {
  const ASSIGNED = "?assignment=7d2f1e4b-1111-4222-8333-999988887777";

  it("carries the lesson's assignment back too", () => {
    expect(onboardingDoor("student", 409, GATE, LESSON, ASSIGNED)).toBe(
      `/student/onboarding/continue?next=${encodeURIComponent(LESSON + ASSIGNED)}`,
    );
  });

  it("carries Home back as Home, which is harmless", () => {
    expect(onboardingDoor("student", 409, GATE, "/student/dashboard")).toBe(
      `/student/onboarding/continue?next=${encodeURIComponent("/student/dashboard")}`,
    );
  });

  it("carries nothing it would not send a child back to", () => {
    expect(
      onboardingDoor("student", 409, GATE, LESSON, "?next=//evil.example"),
    ).toBe(ONBOARDING_CONTINUE_ROUTE);
    expect(onboardingDoor("student", 409, GATE, "/student/lessons/a.b")).toBe(
      ONBOARDING_CONTINUE_ROUTE,
    );
  });

  it("adds nothing to an onboarding path the server names other than continue", () => {
    const named = {
      detail: { ...GATE.detail, navigatesTo: "/student/onboarding/probe" },
    };
    expect(onboardingDoor("student", 409, named, LESSON)).toBe(
      "/student/onboarding/probe",
    );
  });
});

describe("returnPathOf - only a plain student page is a way back", () => {
  it("takes a lesson link, with and without its assignment", () => {
    const lesson = "/student/lessons/9c1e77aa-1111-4222-8333-444455556666";
    expect(returnPathOf(lesson)).toBe(lesson);
    expect(
      returnPathOf(`${lesson}?assignment=7d2f1e4b-1111-4222-8333-999988887777`),
    ).toBe(`${lesson}?assignment=7d2f1e4b-1111-4222-8333-999988887777`);
    expect(returnPathOf("/student/lessons/x?assignment=a%2Db")).toBe(
      "/student/lessons/x?assignment=a%2Db",
    );
    expect(returnPathOf("/student/dashboard")).toBe("/student/dashboard");
  });

  it("never takes an onboarding route", () => {
    for (const onboarding of [
      "/student/onboarding",
      "/student/onboarding/",
      "/student/onboarding/continue",
      "/student/onboarding/continue?next=%2Fstudent%2Flessons%2Fx",
      "/student/onboarding/sequence",
      "/student/onboardingx",
    ]) {
      expect(returnPathOf(onboarding)).toBeNull();
    }
  });

  it("never takes anything that could leave the student app", () => {
    for (const elsewhere of [
      "//evil.com",
      "//evil.com/student/lessons/x",
      "/student//evil.com",
      "/student//lessons/x",
      "/student/lessons//x",
      "/student/../x",
      "/student/lessons/x/..",
      "/student/lessons/x.html",
      "https://evil.com/student/lessons/x",
      "/student\\lessons\\x",
      "/student/lessons/x\\",
      "/student/lessons/x?next=https://evil.com",
      "/student/lessons/x?next=//evil.com",
      "/student/lessons/x#top",
      "/student/lessons/x?a=b c",
      "/teacher/classes/c-1",
      "/admin",
      "/student",
      "student/lessons/x",
      "",
    ]) {
      expect(returnPathOf(elsewhere)).toBeNull();
    }
  });

  it("never takes a value that is not one string", () => {
    for (const odd of [null, undefined, 42, ["/student/lessons/x"], {}]) {
      expect(returnPathOf(odd)).toBeNull();
    }
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
