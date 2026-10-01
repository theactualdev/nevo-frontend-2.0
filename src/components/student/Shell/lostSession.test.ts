import { describe, expect, it } from "vitest";
import { doorAfterLostSession } from "./lostSession";

describe("where a child goes when the session behind the cookie is gone", () => {
  it("is the PIN door, coming back to the screen they were opening", () => {
    expect(doorAfterLostSession("/student/progress")).toBe(
      "/auth/login?next=%2Fstudent%2Fprogress",
    );
  });

  it("is nowhere during onboarding, which is how a session gets made", () => {
    expect(doorAfterLostSession("/student/onboarding")).toBeNull();
    expect(doorAfterLostSession("/student/onboarding/sequence")).toBeNull();
  });
});
