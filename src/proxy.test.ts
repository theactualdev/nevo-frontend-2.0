import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";
import { ROLE_COOKIE } from "@/lib/auth/session";
import { USER_ROLES } from "@/lib/constants/permissions";

/**
 * THE DOOR A BASELINE REACHED THE WRONG CHILD'S ACCOUNT THROUGH.
 *
 * `/student/onboarding` was on the pre-auth allowance, which is correct for the
 * flow and was wrong for its first screen: a child with a live session could
 * walk the whole of onboarding again - name, school, class, then the motor
 * baseline - and the measurements were taken from whoever was holding the
 * tablet while the session belonged to whoever was still signed in.
 *
 * The guard had no tests of its own, so these cover the student branch rather
 * than only the new line. Every case here is a route somebody can type.
 */

const request = (path: string, role?: string) => {
  const url = new URL(path, "https://app.nevo.test");
  const req = new NextRequest(url);
  if (role) req.cookies.set(ROLE_COOKIE, role);
  return req;
};

/** Where the guard sent this request, or null when it let it through. */
const destination = (path: string, role?: string): string | null => {
  const res = proxy(request(path, role));
  const location = res.headers.get("location");
  return location ? new URL(location).pathname : null;
};

const CHILD = USER_ROLES.STUDENT;

describe("a signed-in child at the onboarding door", () => {
  it("is sent home rather than asked to make a second account", () => {
    expect(destination("/student/onboarding", CHILD)).toBe("/student/dashboard");
  });

  it("is sent home when the path carries a trailing slash", () => {
    // Without normalising, this falls through to the pre-auth allowance and
    // renders the exact screen the case above closes.
    expect(destination("/student/onboarding/", CHILD)).toBe("/student/dashboard");
  });

  it("is let through when a join link brought them", () => {
    // A DIFFERENT child arriving on a device someone is signed into. Redeeming
    // the token replaces the session, so attribution is correct; bouncing here
    // would discard the link in silence and drop the new child into the
    // signed-in child's dashboard. The pickerless hand-over is frame 28c's.
    expect(destination("/student/onboarding?token=abc123", CHILD)).toBeNull();
  });

  it("is let through on every step after the first", () => {
    // Onboarding ends by storing the session before routing on, so these are
    // legitimately reached WITH one. Bouncing them breaks the end of the flow
    // for every new child.
    for (const step of ["name", "school", "class", "sequence", "teacher-join"]) {
      expect(
        destination(`/student/onboarding/${step}`, CHILD),
        step,
      ).toBeNull();
    }
  });
});

describe("what the guard already promised, now held down", () => {
  it("lets a child with no session onboard", () => {
    // Guarding this would make the product unusable for every new student.
    expect(destination("/student/onboarding")).toBeNull();
    expect(destination("/student/onboarding/name")).toBeNull();
  });

  it("lets a child with no session open their school's entry link", () => {
    // The link is the credential: the child has no account yet. Guarding it
    // sent them to the PIN screen, where "I'm new" dropped the token and the
    // consent hold behind the link could never be reached.
    expect(destination("/student/entry/tok-abc123")).toBeNull();
  });

  it("opens nothing else that merely starts with the same letters", () => {
    // Only the token route is the door. A prefix without the slash would have
    // opened any route that happens to start with the same letters.
    expect(destination("/student/entryway")).toBe("/auth/login");
  });

  it("sends a signed-out visitor to the child's door, not a password form", () => {
    expect(destination("/student/dashboard")).toBe("/auth/login");
  });

  it("remembers where they were headed", () => {
    const res = proxy(request("/student/lesson/l-1"));
    const url = new URL(res.headers.get("location")!);
    expect(url.searchParams.get("next")).toBe("/student/lesson/l-1");
  });

  it("does not accept a teacher's cookie as a child's", () => {
    // The mirror carries a role and this branch must read it, not merely
    // check that some session exists.
    expect(destination("/student/dashboard", USER_ROLES.TEACHER)).toBe("/auth/login");
  });

  it("bounces a signed-in child off both of their own doors", () => {
    expect(destination("/auth/login", CHILD)).toBe("/student/dashboard");
    expect(destination("/auth/sign-in", CHILD)).toBe("/student/dashboard");
  });

  it("leaves those doors open to a child who is not signed in", () => {
    expect(destination("/auth/login")).toBeNull();
    expect(destination("/auth/sign-in")).toBeNull();
  });
});
