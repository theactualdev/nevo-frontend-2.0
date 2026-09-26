import { describe, expect, it } from "vitest";
import { parentPathFromLegacyConsentLink } from "./parentConsentLink";

/**
 * Every consent email sent before 21 Sep says `/consent/parent?token=…`. The
 * page is `/parent/<token>`. Query to path is the shape that broke SCRUM-154
 * twice, so the move itself is what these pin.
 */
describe("parentPathFromLegacyConsentLink", () => {
  it("moves the token from the query into the path", () => {
    expect(parentPathFromLegacyConsentLink("abc123")).toBe("/parent/abc123");
  });

  it("leaves no query behind", () => {
    const path = parentPathFromLegacyConsentLink("abc123")!;
    expect(path).not.toMatch(/[?&]token=/);
  });

  it("keeps a URL-safe token exactly as sent", () => {
    const token = "Zk3_q-9xY.T0";
    expect(parentPathFromLegacyConsentLink(token)).toBe(`/parent/${token}`);
  });

  it("encodes a token that would otherwise change the route", () => {
    // `searchParams` has already decoded it once; a raw `/` would become a
    // second path segment and reach a route that does not exist.
    expect(parentPathFromLegacyConsentLink("a/b?c")).toBe("/parent/a%2Fb%3Fc");
  });

  it("takes the first when the token is repeated", () => {
    expect(parentPathFromLegacyConsentLink(["first", "second"])).toBe("/parent/first");
  });

  it("refuses a link with no token rather than guessing a destination", () => {
    expect(parentPathFromLegacyConsentLink(undefined)).toBeNull();
    expect(parentPathFromLegacyConsentLink("")).toBeNull();
    expect(parentPathFromLegacyConsentLink("   ")).toBeNull();
    expect(parentPathFromLegacyConsentLink([])).toBeNull();
  });
});
