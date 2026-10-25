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

  it("covers every reason the deployed enum carries (24 Oct: twenty)", () => {
    const deployed = [
      "deterministic_parse_used", "unmarkable_question", "fewer_than_two_modalities",
      "interactive_activity_missing", "audio_generation_failed",
      "calculation_audio_generation_failed", "visual_generation_failed",
      "visual_variant_image_generation_failed", "calculation_variant_malformed",
      "calculation_variant_missing_answer", "calculation_variant_too_few_steps",
      "calculation_step_missing_prompt", "calculation_step_unknown_input_type",
      "calculation_step_missing_answer", "calculation_step_missing_options",
      "calculation_variant_missing_manipulative",
      "calculation_segment_has_no_interactive_delivery", "model_flagged_for_review",
      "depth_variant_review_required", "optional_media_pending_review",
    ];
    expect(Object.keys(REVIEW_REASON_COPY).sort()).toEqual([...deployed].sort());
    for (const reason of deployed) expect(reasonCopy(reason)).not.toMatch(/doesn.t recognise/);
  });

  it("says Osmosis section 4's reason in words", () => {
    expect(reasonCopy("depth_variant_review_required")).toBe(
      "Nevo wrote a simpler and a longer version of this section. Children don't get them until they're approved.",
    );
  });
});
