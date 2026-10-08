/**
 * Static mock lesson — "Adding Fractions" (Mathematics). Same shape as the
 * photosynthesis mock (`@/lib/types`), so the real content/adaptation contracts
 * remain a data-source swap. The calculation co-construction solver is the
 * centrepiece. Content is illustrative, not curriculum-reviewed.
 */
import { BREAK_TYPES, MODALITY, DENSITY, SCAFFOLD_LEVELS } from "@/lib/constants";
import type { CalculationVariant as WireCalculationVariant } from "@/lib/api/variants";
import { calculationFromVariant } from "@/lib/lessons/fromContent";
import type { AdaptationPlan, Lesson } from "@/lib/types";

/**
 * The walkthrough's calculation, WRITTEN AS THE PAYLOAD (SCRUM-177) and built
 * by the same adapter a signed-in child's lesson goes through, so the demo
 * cannot show a solver the payload path does not.
 *
 * Every value the solver shows is one written here: the drawing's marks and
 * labels, each step's stored answer, and the equation as it assembles. Nothing
 * is worked out on screen - not even 2 + 1.
 */
export const ADD_FIFTHS: WireCalculationVariant = {
  type: "co_construction",
  conceptId: null,
  fullEquation: "2/5 + 1/5",
  expression: "2/5 + 1/5",
  answer: "3/5",
  scaffold: {
    kind: "bar",
    parts: 5,
    rows: 1,
    marks: [2, 1],
    labels: ["2/5", "1/5"],
  },
  manipulative: null,
  steps: [
    {
      stepId: "fifths-1",
      stepNumber: 1,
      prompt: "What are the bottom numbers (denominators)?",
      expectedInput: "selection",
      input: "choice",
      options: [
        { value: "5 and 5", label: "5 and 5" },
        { value: "2 and 1", label: "2 and 1" },
      ],
      answer: "5 and 5",
      targets: [],
      hint: "Look at the number under each line.",
      confirmationText:
        "Both are 5 - the pieces are the same size, so we can add.",
      visualUpdate: "",
      assembles: "2/5 + 1/5 = ?",
      equationState: "2/5 + 1/5 = ?/5",
      unit: null,
      narrationAudio: null,
    },
    {
      stepId: "fifths-2",
      stepNumber: 2,
      prompt: "What do we add together?",
      expectedInput: "selection",
      input: "choice",
      options: [
        { value: "tops", label: "The top numbers: 2 and 1" },
        { value: "bottoms", label: "The bottom numbers: 5 and 5" },
      ],
      answer: "tops",
      targets: [],
      hint: "We add the numbers above the line.",
      confirmationText: "",
      visualUpdate: "",
      assembles: "2/5 + 1/5 = ?/5",
      equationState: "2/5 + 1/5 = ?/5",
      unit: null,
      narrationAudio: null,
    },
    {
      stepId: "fifths-3",
      stepNumber: 3,
      prompt: "So what is 2 + 1?",
      expectedInput: "numeric",
      input: "number",
      options: [],
      answer: "3",
      targets: [],
      hint: "Just add the two top numbers: 2 + 1.",
      confirmationText: "",
      visualUpdate: "",
      assembles: "2 + 1 = ?",
      equationState: "2/5 + 1/5 = 3/5",
      unit: null,
      narrationAudio: null,
    },
  ],
  completionStatement:
    "When fractions share the same bottom number, you add only the top numbers and keep the bottom the same. So 2/5 + 1/5 = 3/5.",
};

