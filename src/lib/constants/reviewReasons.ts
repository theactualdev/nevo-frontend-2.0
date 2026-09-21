import type { SegmentReviewReason } from "@/lib/api/lessons";

/**
 * Why a section wants a look, in sentences.
 *
 * ONE COPY OF THIS, shared by the two screens that show it: the variant review
 * and, since SCRUM-153, the lesson page where the review actually happens. It
 * lived inside `LiveVariantReview` when that was the only screen with anywhere
 * to put it. A second register written for the second screen is how two
 * wordings drift apart about the same section - the mistake the roster
 * observations avoided by moving to `lib/constants/observations.ts`.
 *
 * The contract asks for this explicitly. `SegmentReviewReason`'s own
 * description: "Enumerated so the console can render its own copy per reason
 * instead of printing the raw token with underscores swapped for spaces." A
 * teacher was once shown "audio generation failed".
 *
 * EVERY LINE SAYS WHAT CAME THROUGH WRONG, never what the teacher should do
 * about it. That was right when there was no control to offer; it is still
 * right now there is, because what to do about a thin section is a teaching
 * judgement and the screen's job is to show them what Nevo did.
 */
export const REVIEW_REASON_COPY: Record<SegmentReviewReason, string> = {
  deterministic_parse_used:
    "Nevo could not read this lesson's structure on its own, so this section was split by a simpler rule. Worth checking the section starts and ends where you would put them.",
  fewer_than_two_modalities:
    "Only one way of presenting this section came through, so there is little for Nevo to choose between when a student needs it differently.",
  audio_generation_failed: "The narrated version did not generate.",
  calculation_audio_generation_failed:
    "The narration for the worked steps did not generate.",
  visual_generation_failed: "The visual version did not generate.",
  visual_variant_image_generation_failed:
    "The picture for the visual version did not generate.",

  // The nine below were live on the wire while this map held six, so each one
  // read as "a reason this console doesn't recognise yet". They say what came
  // through wrong, never what the teacher should do about it, because the
  // repair is a re-parse and this console has no control for one yet.
  //
  // "Worked steps" is the teacher-facing name for a calculation variant
  // throughout the console. Do not write "calculation variant" here.
  calculation_variant_malformed:
    "The worked steps did not come through in a form Nevo could use.",
  calculation_variant_missing_answer:
    "The worked steps came through without a final answer.",
  calculation_variant_too_few_steps:
    "The worked steps are shorter than this calculation usually needs. Worth checking nothing was skipped.",
  calculation_step_missing_prompt:
    "One of the worked steps does not ask the student to do anything.",
  calculation_step_unknown_input_type:
    "One of the worked steps expects an answer in a form Nevo does not recognise.",
  calculation_step_missing_answer:
    "One of the worked steps has no answer to check a student against.",
  calculation_step_missing_options:
    "One of the worked steps offers a choice but no options to choose from.",
  calculation_segment_has_no_interactive_delivery:
    "This section works through a calculation, but nothing came through for the student to do themselves.",
  model_flagged_for_review:
    "Nevo was not confident about this section and asked for a person to look at it.",
};

/**
 * A reason the backend adds after this console ships still has to read as
 * English. The fallback deliberately does NOT repeat the heading above it -
 * the first draft did, and a segment with an unknown reason showed the same
 * sentence twice.
 */
export function reasonCopy(reason: string): string {
  return (
    REVIEW_REASON_COPY[reason as SegmentReviewReason] ??
    "Nevo gave a reason this console doesn’t recognise yet."
  );
}
