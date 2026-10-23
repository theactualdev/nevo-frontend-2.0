import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import {
  isOnboardingRequired,
  lessonIdOf,
  ONBOARDING_CONTINUE_ROUTE,
  onboardingDoor,
  onboardingPath,
  returnPathOf,
  wayBack,
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

/*
 * SCRUM-266, Teslim 21 Oct: Module 4 is asked about the lesson a child was
 * refused, and finishing it goes back where the server says - "ProbeFinished
 * returns navigatesTo for the remembered lesson. The frontend still has to
 * follow that destination."
 */
const UUID = "9c1e77aa-1111-4222-8333-444455556666";
const OTHER = "7d2f1e4b-1111-4222-8333-999988887777";

describe("lessonIdOf - only the lesson player's route names a lesson", () => {
  it("takes the lesson's id, with or without its assignment", () => {
    expect(lessonIdOf(`/student/lessons/${UUID}`)).toBe(UUID);
    expect(lessonIdOf(`/student/lessons/${UUID}?assignment=${OTHER}`)).toBe(UUID);
    expect(lessonIdOf(`/student/lessons/${UUID.toUpperCase()}`)).toBe(
      UUID.toUpperCase(),
    );
  });

  it("names no lesson for any other page, or an id the server would refuse", () => {
    for (const other of [
      "/student/dashboard",
      "/student/lessons",
      `/student/lessons/${UUID}/review`,
      `/student/lessons/${UUID}/summary`,
      "/student/lessons/les-1",
      `/student/lessons/${UUID}x`,
      `/student/lessons/${UUID.replace(/-/g, "")}`,
      `/student/onboarding/continue?next=/student/lessons/${UUID}`,
      `https://evil.example/student/lessons/${UUID}`,
      `//evil.example/student/lessons/${UUID}`,
      undefined,
      null,
      "",
    ]) {
      expect(lessonIdOf(other)).toBeNull();
    }
  });
});

describe("wayBack - the server's way back, then the refused page", () => {
  const SERVER = `/student/lessons/${UUID}`;
  const REFUSED = `/student/lessons/${OTHER}?assignment=asg-1`;

  it("takes the first way back the server names, ahead of the refused page", () => {
    expect(wayBack([SERVER, `/student/lessons/${OTHER}`], "/student/dashboard")).toBe(
      SERVER,
    );
    expect(wayBack([null, SERVER], REFUSED)).toBe(SERVER);
    expect(wayBack([undefined, SERVER], undefined)).toBe(SERVER);
  });

  it("falls back to the refused page, and then to nothing, when the server names none", () => {
    expect(wayBack([null, undefined], REFUSED)).toBe(REFUSED);
    expect(wayBack([], REFUSED)).toBe(REFUSED);
    expect(wayBack([null, null], undefined)).toBeNull();
  });

  it("skips a way back it would not send a child to, for the next in line", () => {
    for (const bad of [
      `https://evil.example/student/lessons/${UUID}`,
      `https://nevolearning.com/student/lessons/${UUID}`,
      `//evil.example/student/lessons/${UUID}`,
      "/student/onboarding/continue",
      "/teacher/classes",
      "/student/../admin",
      42,
      "",
    ]) {
      expect(wayBack([bad, SERVER], REFUSED)).toBe(SERVER);
      expect(wayBack([bad, null], REFUSED)).toBe(REFUSED);
      expect(wayBack([bad], undefined)).toBeNull();
    }
  });

  it("never takes a refused page it would not send a child to", () => {
    expect(wayBack([], "https://evil.example/student/lessons/x")).toBeNull();
    expect(wayBack([], "/student/onboarding/continue")).toBeNull();
  });

  it("keeps the refused link's assignment when the server names that same lesson", () => {
    const same = `/student/lessons/${UUID}?assignment=asg-1`;
    expect(wayBack([SERVER], same)).toBe(same);
    expect(wayBack([null, SERVER], same)).toBe(same);
  });
});