export const ADDING_FRACTIONS: Lesson = {
  id: "adding-fractions",
  title: "Adding Fractions",
  subject: "Mathematics",
  segments: [
    {
      id: "intro",
      modalities: [MODALITY.TEXT, MODALITY.VISUAL, MODALITY.AUDIO],
      text: {
        heading: "Adding fractions",
        body: {
          default:
            "Fractions are equal parts of a whole - like slices of the same pizza. When two fractions have the same bottom number, the parts are the same size, so you can add them by adding just the top numbers.",
          [DENSITY.SIMPLIFY]: "Same bottom number? Just add the top numbers.",
          [DENSITY.EXPAND]:
            "The bottom number (the denominator) tells you how many equal parts the whole is cut into. The top number (the numerator) tells you how many of those parts you have. When the bottom numbers match, the parts are the same size - so you add the top numbers and keep the bottom number the same.",
          [DENSITY.SLOWER]: "Let's take it one small step at a time.",
        },
        slowerSteps: [
          "Check the bottom numbers are the same.",
          "Add the top numbers together.",
          "Keep the bottom number the same.",
        ],
        keyTerms: ["numerator", "denominator", "whole"],
        callouts: {
          [DENSITY.SIMPLIFY]: {
            label: "IN SHORT",
            text: "Same bottom number → add the tops.",
          },
          [DENSITY.EXPAND]: {
            label: "THE RULE",
            text: "a/c + b/c = (a + b)/c",
            sub: "…only when the bottom numbers (c) match.",
          },
        },
      },
      visual: {
        heading: "See it as a picture",
        intro: "Two same-size parts join into a bigger part. Follow the arrows.",
        diagram: {
          inLabel: "SAME-SIZE PARTS",
          outLabel: "ADDED TOGETHER",
          inputs: ["1/5", "1/5"],
          outputs: ["2/5"],
        },
      },
      audio: {
        heading: "Listen to this one",
        intro:
          "Play it and follow along. You can pause any time, and read the words too.",
        title: "Narrated: Adding fractions",
        durationSec: 40,
        transcript:
          "Fractions are equal parts of a whole. When two fractions have the same bottom number, you add them by adding just the top numbers, and keeping the bottom number the same.",
      },
      quickCheck: {
        question: "When the bottom numbers are the same, which numbers do you add?",
        options: [
          { id: "top", label: "The top numbers" },
          { id: "bottom", label: "The bottom numbers" },
          { id: "both", label: "Both of them" },
        ],
        correctId: "top",
        correctNote: "That's it - add the top numbers and keep the bottom the same.",
        recoveryNote: "Not quite. Let's look again.",
      },
    },
    {
      id: "calc-add-fifths",
      modalities: [MODALITY.TEXT, MODALITY.INTERACTIVE],
      text: {
        heading: "Add them step by step",
        body: {
          default:
            "You ate 2/5 of a chocolate bar, then 1/5 more. How much did you eat in all? Both fractions have the same bottom number, so add the top numbers.",
          [DENSITY.SIMPLIFY]: "Same bottom number. Add the tops: 2 + 1.",
          [DENSITY.EXPAND]:
            "The bar is split into 5 equal pieces, so each piece is one fifth. You had 2 fifths, then 1 more fifth. Because every piece is the same size, you add the top numbers - 2 + 1 - and the bottom number stays 5.",
          [DENSITY.SLOWER]: "One small step at a time.",
        },
        slowerSteps: [
          "Check the bottom numbers match - both are 5.",
          "Add only the top numbers: 2 + 1.",
          "Keep the bottom number the same: 5.",
        ],
      },
      // Non-null variant → the Interactive modality routes to the solver (17b §8).
      calculationVariant: "co_construction",
      calculation: calculationFromVariant(ADD_FIFTHS),
    },
    {
      id: "recap",
      modalities: [MODALITY.TEXT, MODALITY.AUDIO],
      text: {
        heading: "Where you'll use this",
        body: {
          default:
            "You add fractions whenever you put equal parts together - sharing a pizza, measuring in a recipe, or adding up parts of an hour. The trick is always the same: if the bottom numbers match, add the tops.",
          [DENSITY.SIMPLIFY]:
            "You add fractions all the time - sharing food, cooking, telling the time.",
          [DENSITY.EXPAND]:
            "Any time a whole is split into equal parts, fractions let you count and combine them. Recipes, money, and time are all built on this. Later you'll add fractions whose bottoms are different - but they always come back to making the parts the same size first.",
          [DENSITY.SLOWER]: "Let's take it one step at a time.",
        },
        slowerSteps: [
          "Equal parts can be added together.",
          "If the bottoms match, add the tops.",
          "You'll use this for food, money, and time.",
        ],
      },
      audio: {
        heading: "Listen to this one",
        intro:
          "Play it and follow along. You can pause any time, and read the words too.",
        title: "Narrated: Where you'll use this",
        durationSec: 28,
        transcript:
          "You add fractions whenever you put equal parts together - sharing food, measuring in a recipe, or adding up parts of an hour.",
      },
    },
  ],
  assessment: {
    questions: [
      {
        prompt:
          "When you add fractions with the same bottom number, what do you add?",
        options: [
          { id: "top", label: "The top numbers" },
          { id: "bottom", label: "The bottom numbers" },
        ],
        correctId: "top",
      },
      {
        prompt: "What is 3/8 + 2/8?",
        options: [
          { id: "eighths", label: "5/8" },
          { id: "sixteenths", label: "5/16" },
        ],
        correctId: "eighths",
        recoveryNote:
          "That one didn't land - and that's okay. You keep the bottom number, so it's 5/8. Nothing to fix right now.",
      },
    ],
    masteredConcepts: ["Adding like fractions", "Keeping the denominator"],
    revisitConcepts: ["Fractions with different bottoms"],
    resultNote:
      "You showed you can add fractions that share a bottom number, and you kept the denominator the same. Fractions with different bottoms - we'll come to those together.",
  },
  summary: {
    recap:
      "You worked through adding fractions that share the same bottom number, pictured it with a chocolate bar, and solved one step by step - keeping the bottom number and adding the tops.",
    covered: "Same-bottom fractions · adding the numerators · a worked example",
  },
};

export const ADDING_FRACTIONS_PLAN: AdaptationPlan = {
  lessonId: "adding-fractions",
  // UDL (37c): reading renders the text spaciously. Numerical is listed as
  // the plan has it; nothing in the player reads it (see AdaptationPlan).
  accommodations: { reading: true, numerical: true },
  segments: [
    // Exercises the other break types: a micro breath after the reading
    // stretch, a movement break after the working one. Scaffold (37a) steps to
    // full through the co-construction, then eases back. The step-up offer
    // that sat here went with design's 1 Oct ruling (D28): nothing in the
    // contract can trigger it, so only this demo ever showed it.
    { segmentId: "intro", startModality: MODALITY.TEXT, density: null, suggestModality: null, breakAfter: BREAK_TYPES.MICRO, scaffold: SCAFFOLD_LEVELS.MINIMAL },
    { segmentId: "calc-add-fifths", startModality: MODALITY.INTERACTIVE, density: null, suggestModality: null, breakAfter: BREAK_TYPES.MOVEMENT, scaffold: SCAFFOLD_LEVELS.FULL },
    // ...and the full rest on the way out of the last segment, so all four
    // break types are reachable in the mock (this one lands before the
    // assessment - a real pause between learning and being asked about it).
    // Light is authored here now: it used to arrive from the player's own
    // "light" fallback, which drew a level the plan never gave (rule 5).
    { segmentId: "recap", startModality: MODALITY.TEXT, density: null, suggestModality: MODALITY.AUDIO, breakAfter: BREAK_TYPES.FULL, scaffold: SCAFFOLD_LEVELS.LIGHT },
  ],
};
