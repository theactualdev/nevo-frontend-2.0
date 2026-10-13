import { getImageProps } from "next/image";

/**
 * The two pictures "You're offline" draws, fetched while the device is still
 * online and kept for when it is not.
 *
 * THE SCREEN FOR NO CONNECTION LOADED ITS PICTURES OVER THE CONNECTION. The
 * brand mark and the illustration were ordinary network images, requested the
 * moment the screen appeared - which is the moment there was no network to
 * request them from. So the one child this screen is for got two broken images
 * around "You're offline".
 *
 * Each is fetched once, while online, and held as a `blob:` URL, which needs no
 * network to draw. The files are the real ones: the combined mark from
 * `public/brand`, and the illustration at the size `next/image` already served
 * this screen (220px, so its 2x candidate). Nothing is substituted.
 */

/** `CombinedMark`'s file. */
export const OFFLINE_MARK_SRC = "/brand/nevo-logo-combined.png";
/** The illustration, as the screen draws it. */
export const OFFLINE_ILLUSTRATION = {
  src: "/illustrations/offline.png",
  width: 1024,
  height: 1024,
} as const;

type Art = "mark" | "illustration";
const kept: Record<Art, string | null> = { mark: null, illustration: null };
const inFlight = new Set<Art>();

/** What the screen can draw with no connection; `null` where nothing is kept. */
export function offlineArt(): Readonly<Record<Art, string | null>> {
  return kept;
}

/**
 * Fetch and keep whatever is not kept yet. Called while online; a fetch that
 * fails is tried again the next time the connection is back.
 */
export function keepOfflineArt(): void {
  if (typeof window === "undefined" || typeof fetch !== "function") return;
  keep("mark", OFFLINE_MARK_SRC);
  keep("illustration", illustrationUrl());
}

/** The optimised file `next/image` requests for a 220px picture at 2x. */
function illustrationUrl(): string {
  return getImageProps({
    src: OFFLINE_ILLUSTRATION.src,
    alt: "",
    width: 220,
    height: 220,
  }).props.src;
}

function keep(art: Art, url: string): void {
  if (kept[art] || inFlight.has(art)) return;
  inFlight.add(art);
  void (async () => {
    try {
      const res = await fetch(url, {
        // What a browser's own image request accepts, so the optimiser sends
        // the same compact file it would have sent the screen.
        headers: { Accept: "image/avif,image/webp,image/*" },
      });
      if (!res.ok) return;
      kept[art] = URL.createObjectURL(await res.blob());
    } catch {
      // Nothing kept: the screen falls back to the file's own address.
    } finally {
      inFlight.delete(art);
    }
  })();
}

/** Forget everything kept. Tests only; a page keeps its pictures for life. */
export function resetOfflineArt(): void {
  kept.mark = null;
  kept.illustration = null;
  inFlight.clear();
}
