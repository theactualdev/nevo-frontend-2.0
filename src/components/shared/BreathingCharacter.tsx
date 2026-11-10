import { BREAK_PICTURES } from "./breakPictures";
import { IllustrationWrapper } from "./IllustrationWrapper";

/**
 * Breathing character (Design System v2 §12). Micro-break — a slow scale-pulse
 * that helps regulate the student. Motion is gated behind `motion-safe`.
 */
export function BreathingCharacter({
  className,
  priority,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <IllustrationWrapper
      {...BREAK_PICTURES.micro}
      alt="A calm figure breathing slowly"
      motion="breathe"
      className={className}
      priority={priority}
    />
  );
}
