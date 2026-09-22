import { describe, expect, it } from "vitest";
import { incidentId } from "./client";

/**
 * The backend's reference for an error nobody planned for.
 *
 * WHY THIS EXISTS. A staged upload answered 500 on ~18 Sep and backend could
 * not find it from their side: there was nothing to match on. Every unhandled
 * error carries an `incidentId` now, and `ApiError.detail` has held the parsed
 * body all along - so the id was already reaching this client and being
 * dropped on the floor.
 *
 * WHY IT IS DEFENSIVE RATHER THAN TYPED. `incidentId` appears nowhere in the
 * deployed OpenAPI document - re-checked 22 Sep, 225 paths and 404 schemas -
 * because an unhandled error is by definition not a documented response. So
 * the shape is backend's word, both plausible shapes are read, and everything
 * that is not an identifier is refused.
 *
 * THAT LAST PART IS THE POINT OF MOST OF THIS FILE. The screen puts this under
 * "quote this if you tell us about it". Printing a Starlette error page, or a
 * proxy's own `detail` object, under that sentence would be worse than
 * printing nothing: a teacher would quote it, and it would match nothing.
 */

describe("reading the reference", () => {
  it("takes one at the top level", () => {
    expect(incidentId({ incidentId: "a1b2c3d4" })).toBe("a1b2c3d4");
  });

  it("takes one nested the way FastAPI nests its error bodies", () => {
    // `apiErrorCode` beside it reads `{detail: {code}}`, so an id could
    // plausibly arrive at either depth. Both, rather than guessing one.
    expect(incidentId({ detail: { incidentId: "a1b2c3d4" } })).toBe("a1b2c3d4");
  });

  it("prefers the top level when a body somehow carries both", () => {
    expect(
      incidentId({ incidentId: "outer", detail: { incidentId: "inner" } }),
    ).toBe("outer");
  });

  it("trims it", () => {
    expect(incidentId({ incidentId: "  a1b2c3d4  " })).toBe("a1b2c3d4");
  });
});

describe("refusing everything that is not one", () => {
  it("refuses a plain-text error page", () => {
    /*
     * THE CASE THAT ACTUALLY HAPPENED. The 18 Sep 500 came back as Starlette's
     * default page, so `detail` was a long string rather than an object.
     */
    expect(incidentId("Internal Server Error")).toBeNull();
  });

  it("refuses a sentence dressed as an id", () => {
    // Whitespace is the tell: a reference has none, and a message has some.
    expect(incidentId({ incidentId: "no incident recorded" })).toBeNull();
  });

  it("refuses something too long to read down a phone", () => {
    expect(incidentId({ incidentId: "x".repeat(65) })).toBeNull();
  });

  it("takes something exactly at the limit", () => {
    // The bound is inclusive, so a uuid-with-prefix does not fall off it.
    expect(incidentId({ incidentId: "x".repeat(64) })).toBe("x".repeat(64));
  });

  it("refuses an empty string", () => {
    expect(incidentId({ incidentId: "" })).toBeNull();
    expect(incidentId({ incidentId: "   " })).toBeNull();
  });

  it("refuses a value that is not a string", () => {
    expect(incidentId({ incidentId: 12345 })).toBeNull();
    expect(incidentId({ incidentId: { id: "a1b2" } })).toBeNull();
  });

  it("refuses a body that carries no reference at all", () => {
    // Most failures. A file we could not read has a REASON, and a reason is
    // better than a reference - this must stay silent for those.
    expect(incidentId({ detail: { code: "unsupported_file" } })).toBeNull();
    expect(incidentId({})).toBeNull();
  });

  it("refuses nothing at all", () => {
    expect(incidentId(null)).toBeNull();
    expect(incidentId(undefined)).toBeNull();
  });
});
