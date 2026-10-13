import { describe, expect, it } from "vitest";
import { safeNextPath, withNext } from "./nextPath";

/**
 * `?next=` arrives in a URL, and a URL is something anyone can send a child.
 *
 * The danger is not theoretical: this value decides where a child lands with a
 * live session immediately after signing in. A hostile one takes them off Nevo
 * at the exact moment they are most likely to follow.
 */

describe("safeNextPath", () => {
  it("keeps a real route", () => {
    expect(safeNextPath("/student/lessons/frac-3")).toBe(
      "/student/lessons/frac-3",
    );
  });

  it("drops a protocol-relative path, which is a host wearing a path's clothes", () => {
    // `//evil.test/x` LOOKS like a path and browsers read it as a host.
    expect(safeNextPath("//evil.test/x")).toBeUndefined();
  });

  it("drops the backslash spelling of the same trick", () => {
    // Some browsers normalise `/\` to `//` before resolving.
    expect(safeNextPath("/\\evil.test")).toBeUndefined();
    // Sanity: the literal above really does carry a backslash. Without
    // this the string is just "/evil.test" and the test asserts nothing.
    expect("/\\evil.test").toHaveLength(11);
  });

  it("drops an absolute URL", () => {
    expect(safeNextPath("https://evil.test")).toBeUndefined();
    expect(safeNextPath("http://evil.test")).toBeUndefined();
  });

  it("drops a relative path, which resolves against wherever we happen to be", () => {
    expect(safeNextPath("dashboard")).toBeUndefined();
  });

  it("drops nothing at all", () => {
    expect(safeNextPath(null)).toBeUndefined();
    expect(safeNextPath(undefined)).toBeUndefined();
    expect(safeNextPath("")).toBeUndefined();
  });

  it("is not fooled by leading whitespace", () => {
    // A trimmed value that then starts with `//` is still a host.
    expect(safeNextPath("  //evil.test")).toBeUndefined();
    expect(safeNextPath("  /student/dashboard")).toBe("/student/dashboard");
  });
});

describe("withNext", () => {
  it("carries the destination to the next door", () => {
    expect(withNext("/auth/sign-in", "/student/lessons/frac-3")).toBe(
      "/auth/sign-in?next=%2Fstudent%2Flessons%2Ffrac-3",
    );
  });

  it("leaves a bare door bare when there is nowhere to go back to", () => {
    // No dangling `?next=`, which the doors would read as an empty path.
    expect(withNext("/auth/login", undefined)).toBe("/auth/login");
    expect(withNext("/auth/login", "")).toBe("/auth/login");
  });

  it("round-trips through the door that reads it", () => {
    // What one door writes, the next must read back as the same safe path.
    const url = new URL(
      withNext("/auth/login", "/student/lessons/frac-3?part=2"),
      "https://nevo.test",
    );
    expect(safeNextPath(url.searchParams.get("next"))).toBe(
      "/student/lessons/frac-3?part=2",
    );
  });
});
