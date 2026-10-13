import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import manifest from "./manifest";
import { proxy } from "@/proxy";

/**
 * The installed app opened on the marketing page, whose only sign-in is the
 * admin door, so a tablet with Nevo on its home screen never reached a child's
 * sign-in or Home. IA 31: "App opens, active session -> Student Home
 * Dashboard; no session -> Student Login Screen".
 */
describe("the installed app", () => {
  const start = () => manifest().start_url!;

  it("does not open on the marketing page", () => {
    expect(start()).not.toBe("/");
  });

  it("opens a signed-out tablet on the student sign-in", () => {
    const res = proxy(new NextRequest(new URL(start(), "https://nevo.test")));

    expect(res.headers.get("location")).toBe(
      "https://nevo.test/auth/login?next=%2Fstudent",
    );
  });

  it("lets a signed-in child through to Home", () => {
    const req = new NextRequest(new URL(start(), "https://nevo.test"), {
      headers: { cookie: "nevo.role=student" },
    });

    // No redirect from the guard; `/student` itself sends on to the dashboard.
    expect(proxy(req).headers.get("location")).toBeNull();
  });
});
