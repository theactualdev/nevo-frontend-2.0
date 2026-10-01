/**
 * The looks a child can choose for their initials disc (frame 27, "Choose your
 * look").
 *
 * EIGHT COLOURS AND NOTHING ELSE, in the frame's order and with the frame's
 * values. A look is decoration the child picked; it says nothing about them,
 * it is never shown to a teacher or a parent, and nothing reads it but the
 * two discs that draw it. So the ids are colour names, not descriptions of a
 * person - there is no "calm" or "bold" here to become a label by accident.
 *
 * The translucent ones are the frame's own `rgba` values. Every surface they
 * sit on is cream, which is what the frame drew them over.
 */
export interface AvatarTone {
  id: string;
  /** What a screen reader says for the swatch. */
  label: string;
  background: string;
  text: string;
}

export const AVATAR_TONES: readonly AvatarTone[] = [
  { id: "navy", label: "Navy", background: "#3b3f6e", text: "#f7f1e6" },
  { id: "lavender", label: "Lavender", background: "#9a9ccb", text: "#f7f1e6" },
  { id: "cream", label: "Cream", background: "#ede8dc", text: "#3b3f6e" },
  { id: "ink", label: "Ink", background: "#2b2b2f", text: "#f7f1e6" },
  {
    id: "soft-navy",
    label: "Soft navy",
    background: "rgba(59,63,110,0.5)",
    text: "#f7f1e6",
  },
  {
    id: "soft-lavender",
    label: "Soft lavender",
    background: "rgba(154,156,203,0.55)",
    text: "#2b2b2f",
  },
  { id: "stone", label: "Stone", background: "#c9c3b3", text: "#2b2b2f" },
  {
    id: "soft-ink",
    label: "Soft ink",
    background: "rgba(43,43,47,0.55)",
    text: "#f7f1e6",
  },
];

/**
 * The disc every child had before this screen existed, and the one they keep
 * until they choose. Rule 5: a child who has not chosen gets the look that
 * corresponds to nothing chosen - not one picked for them.
 */
export const DEFAULT_AVATAR_TONE: AvatarTone = AVATAR_TONES[0];

/** A stored value back to a look. Anything unrecognised is no choice at all. */
export function avatarTone(id: unknown): AvatarTone {
  return AVATAR_TONES.find((t) => t.id === id) ?? DEFAULT_AVATAR_TONE;
}
