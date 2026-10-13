import { describe, expect, it } from "vitest";
import { toAdaptationPlan } from "./adaptation";
import { ADJUSTMENT_ACTIONS } from "@/lib/constants/affect";
import type { AdaptResponse } from "@/lib/api/intelligence";
import type { Lesson } from "@/lib/types";

/**
 * Two fields the engine's answer carried on 1 Oct and the translator dropped.
 *
 * - `guidedPrompts` (B19), beside `guidedQuestions`: the same panel, but each
 *   one has an id a reply can be sent against.
 * - `density` (D25), the engine's `DensityLevel` per segment. It was dropped
 *   on purpose while the only reading of it was "turn it into Simplify";
 *   design ruled it renders as spacing and nothing else, so it crosses as
 *   `densityLevel` and never becomes the child's own `density`.
 */

const lesson = (): Lesson =>
  ({
    id: "l-1",
    title: "Photosynthesis",
    segments: [
      { id: "seg-1", modalities: ["text"], text: { heading: "H", body: { default: "B" } } },
    ],
  }) as unknown as Lesson;

const response = (over: {
  action?: string;
  density?: string;
  guidedPrompts?: unknown;
}): AdaptResponse =>
  ({
    lessonId: "l-1",
    source: "engine",
    segments: [
      {
        segmentId: "seg-1",
        modality: "text",
        density: over.density ?? "medium",
        scaffolding: "light",
        priority: 1,
      },
    ],
    breakSuggestion: null,
    modalitySuggestion: null,
    proactiveAdjustment: over.action
      ? {
          action: over.action,
          reason: "r",
          confidence: 0.5,
          triggerSignals: [],
          guidedPrompts: over.guidedPrompts,
        }
      : null,
  }) as unknown as AdaptResponse;

const PROMPTS = [
  { id: "p-1", prompt: "Where does the plant get its energy?", options: ["The sun", "The soil"] },
  { id: "p-2", prompt: "What does the leaf do with it?" },
];

describe("guided prompts", () => {
  it("cross under show_socratic_panel, with their ids and options", () => {
    const plan = toAdaptationPlan(
      response({ action: ADJUSTMENT_ACTIONS.SHOW_SOCRATIC_PANEL, guidedPrompts: PROMPTS }),
      lesson(),
    );

    expect(plan.guidedPrompts).toEqual(PROMPTS);
  });

  it("do not cross under any other instruction", () => {
    // The action is the instruction; prompts under a hint are not a panel
    // anybody asked to open.
    const plan = toAdaptationPlan(
      response({ action: ADJUSTMENT_ACTIONS.OFFER_HINT, guidedPrompts: PROMPTS }),
      lesson(),
    );

    expect(plan).not.toHaveProperty("guidedPrompts");
  });

  it("drop a prompt with no id or no words, and an option with no words", () => {
    const plan = toAdaptationPlan(
      response({
        action: ADJUSTMENT_ACTIONS.SHOW_SOCRATIC_PANEL,
        guidedPrompts: [
          { id: "", prompt: "No id" },
          { id: "p-blank", prompt: "   " },
          { id: "p-3", prompt: " Kept ", options: ["", "  ", "Yes"] },
          { id: "p-4", prompt: "Kept, and no options left", options: [" "] },
        ],
      }),
      lesson(),
    );

    expect(plan.guidedPrompts).toEqual([
      { id: "p-3", prompt: "Kept", options: ["Yes"] },
      { id: "p-4", prompt: "Kept, and no options left" },
    ]);
  });

  it("leave nothing on the plan when none survive", () => {
    const plan = toAdaptationPlan(
      response({ action: ADJUSTMENT_ACTIONS.SHOW_SOCRATIC_PANEL, guidedPrompts: [] }),
      lesson(),
    );

    expect(plan).not.toHaveProperty("guidedPrompts");
  });
});

describe("the engine's density level", () => {
  it.each(["low", "medium", "high"])("carries %s as densityLevel", (level) => {
    const plan = toAdaptationPlan(response({ density: level }), lesson());

    expect(plan.segments[0].densityLevel).toBe(level);
  });

  it("never becomes the child's own density, which lights a chip", () => {
    const plan = toAdaptationPlan(response({ density: "low" }), lesson());

    expect(plan.segments[0]).not.toHaveProperty("density");
  });

  it("carries nothing for a value it does not know", () => {
    const plan = toAdaptationPlan(response({ density: "dense" }), lesson());

    expect(plan.segments[0]).not.toHaveProperty("densityLevel");
  });
});
