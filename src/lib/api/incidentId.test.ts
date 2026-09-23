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
  it("reads the one position backend confirmed", () => {
    /*
     * Nested under `detail`, beside `code: "unexpected_error"` - the same
     * place `apiErrorCode` reads from. Twelve lowercase hex characters,
     * `uuid4().hex[:12]`.
     */
    expect(
      incidentId({
        detail: { code: "unexpected_error", incidentId: "9f2c4a7b1d3e" },
      }),
    ).toBe("9f2c4a7b1d3e");
  });

  it("no longer looks at the top level, because nothing puts one there", () => {
    /*
     * This USED to read both positions, because the field is not in the
     * OpenAPI document and the shape was a guess. Backend settled it on
     * 23 Sep - "always nested under detail... never at top level, you can
     * drop that check" - so a top-level `incidentId` is now something this
     * client has no reason to trust.
     */
    expect(incidentId({ incidentId: "9f2c4a7b1d3e" })).toBeNull();
  });

  it("trims it", () => {
    expect(incidentId({ detail: { incidentId: "  9f2c4a7b1d3e  " } })).toBe(
      "9f2c4a7b1d3e",
    );
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
    expect(
      incidentId({ detail: { incidentId: "no incident recorded" } }),
    ).toBeNull();
  });

  it("refuses something too long to read down a phone", () => {
    expect(incidentId({ detail: { incidentId: "x".repeat(65) } })).toBeNull();
  });

  it("takes something exactly at the limit", () => {
    // The bound is inclusive, so a uuid-with-prefix does not fall off it.
    expect(incidentId({ detail: { incidentId: "x".repeat(64) } })).toBe(
      "x".repeat(64),
    );
  });

  it("refuses an empty string", () => {
    expect(incidentId({ detail: { incidentId: "" } })).toBeNull();
    expect(incidentId({ detail: { incidentId: "   " } })).toBeNull();
  });

  it("refuses a value that is not a string", () => {
    expect(incidentId({ detail: { incidentId: 12345 } })).toBeNull();
    expect(incidentId({ detail: { incidentId: { id: "a1b2" } } })).toBeNull();
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
