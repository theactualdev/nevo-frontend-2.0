/**
 * A CHILD'S AVATAR: THE ONE DEFINITION (SCRUM-324). Every surface that draws
 * a child's avatar draws it from here, through the one `StudentAvatar`:
 * Home's top bar and sidebar, Profile and its "Choose your look" (27), the
 * shared-device picker and Login (28c), and Returning Sign-In. It used to be
 * written three times, under two sets of keys.
 *
 * A SHAPE AND A TONE, NEVER INITIALS (Lydia, 4 Nov: "Initials put a child's
 * name on a screen anyone nearby can read"). The set is the design's `Nevo
 * Avatar` (928cf30, 7 Nov): circle, rounded square, star, diamond, triangle
 * and hexagon, in three tones. The pill is gone ("at avatar size a pill and a
 * rounded square read as the same shape") and THE STAR STAYS (SCRUM-322): an
 * identity shape here, not a reward mark.
 *
 * ONE SET OF KEYS, THE SERVER'S. The avatar lives on the child (SCRUM-314),
 * and the server's words for it are `circle`, `square`, `star`, `diamond`,
 * `triangle`, `hexagon` and `navy`, `near_black`, `cream_elevated`
 * (`SharedDeviceAvatar`). The design's `roundsquare`, `dark` and `cream` are
 * the same three drawn things under its own names; nothing here uses them.
 *
 * WHERE IT IS KEPT, FOR NOW. The server holds each child's shape and tone on
 * the user, but a child's own read and write do not carry them yet: users/me
 * and `ProfilePatch` have only `avatarTone` (asked of Teslim, 7 Nov). Until
 * they do, the look a child picks is kept in `avatarTone` as
 * "<shape>-<colourway>", in the server's keys, e.g. "star-near_black". An id
 * from before - the colour-only "navy", the frame's "pill-cream" - is no
 * choice at all and reads as the default look, with no migration.
 *
 * A look is decoration the child picked. It says nothing about them, and the
 * words here are a shape and a colour, never a description of a person.
 */

/** The six, in the design's order. */
export const AVATAR_SHAPES = [
  "circle",
  "square",
  "star",
  "diamond",
  "triangle",
  "hexagon",
] as const;
export type AvatarShape = (typeof AVATAR_SHAPES)[number];

/** What a screen reader says for each shape: the frame's own words. */
const SHAPE_LABEL: Record<AvatarShape, string> = {
  circle: "circle",
  square: "rounded square",
  star: "star",
  diamond: "diamond",
  triangle: "triangle",
  hexagon: "hexagon",
};

export interface AvatarColourway {
  /** The frame's word for it: "Navy", "Dark", "Cream". */
  label: string;
  background: string;
  glyph: string;
  /** Cream sits on cream, so it carries a hairline inset ring. */
  ring: string | null;
}

/** The three tones, in the design's order and with its values. */
export const AVATAR_COLOURWAYS = {
  navy: { label: "Navy", background: "#3b3f6e", glyph: "#f7f1e6", ring: null },
  near_black: {
    label: "Dark",
    background: "#2b2b2f",
    glyph: "#f7f1e6",
    ring: null,
  },
  cream_elevated: {
    label: "Cream",
    background: "#ede8dc",
    glyph: "#3b3f6e",
    ring: "inset 0 0 0 1.5px rgba(43,43,47,0.10)",
  },
} as const satisfies Record<string, AvatarColourway>;
export type AvatarColourwayId = keyof typeof AVATAR_COLOURWAYS;
const COLOURWAY_ORDER: readonly AvatarColourwayId[] = [
  "navy",
  "near_black",
  "cream_elevated",
];

export interface AvatarLook {
  /** What is kept: "<shape>-<colourway>", in the server's keys. */
  id: string;
  shape: AvatarShape;
  colourway: AvatarColourwayId;
  /** What a screen reader says for it, e.g. "Dark star". */
  label: string;
}

/** One look, from a shape and a tone. */
export const avatarLookOf = (
  shape: AvatarShape,
  colourway: AvatarColourwayId,
): AvatarLook => ({
  id: `${shape}-${colourway}`,
  shape,
  colourway,
  label: `${AVATAR_COLOURWAYS[colourway].label} ${SHAPE_LABEL[shape]}`,
});

/** All eighteen, as 27 lays them out: navy's six, then dark's, then cream's. */
export const AVATAR_LOOKS: readonly AvatarLook[] = COLOURWAY_ORDER.flatMap(
  (colourway) => AVATAR_SHAPES.map((shape) => avatarLookOf(shape, colourway)),
);

/**
 * The look a child has until they choose: the navy circle, the one every
 * frame draws as the nothing-chosen. Not one picked for them (rule 5).
 */
export const DEFAULT_AVATAR_LOOK: AvatarLook = AVATAR_LOOKS[0];

export const isAvatarShape = (s: unknown): s is AvatarShape =>
  typeof s === "string" && (AVATAR_SHAPES as readonly string[]).includes(s);
export const isAvatarColourway = (s: unknown): s is AvatarColourwayId =>
  typeof s === "string" && Object.hasOwn(AVATAR_COLOURWAYS, s);

/**
 * A kept value back to a look: "<shape>-<colourway>" in the server's keys.
 * Anything else - an old colour id, the retired pill, a design name - is no
 * choice at all.
 */
export function avatarLook(id: unknown): AvatarLook {
  if (typeof id !== "string") return DEFAULT_AVATAR_LOOK;
  const cut = id.indexOf("-");
  const shape = id.slice(0, cut);
  const colourway = id.slice(cut + 1);
  return cut > 0 && isAvatarShape(shape) && isAvatarColourway(colourway)
    ? avatarLookOf(shape, colourway)
    : DEFAULT_AVATAR_LOOK;
}
