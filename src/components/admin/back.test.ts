import { describe, expect, it } from "vitest";
import { isAdminPath, readBack, withBack } from "./back";

/**
 * Back goes where the admin came from - and only ever somewhere in this
 * console. The parameter arrives in the URL, so it is read as untrusted.
 */

describe("withBack", () => {
  it("adds where the link was clicked from", () => {
    const href = withBack("/admin/students/s1", { href: "/admin/classes/c-2a", label: "JSS 2A" });
    const url = new URL(href, "http://x");
    expect(url.pathname).toBe("/admin/students/s1");
    expect(url.searchParams.get("back")).toBe("/admin/classes/c-2a");
    expect(url.searchParams.get("backLabel")).toBe("JSS 2A");
  });

  it("keeps a query the link already had", () => {
    const href = withBack("/admin/senco/export?student=s1", { href: "/admin/senco/s1", label: "Ada Obi" });
    const url = new URL(href, "http://x");
    expect(url.searchParams.get("student")).toBe("s1");
    expect(url.searchParams.get("back")).toBe("/admin/senco/s1");
  });

  it("nests, so a chain of pages unwinds one step at a time", () => {
    const classPage = withBack("/admin/classes/c-2a", { href: "/admin/teachers/t1", label: "Mrs Adeyemi" });
    const studentPage = withBack("/admin/students/s1", { href: classPage, label: "JSS 2A" });
    const back = readBack(Object.fromEntries(new URL(studentPage, "http://x").searchParams));
    expect(back).toEqual({ href: classPage, label: "JSS 2A" });
    const next = readBack(Object.fromEntries(new URL(back!.href, "http://x").searchParams));
    expect(next).toEqual({ href: "/admin/teachers/t1", label: "Mrs Adeyemi" });
  });
});

describe("readBack", () => {
  it("takes this console's own paths", () => {
    expect(readBack({ back: "/admin/sso", backLabel: "IT & SSO" })).toEqual({
      href: "/admin/sso",
      label: "IT & SSO",
    });
  });

  it("refuses anywhere off the console", () => {
    for (const href of [
      "https://evil.test/admin",
      "//evil.test/admin",
      "/\\evil.test",
      "/admin\\..\\x",
      "javascript:alert(1)",
      "/student/home",
      "/administrator",
    ]) {
      expect(readBack({ back: href, backLabel: "x" }), href).toBeNull();
    }
  });

  it("needs a label, and cuts a long one", () => {
    expect(readBack({ back: "/admin/classes" })).toBeNull();
    expect(readBack({ back: "/admin/classes", backLabel: "   " })).toBeNull();
    expect(readBack({ back: "/admin/classes", backLabel: "x".repeat(200) })!.label).toHaveLength(60);
  });

  it("ignores a parameter given twice", () => {
    expect(readBack({ back: ["/admin/a", "/admin/b"], backLabel: "x" })).toBeNull();
  });
});

describe("isAdminPath", () => {
  it("is the console's root and anything under it", () => {
    expect(isAdminPath("/admin")).toBe(true);
    expect(isAdminPath("/admin/classes/c?back=x")).toBe(true);
    expect(isAdminPath("/admin#top")).toBe(true);
    expect(isAdminPath("/admins")).toBe(false);
  });
});
