/**
 * Lesson Player modality + density enums (Product Arch §Lesson experience;
 * FE Architecture §4). The upload pipeline tags each segment with the modalities
 * it supports (minimum two); the player only ever offers what's available.
 */

/** Content channels a segment can be presented through. */
export const MODALITY = {
  TEXT: "text",
  VISUAL: "visual",
  AUDIO: "audio",
  INTERACTIVE: "interactive",
} as const;

export type Modality = (typeof MODALITY)[keyof typeof MODALITY];

/**
 * Reading-density adaptations for the Text modality (the Adaptive Toggle Bar:
 * Simplify / Expand / Slower). Each reshapes the SAME segment — not new content.
 */
export const DENSITY = {
  SIMPLIFY: "simplify",
  EXPAND: "expand",
  SLOWER: "slower",
} as const;

export type Density = (typeof DENSITY)[keyof typeof DENSITY];
