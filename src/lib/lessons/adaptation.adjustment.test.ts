import { describe, expect, it } from "vitest";
import { toAdaptationPlan } from "./adaptation";
import { ADJUSTMENT_ACTIONS } from "@/lib/constants/affect";
import type { AdaptResponse } from "@/lib/api/intelligence";
import type { Lesson } from "@/lib/types";

/**
 * THE INSTRUCTION THE ENGINE WAS ALREADY SENDING.
 *
 * `AdaptResponse.proactiveAdjustment` carries an `action` and nothing read it,
 * so every affective intervention in the player was dead for every signed-in
 * child - the components existed and only the authored demo ever reached them.
 *
 * It was recorded as "no affective transport exists" after searching the
 * document for "frustration", "anxiety" and "boredom" and finding nothing.
 * That was the wrong search: frontend §4 says the frontend receives an
 * INSTRUCTION and never knows the state, so the absence of those words is the
 * design working. `action` is the transport.
 *
 * `action` is a bare string with no enum in the deployed schema, so these tests
 * pin the two halves that matter: §4's vocabulary is honoured, and anything
 * else does nothing rather than something.
 */

const lesson = (): Lesson =>
  ({
    id: "l-1",
    title: "Adding fractions",
    segments: [
      { id: "seg-1", modalities: ["text"], text: { heading: "H", body: { default: "B" } } },
    ],
  }) as unknown as Lesson;

const response = (
  action: string | null,
  extra: Record<string, unknown> = {},
): AdaptResponse =>
  ({
    lessonId: "l-1",
    source: "engine",
    segments: [{ segmentId: "seg-1", modality: "text", density: null, scaffolding: "light", priority: 1 }],
    breakSuggestion: null,
    modalitySuggestion: null,
    proactiveAdjustment: action
      ? {
          action,
          reason: "erratic tap coordinates on segment 1",
          confidence: 0.82,
          triggerSignals: ["tap_precision", "dwell"],
          ...extra,
        }
      : null,
  }) as unknown as AdaptResponse;

describe("the engine's proactive instruction", () => {
  it("carries each of the six actions section 4 names", () => {
    for (const action of Object.values(ADJUSTMENT_ACTIONS)) {
      const plan = toAdaptationPlan(response(action), lesson());
      expect(plan.adjustment, action).toBe(action);
    }
  });

  it("does nothing with an action it does not recognise", () => {
    // The schema declares a bare string, so a seventh value can arrive any
    // day. Rule 5: absence is an instruction, and so is a word we cannot act
    // on - render the nothing-state rather than guess which screen it meant.
    // `modulate_density` is in the list since 1 Oct: design removed it
    // (SCRUM-180), so it is now a word we do not act on like any other.
    for (const action of ["escalate_to_teacher", "", "MODULATE_DENSITY", "modulate_density", "offer hint"]) {
      const plan = toAdaptationPlan(response(action), lesson());
      expect(plan.adjustment ?? null, action).toBeNull();
    }
  });

  it("carries nothing when the engine sends no adjustment", () => {
    const plan = toAdaptationPlan(response(null), lesson());

    expect(plan.adjustment ?? null).toBeNull();
  });

  it("never carries the reasoning, the confidence or the trigger signals", () => {
    // Frame 38: "the learner is never shown any of this reasoning - no score,
    // no label, no 'you seem frustrated'." `confidence` is an engine parameter
    // besides, which rule 3 keeps off every screen. The safest place to stop
    // them is here, where they are simply not carried across.
    const plan = toAdaptationPlan(
      response(ADJUSTMENT_ACTIONS.SIMPLIFY),
      lesson(),
    );

    const serialised = JSON.stringify(plan);
    expect(serialised).not.toContain("erratic tap");
    expect(serialised).not.toContain("0.82");
    expect(serialised).not.toContain("tap_precision");
  });
});

