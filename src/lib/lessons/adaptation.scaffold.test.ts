import { describe, expect, it } from "vitest";
import { toAdaptationPlan } from "./adaptation";
import { SCAFFOLD_LEVELS } from "@/lib/constants/scaffold";
import type { AdaptResponse } from "@/lib/api/intelligence";
import type { Lesson } from "@/lib/types";

/**
 * THE SUPPORT LEVEL IS THE ENGINE'S, OR IT IS NOTHING.
 *
 * A `scaffolding` value not in the map fell back to `light`, which is two
 * filled circles and "Nevo sets it for you" about a child the engine said
 * nothing recognisable about. Rule 5: no level, no indicator.
 */

const lesson = (): Lesson =>
  ({
    id: "l-1",
    title: "Adding fractions",
    segments: [
      { id: "seg-1", modalities: ["text"], text: { heading: "H", body: { default: "B" } } },
    ],
  }) as unknown as Lesson;

const withScaffolding = (scaffolding: string): AdaptResponse =>
  ({
    lessonId: "l-1",
    source: "engine",
    segments: [{ segmentId: "seg-1", modality: "text", density: null, scaffolding, priority: 1 }],
    breakSuggestion: null,
    modalitySuggestion: null,
    proactiveAdjustment: null,
  }) as unknown as AdaptResponse;

describe("the support level the engine sends", () => {
  it.each([
    // B17, 1 Oct: the engine saying it gives none is a level, not a silence.
    ["none", SCAFFOLD_LEVELS.NONE],
    ["light", SCAFFOLD_LEVELS.LIGHT],
    ["standard", SCAFFOLD_LEVELS.MODERATE],
    ["strong", SCAFFOLD_LEVELS.FULL],
  ])("carries %s across", (scaffolding, level) => {
    const plan = toAdaptationPlan(withScaffolding(scaffolding), lesson());

    expect(plan.segments[0].scaffold).toBe(level);
  });

  it("carries no level for a value it does not recognise, rather than light", () => {
    const plan = toAdaptationPlan(withScaffolding("maximal"), lesson());

    expect(plan.segments[0]).not.toHaveProperty("scaffold");
  });
});
