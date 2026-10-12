import { getImageProps } from "next/image";
import { IllustrationWrapper } from "./IllustrationWrapper";

const ART = {
  src: "/illustrations/welcome-settling.png",
  alt: "A student settling in comfortably",
  width: 697,
  height: 598,
} as const;

/**
 * Settling character (Design System v2 §12). Calm arrival illustration —
 * Welcome screen and onboarding transitions. Static (no motion).
 */
export function SettlingCharacter({
  className,
  priority,
  onError,
}: {
  className?: string;
  priority?: boolean;
  /** The picture did not load - no connection, and nothing fetched it first. */
  onError?: () => void;
}) {
  return (
    <IllustrationWrapper
      {...ART}
      className={className}
      priority={priority}
      onError={onError}
    />
  );
}

/**
 * FETCHED AHEAD, FOR A SCREEN THE CONNECTION MAY NOT LAST TO. The lesson's
 * ending draws this picture, and an ending can come after the connection has
 * dropped, with no service worker to answer for it. Asking for the same
 * optimised URLs the `<img>` will ask for, while there is a connection, lets
 * the browser hand that `<img>` the picture it already has.
 *
 * The caller keeps the element for as long as the screen may follow: it is
 * what holds the picture in memory.
 */
export function preloadSettlingCharacter(): HTMLImageElement {
  const { props } = getImageProps(ART);
  const img = new Image();
  img.decoding = "async";
  if (props.sizes) img.sizes = props.sizes;
  if (props.srcSet) img.srcset = props.srcSet;
  img.src = props.src;
  return img;
}
