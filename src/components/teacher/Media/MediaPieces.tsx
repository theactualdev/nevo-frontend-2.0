"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IllustrationWrapper } from "@/components/shared/IllustrationWrapper";
import { contentApi } from "@/lib/api/content";
import type { AudioVariant, VisualVariant } from "@/lib/api/variants";
import { cn } from "@/lib/utils";

/**
 * The two pieces C07k's step 1 and C06c Lesson Media share: a picture tile and
 * a narration sampler (design 82c213b, 23 Oct).
 *
 * BOTH CAN OUTLIVE THEIR LINK. A generated picture or recording is served from
 * a signed URL that expires, and a teacher who leaves the review open over
 * lunch comes back to links that no longer work. Each piece asks for a fresh
 * one once, by the stored path, the way the variant review's player does, and
 * says plainly when that fails rather than drawing a broken image.
 */

/** "0:38", from the recording's own length. Empty when it was not measured. */
export function duration(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return "";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function MediaTile({
  image,
  alt,
  className,
  children,
}: {
  image: VisualVariant;
  alt: string;
  className?: string;
  /** Drawn over the picture: a flag, a chip. */
  children?: React.ReactNode;
}) {
  const [src, setSrc] = useState(image.previewUrl || image.imageUrl);
  const [tried, setTried] = useState(false);
  const [dead, setDead] = useState(false);

  const recover = () => {
    if (tried) {
      setDead(true);
      return;
    }
    setTried(true);
    if (!image.storagePath) {
      setDead(true);
      return;
    }
    void contentApi
      .mediaUrl(image.storagePath)
      .then((fresh) => setSrc(fresh.url))
      .catch(() => setDead(true));
  };

  return (
    <div
      className={cn(
        "relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-[10px] bg-nevo-cream-inset shadow-elevation-1",
        className,
      )}
    >
      {dead ? (
        <span className="px-3 text-center text-[12px] leading-[1.4] text-nevo-near-black/55">
          This picture won&rsquo;t load just now.
        </span>
      ) : (
        <IllustrationWrapper
          key={src}
          src={src}
          alt={alt}
          width={image.width || 400}
          height={image.height || 300}
          onError={recover}
          className="h-full w-full object-cover"
        />
      )}
      {children}
    </div>
  );
}

/**
 * One recording at a time, sampled rather than sat through.
 *
 * A single shared element, so starting a second recording stops the first,
 * and leaving the screen stops it too. Progress is the element's own position,
 * drawn as a thin bar under the playing row.
 */
export function useNarrationSampler() {
  const element = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [unplayable, setUnplayable] = useState<ReadonlySet<string>>(() => new Set());

  const stop = useCallback(() => {
    element.current?.pause();
    element.current = null;
    setPlaying(null);
    setProgress(0);
  }, []);

  useEffect(() => stop, [stop]);

  const toggle = useCallback(
    (id: string, audio: AudioVariant) => {
      if (playing === id) {
        stop();
        return;
      }
      element.current?.pause();
      const fail = () => {
        setUnplayable((s) => new Set(s).add(id));
        stop();
      };
      const start = (src: string, retried: boolean) => {
        const a = new Audio(src);
        element.current = a;
        a.ontimeupdate = () => setProgress(a.duration ? a.currentTime / a.duration : 0);
        a.onended = () => {
          if (element.current === a) stop();
        };
        a.onerror = () => {
          if (element.current !== a) return;
          if (retried || !audio.storagePath) return fail();
          void contentApi
            .mediaUrl(audio.storagePath)
            .then((fresh) => start(fresh.url, true))
            .catch(fail);
        };
        // Not every browser returns a promise from play().
        const started = a.play() as Promise<void> | undefined;
        started?.catch?.(() => {
          if (element.current === a && retried) fail();
        });
      };
      setPlaying(id);
      setProgress(0);
      start(audio.audioUrl, false);
    },
    [playing, stop],
  );

  return { playing, progress, toggle, stop, unplayable };
}

export function PlayButton({
  playing,
  label,
  onClick,
  disabled,
}: {
  playing: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={playing ? `Stop ${label}` : `Play ${label}`}
      aria-pressed={playing}
      className="inline-flex size-[38px] shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-nevo-navy text-nevo-cream transition-[filter] hover:brightness-104 disabled:cursor-default disabled:opacity-45"
    >
      {playing ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M8 5v14l11-7z" />
        </svg>
      )}
    </button>
  );
}
