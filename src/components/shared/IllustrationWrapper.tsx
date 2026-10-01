import Image from "next/image";

import { cn } from "@/lib/utils";

export type IllustrationMotion = "none" | "breathe" | "sway";

/**
 * IllustrationWrapper (Design System v2 §12; FE Architecture §1) — the single
 * entry point for rendering Section 12 illustrations. Handles next/image sizing
 * and the optional calm animation, which is gated behind `motion-safe` so it
 * never plays under reduced motion.
 *
 * Assets are static PNGs, so "breathing/stretching" are expressed as a gentle
 * transform on the whole illustration within the Design System timing band.
 *
 * REMOTE SOURCES SKIP THE OPTIMIZER, and that is deliberate rather than a
 * shortcut. It became load-bearing the moment lesson visuals were switched on:
 * `VisualVariant.imageUrl` is a SIGNED storage URL from the content pipeline,
 * and `next/image` refuses any hostname absent from `images.remotePatterns` -
 * `next.config.ts` configures none, so every live lesson picture threw E231 in
 * development and 400'd from `/_next/image` in production. Worse than a tap
 * that fails: `openingModality` picks the backend's first modality, so a
 * segment listed visual-first opened straight into the broken one.
 *
 * Adding a hostname would fix the symptom, and nobody can currently say which
 * hostname - it does not appear in the spec, the repo or any measured payload.
 * But optimising these is the wrong thing anyway: the optimizer caches by src,
 * a signature makes every URL unique, so the cache never hits and it refetches
 * forever. Next's own docs say to use `unoptimized` when the source needs
 * authentication, which a signed URL effectively does.
 *
 * Local art (`/illustrations/*.png`) keeps the optimizer, because resizing and
 * format conversion genuinely matter for a child on a slow connection.
 *
 * WHEN BACKEND NAMES THE HOST, adding it to `remotePatterns` and dropping this
 * branch is a reasonable change - but only if the URLs stop being signed.
 */

/** An absolute URL is remote; anything else is an asset we ship. */
function isRemote(src: string): boolean {
  return /^https?:\/\//i.test(src);
}
export function IllustrationWrapper({
  src,
  alt,
  width,
  height,
  className,
  motion = "none",
  priority,
  onError,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  motion?: IllustrationMotion;
  priority?: boolean;
  /** The image did not load - a signed link that expired, or no connection. */
  onError?: () => void;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      priority={priority}
      onError={onError}
      unoptimized={isRemote(src)}
      className={cn(
        "h-auto max-w-full",
        motion === "breathe" && "motion-safe:animate-nevo-breathe",
        motion === "sway" && "motion-safe:animate-nevo-sway",
        className,
      )}
    />
  );
}
