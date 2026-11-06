/**
 * The looks a child can choose for their avatar (frame 27, "Choose your look").
 *
 * A SHAPE ON A TILE, NEVER INITIALS. Lydia, 4 Nov: "Initials put a child's
 * name on a screen anyone nearby can read", and "Frame 27 is correct and the
 * build changes." The hub, 5 Nov: option (a), drawn everywhere a child's
 * avatar appears. The shapes and colourways are the `Nevo Avatar` component's
 * own: six shapes, three colourways, and a glyph at 46% of the tile.
 *
 * STORED AS "<shape>-<colourway>" in `users/me`'s `avatarTone`, which the
 * server keeps as an opaque preference and does not interpret. Teslim is
 * asked for `avatarShape` and `avatarColourway` (his item 25); this moves to
 * those when they land. An id from before - the old colour-only "navy",
 * "lavender" and so on - is no choice at all and reads as the default look,
 * with no migration: rule 5, the look that corresponds to nothing chosen.
 *
 * A look is decoration the child picked. It says nothing about them, it is
 * never shown to a teacher or a parent, and nothing reads it but the discs
 * that draw it - so the words here are a shape and a colour, never a
 * description of a person.
 */

/** The `Nevo Avatar` component's six, in its order. */
export const AVATAR_SHAPES = [
  "circle",
  "roundsquare",
  "pill",
  "diamond",
  "triangle",
  "hexagon",
] as const;
export type AvatarShape = (typeof AVATAR_SHAPES)[number];

/** What a screen reader says for each shape: frame 27's own words. */
const SHAPE_LABEL: Record<AvatarShape, string> = {
  circle: "circle",
  roundsquare: "rounded square",
  pill: "pill",
  diamond: "diamond",
  triangle: "triangle",
  hexagon: "hexagon",
};

export interface AvatarColourway {
  label: string;
  background: string;
  glyph: string;
  /** Cream sits on cream, so the component gives it a hairline inset ring. */
  ring: string | null;
}

/** The `Nevo Avatar` component's three tones, with its values. */
export const AVATAR_COLOURWAYS = {
  navy: { label: "Navy", background: "#3b3f6e", glyph: "#f7f1e6", ring: null },
  dark: { label: "Dark", background: "#2b2b2f", glyph: "#f7f1e6", ring: null },
  cream: {
    label: "Cream",
    background: "#ede8dc",
    glyph: "#3b3f6e",
    ring: "inset 0 0 0 1.5px rgba(43,43,47,0.10)",
  },
} as const satisfies Record<string, AvatarColourway>;
export type AvatarColourwayId = keyof typeof AVATAR_COLOURWAYS;

export interface AvatarLook {
  /** What is stored: "<shape>-<colourway>". */
  id: string;
  shape: AvatarShape;
  colourway: AvatarColourwayId;
  /** What a screen reader says for the tile, e.g. "Navy circle". */
  label: string;
}

const look = (shape: AvatarShape, colourway: AvatarColourwayId): AvatarLook => ({
  id: `${shape}-${colourway}`,
  shape,
  colourway,
  label: `${AVATAR_COLOURWAYS[colourway].label} ${SHAPE_LABEL[shape]}`,
});

/** Frame 27's eight, in its order. */
export const AVATAR_LOOKS: readonly AvatarLook[] = [
  look("circle", "navy"),
  look("roundsquare", "dark"),
  look("pill", "cream"),
  look("diamond", "navy"),
  look("triangle", "dark"),
  look("hexagon", "cream"),
  look("roundsquare", "navy"),
  look("circle", "dark"),
];

/**
 * The look every child has until they choose, and the one every frame draws:
 * the navy circle. Not one picked for them - the frames' own nothing-chosen.
 */
export const DEFAULT_AVATAR_LOOK: AvatarLook = AVATAR_LOOKS[0];

const isShape = (s: string): s is AvatarShape =>
  (AVATAR_SHAPES as readonly string[]).includes(s);
const isColourway = (s: string): s is AvatarColourwayId =>
  Object.hasOwn(AVATAR_COLOURWAYS, s);

/**
 * A stored value back to a look. Any "<shape>-<colourway>" the component can
 * draw is drawn as stored, offered here or not - it is still the child's
 * choice. Anything else, an old colour id included, is no choice at all.
 */
export function avatarLook(id: unknown): AvatarLook {
  if (typeof id !== "string") return DEFAULT_AVATAR_LOOK;
  const cut = id.lastIndexOf("-");
  const shape = id.slice(0, cut);
  const colourway = id.slice(cut + 1);
  return cut > 0 && isShape(shape) && isColourway(colourway)
    ? look(shape, colourway)
    : DEFAULT_AVATAR_LOOK;
}
