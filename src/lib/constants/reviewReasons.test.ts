import { describe, expect, it } from "vitest";
import { REVIEW_REASON_COPY, reasonCopy } from "./reviewReasons";

/**
 * Every reason the deployed enum carries reads as a sentence. The sixteenth,
 * `calculation_variant_missing_manipulative`, read as "a reason this console
 * doesn't recognise yet" because neither the type nor this table had it.
 */
describe("why a section wants a look", () => {
  it("has a sentence for a worked step with nothing to drag", () => {
    expect(reasonCopy("calculation_variant_missing_manipulative")).toBe(
      REVIEW_REASON_COPY.calculation_variant_missing_manipulative,
    );
    expect(reasonCopy("calculation_variant_missing_manipulative")).not.toMatch(/doesn.t recognise/);
  });

  it("still reads as English for a reason added after this shipped", () => {
    expect(reasonCopy("something_new")).toMatch(/doesn.t recognise yet/);
  });

  it("covers all sixteen", () => {
    expect(Object.keys(REVIEW_REASON_COPY)).toHaveLength(16);
  });
});