describe("what the instruction actually shows", () => {
  /**
   * THREE OF THE FOUR AFFECTIVE RESPONSES WERE DARK.
   *
   * The actions were readable from the day they shipped; what `offer_hint` and
   * `show_socratic_panel` had no way to render was the CONTENT. Both asks were
   * filed on 17 Sep and answered on 21 Sep with `hint` and `guidedQuestions`.
   *
   * Neither is in the schema's `required` list, so an instruction arriving with
   * nothing to show is a real case, not a defensive one - and it stays the
   * nothing-state, because an empty hint card is worse than no hint.
   */
  it("carries the hint that `offer_hint` exists to show", () => {
    const plan = toAdaptationPlan(
      response(ADJUSTMENT_ACTIONS.OFFER_HINT, {
        hint: "Start with where the light lands.",
      }),
      lesson(),
    );

    expect(plan.hint).toBe("Start with where the light lands.");
  });

  it("carries the questions the socratic panel opens", () => {
    const plan = toAdaptationPlan(
      response(ADJUSTMENT_ACTIONS.SHOW_SOCRATIC_PANEL, {
        guidedQuestions: ["Where does the energy come from?", "What changes?"],
      }),
      lesson(),
    );

    expect(plan.guidedQuestions).toEqual([
      "Where does the energy come from?",
      "What changes?",
    ]);
  });

  it("ties the content to the instruction it serves", () => {
    /*
     * A hint arriving beside `simplify` is not a hint anybody asked to show.
     * The action IS the instruction; the text serves it. Dropping it here
     * beats trusting every future consumer to check which action it belongs to.
     */
    const plan = toAdaptationPlan(
      response(ADJUSTMENT_ACTIONS.SIMPLIFY, {
        hint: "Start with where the light lands.",
        guidedQuestions: ["Where does the energy come from?"],
      }),
      lesson(),
    );

    expect(plan.hint ?? null).toBeNull();
    expect(plan.guidedQuestions ?? null).toBeNull();
  });

  it("renders the nothing-state when an instruction arrives empty", () => {
    // Rule 5, and the honest case: neither field is required by the schema.
    const hintOnly = toAdaptationPlan(
      response(ADJUSTMENT_ACTIONS.OFFER_HINT),
      lesson(),
    );
    const socratic = toAdaptationPlan(
      response(ADJUSTMENT_ACTIONS.SHOW_SOCRATIC_PANEL),
      lesson(),
    );

    expect(hintOnly.adjustment).toBe(ADJUSTMENT_ACTIONS.OFFER_HINT);
    expect(hintOnly.hint ?? null).toBeNull();
    expect(socratic.guidedQuestions ?? null).toBeNull();
  });

  it("treats blank text as nothing sent", () => {
    // A whitespace hint would open a card with nothing in it.
    const plan = toAdaptationPlan(
      response(ADJUSTMENT_ACTIONS.OFFER_HINT, { hint: "   " }),
      lesson(),
    );
    const panel = toAdaptationPlan(
      response(ADJUSTMENT_ACTIONS.SHOW_SOCRATIC_PANEL, {
        guidedQuestions: ["", "  "],
      }),
      lesson(),
    );

    expect(plan.hint ?? null).toBeNull();
    expect(panel.guidedQuestions ?? null).toBeNull();
  });

  it("still never carries the reasoning, even beside content it may show", () => {
    // The distinction the new fields make sharper: these two are child-facing
    // by design; `reason` and `confidence` are the reasoning frame 38 forbids.
    const plan = toAdaptationPlan(
      response(ADJUSTMENT_ACTIONS.OFFER_HINT, {
        hint: "Start with where the light lands.",
      }),
      lesson(),
    );

    const serialised = JSON.stringify(plan);
    expect(serialised).toContain("Start with where the light lands.");
    expect(serialised).not.toContain("erratic tap");
    expect(serialised).not.toContain("0.82");
    expect(serialised).not.toContain("tap_precision");
  });
});
