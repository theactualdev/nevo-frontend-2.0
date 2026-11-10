import { BREAK_PICTURES } from "./breakPictures";
import { IllustrationWrapper } from "./IllustrationWrapper";

/**
 * Stretching character (Design System v2 §12). Movement break — a gentle sway
 * cueing the student to move. Motion is gated behind `motion-safe`.
 */
export function StretchingCharacter({
  className,
  priority,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <IllustrationWrapper
      {...BREAK_PICTURES.movement}
      alt="A figure gently stretching"
      motion="sway"
      className={className}
      priority={priority}
    />
  );
}
