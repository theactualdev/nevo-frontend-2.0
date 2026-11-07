import {
  AVATAR_COLOURWAYS,
  DEFAULT_AVATAR_LOOK,
  type AvatarLook,
  type AvatarShape,
} from "@/lib/profile/avatarLook";
import { cn } from "@/lib/utils";

/**
 * The six glyphs, as the design's `Nevo Avatar` draws them (928cf30), in
 * `currentColor` on a 24-unit box:
 *  - the rounded square's corners are 3.5, not 6: "at 6 on a 16-wide rect it
 *    reads as a circle at roster size";
 *  - the star is the identity star (SCRUM-322), not a reward mark;
 *  - the pointed four carry a round-joined stroke of 2.2, so their corners
 *    read as soft.
 */
const SOFT = {
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinejoin: "round" as const,
};
const GLYPHS: Record<AvatarShape, React.ReactElement> = {
  circle: <circle cx="12" cy="12" r="8.5" />,
  square: <rect x="4" y="4" width="16" height="16" rx="3.5" />,
  star: (
    <path
      d="M12.00 2.70 L14.56 8.48 L20.84 9.13 L16.14 13.34 L17.47 19.52 L12.00 16.35 L6.53 19.52 L7.86 13.34 L3.16 9.13 L9.44 8.48 Z"
      {...SOFT}
    />
  ),
  diamond: <path d="M12 4 20 12 12 20 4 12Z" {...SOFT} />,
  triangle: <path d="M12 5.5 19.5 18 4.5 18Z" {...SOFT} />,
  hexagon: <path d="M12 4 19 8 19 16 12 20 5 16 5 8Z" {...SOFT} />,
};

/**
 * How much of the tile the shape fills: 58% under 56px, 46% at 56px and up
 * (928cf30: "in a dense roster row a 46 per cent hexagon reads as a circle,
 * which defeats the point of the shape being a second cue").
 */
export const glyphShare = (size: number) => (size >= 56 ? "46%" : "58%");

/**
 * THE CHILD'S AVATAR, EVERYWHERE (SCRUM-324): their shape on a round tile in
 * their tone. Never their initials (Lydia, 4 Nov). Silent to a screen reader
 * - whatever holds it says what it is for.
 *
 * `size` is the tile's width in pixels, which sets the shape's share. Where
 * the tile changes size with the screen, pass `className` for the size and
 * `glyphClassName` for the share instead.
 */
export function StudentAvatar({
  look = DEFAULT_AVATAR_LOOK,
  size,
  className,
  glyphClassName,
}: {
  look?: AvatarLook;
  size?: number;
  className?: string;
  glyphClassName?: string;
}) {
  const colours = AVATAR_COLOURWAYS[look.colourway];
  const share = size === undefined ? undefined : glyphShare(size);
  return (
    <span
      aria-hidden
      data-avatar-look={look.id}
      style={{
        background: colours.background,
        color: colours.glyph,
        boxShadow: colours.ring ?? undefined,
        ...(size === undefined ? {} : { width: size, height: size }),
      }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full",
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden
        data-avatar-shape={look.shape}
        style={share ? { width: share, height: share } : undefined}
        className={cn(!share && (glyphClassName ?? "size-[46%]"))}
      >
        {GLYPHS[look.shape]}
      </svg>
    </span>
  );
}
