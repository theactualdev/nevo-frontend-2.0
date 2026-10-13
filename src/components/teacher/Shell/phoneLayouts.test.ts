import { describe, expect, it } from "vitest";
import { hasPhoneLayout, phoneTitle } from "./phoneLayouts";

/**
 * C19 (design, 12 Oct): a phone gets the screens drawn for one, and "every
 * other teacher screen shows the shared 'needs a bigger screen' state". A
 * route joins the list only once it is laid out for 375 wide.
 */
describe("which screens a phone is given", () => {
  it.each(["/teacher/dashboard", "/teacher/help"])("lays out %s", (path) => {
    expect(hasPhoneLayout(path)).toBe(true);
  });

  it.each([
    "/teacher/insights",
    "/teacher/lessons",
    "/teacher/lessons/upload",
    "/teacher/classes/c-1",
    "/teacher/profile",
    // Not yet: these join when their phone layouts land.
    "/teacher/students/s-1",
    "/teacher/connect",
  ])("sends %s to the bigger-screen state", (path) => {
    expect(hasPhoneLayout(path)).toBe(false);
  });

  it("does not match a deeper route by its prefix", () => {
    expect(hasPhoneLayout("/teacher/dashboard/anything")).toBe(false);
  });
});

describe("the phone app bar's title", () => {
  it("names a tab the way the rail does", () => {
    expect(phoneTitle("/teacher/dashboard")).toBe("Home");
    expect(phoneTitle("/teacher/insights")).toBe("Insights");
    expect(phoneTitle("/teacher/lessons/l-1")).toBe("Library");
  });

  it("puts a student's pages under Classes, as the rail has them", () => {
    expect(phoneTitle("/teacher/students/s-1")).toBe("Classes");
  });
});
