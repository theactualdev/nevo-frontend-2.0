/**
 * Static mock lesson for building the Lesson Player before the backend content +
 * adaptation contracts exist. Shapes match `@/lib/types`, so wiring the real
 * the lesson-detail endpoint / `intelligenceApi.getAdaptation` later is a data-source
 * swap, not a UI change. Content here is illustrative, not curriculum-reviewed.
 */
import { ADJUSTMENT_ACTIONS, BREAK_TYPES, MODALITY, DENSITY, SCAFFOLD_LEVELS } from "@/lib/constants";
import type { AdaptationPlan, Lesson } from "@/lib/types";

export const PHOTOSYNTHESIS: Lesson = {
  id: "photosynthesis",
  title: "Photosynthesis",
  subject: "Science",
  // SCRUM-101: teacher-confirmed module structure (mock stands in for the
  // upload-step output; the 6+ default would leave a 4-segment lesson flat,
  // but the teacher can override in either direction). The recap/preview pair
  // is the Module Boundary frame's fixed example copy.
  modules: [
    {
      id: "m-introduction",
      title: "Introduction",
      segmentIds: ["intro", "inside-leaf"],
      recap:
        "You saw how leaves take in light and water, and where photosynthesis happens inside the leaf.",
    },
    {
      id: "m-practice",
      title: "Practice",
      segmentIds: ["experiment", "recap"],
      preview:
        "Now you'll try it yourself with a leaf and a glass of water.",
    },
  ],
  segments: [
    {
      id: "intro",
      // The hands-on channel for this idea is the Practice module's experiment
      // segment - the boundary preview points straight at it.
      modalities: [MODALITY.TEXT, MODALITY.VISUAL, MODALITY.AUDIO],
      text: {
        heading: "What is photosynthesis?",
        body: {
          default:
            "Photosynthesis is how green plants make their own food. Using energy from sunlight, they turn water and carbon dioxide into glucose - a sugar they use for energy - and release oxygen into the air.",
          [DENSITY.SIMPLIFY]:
            "Plants make their own food using sunlight. They take in water and carbon dioxide, and give out oxygen.",
          [DENSITY.EXPAND]:
            "Photosynthesis takes place in the chloroplasts of a plant's cells, where a green pigment called chlorophyll captures energy from sunlight. That energy drives a reaction between water, drawn up from the roots, and carbon dioxide, taken in through tiny pores in the leaves. The products are glucose, which stores the captured energy, and oxygen, which is released back into the air.",
          [DENSITY.SLOWER]: "Let's take this one small step at a time.",
        },
        slowerSteps: [
          "A leaf takes in sunlight, caught by its green colour - chlorophyll.",
          "It draws up water from the roots and takes in carbon dioxide from the air.",
          "Together these make glucose, the plant's food - and oxygen is given out.",
        ],
        keyTerms: ["chlorophyll", "chloroplast", "glucose"],
        callouts: {
          [DENSITY.SIMPLIFY]: {
            label: "IN SHORT",
            text: "Sunlight + water + carbon dioxide → food + oxygen.",
          },
          [DENSITY.EXPAND]: {
            label: "WORD EQUATION",
            text: "Carbon dioxide + Water → Glucose + Oxygen",
            sub: "…in the presence of sunlight and chlorophyll.",
          },
        },
      },
      visual: {
        heading: "See it as a picture",
        intro: "A leaf takes in three things and gives out two. Follow the arrows.",
        art: {
          id: "leaf-photosynthesis",
          alt: "A leaf photosynthesising: sunlight, water and carbon dioxide go in; glucose and oxygen come out",
          caption:
            "Inside the leaf, chloroplasts use sunlight to turn water and carbon dioxide into food.",
        },
        diagram: {
          inLabel: "TAKES IN",
          outLabel: "GIVES OUT",
          inputs: ["Sunlight", "Water", "Carbon dioxide"],
          outputs: ["Glucose", "Oxygen"],
        },
      },
      audio: {
        heading: "Listen to this one",
        intro:
          "Play it and follow along. You can pause any time, and read the words too.",
        title: "Narrated: What is photosynthesis?",
        durationSec: 48,
        transcript:
          "Photosynthesis is how green plants make their own food. Using energy from sunlight, they turn water and carbon dioxide into glucose, and release oxygen into the air.",
      },
      // Lesson Check frame's fixed quick-check copy, verbatim.
      quickCheck: {
        question: "What gas do plants take in to make their food?",
        options: [
          { id: "o2", label: "Oxygen" },
          { id: "co2", label: "Carbon dioxide" },
          { id: "n2", label: "Nitrogen" },
        ],
        correctId: "co2",
        correctNote: "That's it - plants take in carbon dioxide and give out oxygen.",
        recoveryNote: "Not quite. Let's look again.",
      },
    },
    {
      // "Inside the leaf" - the chloroplast idea, copy from the intelligence
      // layer boards (37/37b), which walk this exact segment.
      id: "inside-leaf",
      modalities: [MODALITY.TEXT, MODALITY.AUDIO],
      text: {
        heading: "Inside the leaf",
        body: {
          default:
            "Plants make their own food using sunlight. Inside their leaves, tiny parts called chloroplasts catch the light and turn water and air into sugar. That sugar is the plant's energy: it is how a plant grows without ever eating a meal.",
          [DENSITY.SIMPLIFY]:
            "Plants make their own food using sunlight. Their leaves catch the light and turn water and air into sugar.",
          [DENSITY.EXPAND]:
            "Look closely inside a leaf cell and you'll find dozens of chloroplasts - tiny green factories. Each one holds chlorophyll, the pigment that catches sunlight. That caught light powers the change of water and air into sugar, and the sugar fuels every bit of growing the plant ever does. No meals, no hunting - just light, water and air.",
          [DENSITY.SLOWER]: "Let's take this one small step at a time.",
        },
        slowerSteps: [
          "Inside every leaf are tiny parts called chloroplasts.",
          "They catch sunlight and turn water and air into sugar.",
          "That sugar is the plant's energy - it grows without ever eating a meal.",
        ],
        keyTerms: ["chloroplast", "chlorophyll"],
      },
      audio: {
        heading: "Listen to this one",
        intro:
          "Play it and follow along. You can pause any time, and read the words too.",
        title: "Narrated: Inside the leaf",
        durationSec: 36,
        transcript:
          "Plants make their own food using sunlight. Inside their leaves, tiny parts called chloroplasts catch the light and turn water and air into sugar. That sugar is the plant's energy.",
      },
      quickCheck: {
        question: "What do plants use sunlight to make?",
        options: [
          { id: "sugar", label: "Sugar (their food)" },
          { id: "water", label: "Water" },
        ],
        correctId: "sugar",
        correctNote: "That's it - the light becomes sugar, the plant's food.",
        recoveryNote: "Not quite. Let's look again.",
      },
    },
    {
      // The Practice module's hands-on stretch - the leaf-in-water experiment
      // from the Lesson Player frame's kinesthetic activity.
      id: "experiment",
      modalities: [MODALITY.INTERACTIVE, MODALITY.TEXT],
      interactive: {
        heading: "Try it yourself",
        intro:
          "See photosynthesis happen for real. Tick each step as you go - there's no rush.",
        needs: ["A fresh green leaf", "A glass of water", "A sunny windowsill"],
        steps: [
          "Put a fresh green leaf in a glass of water.",
          "Place the glass on a sunny windowsill.",
          "Wait a while, then look closely at the leaf's surface.",
        ],
        outcome: {
          pending:
            "Once you've done the steps, look for tiny bubbles on the leaf. Take your time.",
          done: "Tiny bubbles are forming on the leaf - that's oxygen, the gas photosynthesis makes.",
        },
      },
      text: {
        heading: "Try it yourself",
        body: {
          default:
            "You can watch photosynthesis happen with just a leaf and a glass of water. Put a fresh green leaf in the glass, place it on a sunny windowsill, and wait a while. Tiny bubbles will start to form on the leaf's surface - that's oxygen, the gas photosynthesis makes.",
          [DENSITY.SIMPLIFY]:
            "Put a leaf in a glass of water on a sunny windowsill. The little bubbles that appear are oxygen.",
          [DENSITY.EXPAND]:
            "The bubbles gather on the leaf because the oxygen made inside it escapes through the same tiny pores that let carbon dioxide in. In stronger light the leaf photosynthesises faster, so more bubbles appear - which is exactly why the sunny windowsill matters.",
          [DENSITY.SLOWER]: "One small step at a time.",
        },
        slowerSteps: [
          "Put a fresh green leaf in a glass of water.",
          "Place the glass somewhere sunny.",
          "The tiny bubbles that appear are oxygen - photosynthesis, happening.",
        ],
      },
    },
    {
      id: "recap",
      modalities: [MODALITY.TEXT, MODALITY.AUDIO],
      text: {
        heading: "Why it matters",
        body: {
          default:
            "Almost every breath you take uses oxygen that plants released through photosynthesis. It's one of the main ways the sun's energy reaches living things.",
          [DENSITY.SIMPLIFY]:
            "Plants give out the oxygen we breathe. That oxygen carries the sun's energy to us.",
          [DENSITY.EXPAND]:
            "Photosynthesis sits at the base of almost every food chain: the glucose plants make feeds the animals that eat them, and the oxygen they release makes animal respiration possible. In effect, it converts sunlight into a form of energy the rest of life can use.",
          [DENSITY.SLOWER]: "Let's take it one step at a time.",
        },
        slowerSteps: [
          "Plants release oxygen.",
          "Animals breathe that oxygen.",
          "So the sun's energy, captured by plants, reaches almost every living thing.",
        ],
      },
      audio: {
        heading: "Listen to this one",
        intro:
          "Play it and follow along. You can pause any time, and read the words too.",
        title: "Narrated: Why it matters",
        durationSec: 32,
        transcript:
          "Almost every breath you take uses oxygen that plants released through photosynthesis.",
      },
    },
  ],
  // The canonical four-question set from the Lesson Check + Post-Lesson frames
  // (their review-answers board lists exactly these, with the word equation as
  // the revisit item). Recovery copy is the frames' fixed text.
  assessment: {
    questions: [
      {
        prompt: "What do plants use to make their own food?",
        options: [
          { id: "swc", label: "Sunlight, water and carbon dioxide" },
          { id: "soil", label: "Soil and rainwater" },
          { id: "sugar", label: "Oxygen and sugar" },
        ],
        correctId: "swc",
        recoveryNote:
          "That one didn't land - and that's okay. Nothing to fix right now.",
      },
      {
        prompt: "Where in a plant does photosynthesis mostly happen?",
        options: [
          { id: "leaves", label: "In the leaves" },
          { id: "roots", label: "In the roots" },
          { id: "flowers", label: "In the flowers" },
          { id: "stem", label: "In the stem" },
        ],
        correctId: "leaves",
        recoveryNote:
          "That one didn't land - and that's okay. Nothing to fix right now.",
      },
      {
        prompt: "What gas do plants take in to make their food?",
        options: [
          { id: "o2", label: "Oxygen" },
          { id: "co2", label: "Carbon dioxide" },
          { id: "n2", label: "Nitrogen" },
        ],
        correctId: "co2",
        recoveryNote:
          "That one didn't land - and that's okay. Nothing to fix right now.",
      },
      {
        prompt: "Which one shows the word equation for photosynthesis?",
        options: [
          { id: "right", label: "Sunlight + water + carbon dioxide → glucose + oxygen" },
          { id: "reversed", label: "Glucose + oxygen → sunlight + water" },
        ],
        correctId: "right",
        recoveryNote:
          "That one didn't land - and that's okay. Nothing to fix right now.",
      },
    ],
    masteredConcepts: ["What photosynthesis is & needs"],
    revisitConcepts: ["The word equation"],
    resultNote:
      "You showed you understand what photosynthesis is and what a plant needs. One idea - the word equation - we'll come back to together.",
  },
  // Post-Lesson frame's fixed summary copy, verbatim (the break line is now
  // literally true: the plan schedules one consolidation break mid-lesson).
  summary: {
    recap:
      "You worked through what photosynthesis is, what a plant needs, and where it happens - and tried a few on your own. You took one break and came back focused.",
    covered: "What photosynthesis is · what a plant needs · where it happens",
  },
};

