import {
  AVATAR_COLOURWAYS,
  type AvatarLook,
  type AvatarShape,
} from "@/lib/profile/avatarLook";
import { cn } from "@/lib/utils";

/**
 * The `Nevo Avatar` component's six shapes, drawn in `currentColor` on a
 * 24-unit box. The pointed three carry a round-joined stroke of the same
 * colour, as frame 27 and 28c draw them, so their corners read as soft.
 */
const GLYPHS: Record<AvatarShape, React.ReactElement> = {
  circle: <circle cx="12" cy="12" r="8.5" />,
  roundsquare: <rect x="4" y="4" width="16" height="16" rx="6" />,
  pill: <rect x="2.5" y="7" width="19" height="10" rx="5" />,
  diamond: (
    <path
      d="M12 4 20 12 12 20 4 12Z"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinejoin="round"
    />
  ),
  triangle: (
    <path
      d="M12 5.5 19.5 18 4.5 18Z"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinejoin="round"
    />
  ),
  hexagon: (
    <path
      d="M12 4 19 8 19 16 12 20 5 16 5 8Z"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinejoin="round"
    />
  ),
};

/** One shape's glyph, at the component's 46% of whatever tile holds it. */
export function AvatarGlyph({ shape }: { shape: AvatarShape }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="size-[46%]"
      aria-hidden
      data-avatar-shape={shape}
    >
      {GLYPHS[shape]}
    </svg>
  );
}

/**
 * The signed-in child's avatar: their chosen shape on a round tile, never
 * their initials (Lydia, 4 Nov; frame 27). Sized by the caller, and silent to
 * a screen reader - whatever holds it says what it is for.
 */
export function StudentAvatar({
  look,
  className,
}: {
  look: AvatarLook;
  className?: string;
}) {
  const colours = AVATAR_COLOURWAYS[look.colourway];
  return (
    <span
      aria-hidden
      data-avatar-look={look.id}
      style={{
        background: colours.background,
        color: colours.glyph,
        boxShadow: colours.ring ?? undefined,
      }}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full",
        className,
      )}
    >
      <AvatarGlyph shape={look.shape} />
    </span>
  );
}
