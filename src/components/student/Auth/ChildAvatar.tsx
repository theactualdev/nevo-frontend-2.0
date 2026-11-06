import { cn } from "@/lib/utils";
import { SHAPE_COUNT } from "@/lib/auth/deviceRoster";
import { AVATAR_SHAPES } from "@/lib/profile/avatarLook";
import { AvatarGlyph } from "@/components/student/Shell/StudentAvatar";

/**
 * A remembered child's avatar: a soft geometric shape on a quiet tint.
 *
 * 28c: *"Avatars are soft geometric shapes, never a face; the enlarged first
 * name is the primary identifier and the shape is a secondary cue for a child
 * still learning to read."* Never a photograph and never initials - this is a
 * pre-authentication screen that anybody in the room can see, and a face or a
 * pair of initials on it identifies a child to a stranger.
 *
 * The frame's own note: *"Shapes are quiet cream placeholders; real avatar
 * artwork drops into the same tiles."* So this is the tile, not the artwork.
 *
 * WHICH SHAPE IS STORED, NOT DERIVED FROM POSITION - see `deviceRoster`. The
 * frame assigns by list index, which would move a child's shape every time
 * another child signed in, and a cue that moves is not a cue.
 */

/*
 * The frame's six, in its order, are the `Nevo Avatar` component's - the same
 * glyphs a signed-in child chooses from on Profile, drawn from one place.
 * `currentColor` is set by the wrapper.
 */

/**
 * The frame's tints, which are `nevo-violet` and `nevo-navy` at six opacities.
 * Kept as explicit classes rather than composed at runtime, because Tailwind
 * cannot see a class name it did not find in the source.
 */
const TINTS = [
  "bg-nevo-violet/30",
  "bg-nevo-navy/15",
  "bg-nevo-violet/25",
  "bg-nevo-navy/20",
  "bg-nevo-violet/35",
  "bg-nevo-navy/10",
];

export function ChildAvatar({
  shapeIndex,
  className,
}: {
  shapeIndex: number;
  className?: string;
}) {
  // A stored index from an older or hand-edited roster must not blank the tile.
  const i = ((Math.trunc(shapeIndex) % SHAPE_COUNT) + SHAPE_COUNT) % SHAPE_COUNT;

  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full text-nevo-cream-elevated",
        TINTS[i],
        className,
      )}
    >
      <AvatarGlyph shape={AVATAR_SHAPES[i]} />
    </span>
  );
}
