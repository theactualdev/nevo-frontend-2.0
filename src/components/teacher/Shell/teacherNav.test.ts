import { describe, expect, it } from "vitest";
import { LEARNING_SUPPORT_NAV, TEACHER_NAV, teacherNav } from "./teacherNav";

/**
 * C20 (design, 12 Oct): a teacher who holds Learning Support gets a sixth
 * item, last after Connect "so the core five never move". Nobody else does.
 */
describe("the rail's tabs", () => {
  it("are the five for a teacher without the role", () => {
    expect(teacherNav(false)).toEqual(TEACHER_NAV);
  });

  it("add Learning Support last for a holder, and move none of the five", () => {
    const tabs = teacherNav(true);
    expect(tabs.slice(0, 5)).toEqual(TEACHER_NAV);
    expect(tabs[5]).toEqual(LEARNING_SUPPORT_NAV);
    expect(LEARNING_SUPPORT_NAV).toEqual({
      name: "Learning Support",
      href: "/teacher/learning-support",
    });
  });
});