export const PHOTOSYNTHESIS_PLAN: AdaptationPlan = {
  lessonId: "photosynthesis",
  // Frame 17 baseline: the default student carries no accommodations - the
  // attention-segmented flow is the labelled "UDL · attention" variant, driven
  // per-student once profiling lands (37c). Flip to demo it.
  accommodations: { attention: false },
  // Scaffold arc (37a): support quietly withdraws as the lesson lands.
  // Affective states (37b) are spread so no segment ever stacks two asks.
  segments: [
    { segmentId: "intro", startModality: MODALITY.TEXT, density: null, suggestModality: MODALITY.VISUAL, scaffold: SCAFFOLD_LEVELS.MODERATE },
    // `show_socratic_panel`, with the intelligence boards' exact guided
    // questions for this idea.
    {
      segmentId: "inside-leaf",
      startModality: MODALITY.TEXT,
      density: null,
      suggestModality: null,
      scaffold: SCAFFOLD_LEVELS.LIGHT,
      adjustment: ADJUSTMENT_ACTIONS.SHOW_SOCRATIC_PANEL,
      socraticPrompts: [
        "Where does the plant get its energy from?",
        "What do you think the leaf does with sunlight?",
        "What might the plant make from it?",
      ],
    },
    // `offer_hint`: the unrequested hint and the guided forward glow. The
    // OFFERED consolidation break rides its own field, because §4 keeps
    // `offer_break` as a separate action and one segment carries one
    // instruction. Offered, never forced.
    {
      segmentId: "experiment",
      startModality: MODALITY.INTERACTIVE,
      density: null,
      suggestModality: null,
      scaffold: SCAFFOLD_LEVELS.FULL,
      adjustment: ADJUSTMENT_ACTIONS.OFFER_HINT,
      hint:
        "Start with where the light lands: the leaf. What do you think it does with it?",
      offerBreak: BREAK_TYPES.CONSOLIDATION,
    },
    // Slower, standing - the plan's own density. It carried `modulate_density`
    // and its chrome dim until design removed that state on 1 Oct (SCRUM-180).
    { segmentId: "recap", startModality: MODALITY.TEXT, density: DENSITY.SLOWER, suggestModality: null, scaffold: SCAFFOLD_LEVELS.MODERATE },
  ],
};

