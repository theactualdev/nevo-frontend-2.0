"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AudioContent } from "@/lib/types";
import { type MediaFailReason, useMediaSource } from "./useMediaSource";

/** The frame's waveform silhouette — 24 bars, explicit px heights. */
const BAR_HEIGHTS = [
  10, 16, 22, 14, 26, 18, 30, 20, 12, 24, 28, 16, 22, 32, 18, 12, 26, 20, 14,
  28, 22, 16, 10, 24,
];

function clock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Audio modality (Lesson Player frame 17) — a narration card with a violet
 * waveform, navy progress line and time, plus a transcript disclosure.
 *
 * IT PLAYS THE REAL CLIP NOW. It used to animate the waveform on a
 * `setInterval` against a hardcoded 40-second duration, with
 * `TODO(audio): play the real narrated clip` where the playback should be. That
 * was written when no narration existed, and it was honest then. It stopped
 * being honest the moment the backend started producing assets: a child would
 * have pressed play and watched a progress line run over silence.
 *
 * The simulation survives for one case only — content with NO `src`, which is
 * the two authored demo lessons. There it animates a placeholder in the
 * designed walkthrough rather than claiming a clip played, and a signed-out
 * visitor is the only one who sees it.
 *
 * `durationSec` IS NOT TRUSTED when there is an asset. The backend returns
 * `durationMs: 0` on real narration today despite the file being 80KB of
 * mp3 — it is un-computed metadata, not an empty clip — so the duration comes
 * from the element, which is the only thing that actually knows.
 *
 * A clip that will not load says so and points at the transcript, which is
 * required on `AudioContent` and carries the same words. That is the honest
 * fallback: silence with a moving progress bar is not.
 */
export function AudioSegment({
  content,
  onReplay,
  onPlayed,
  onBusy,
  onMediaFailed,
}: {
  content: AudioContent;
  /** Fired when the student restarts a finished clip (a "replay" signal). */
  onReplay?: () => void;
  /**
   * The real clip has started playing for the first time on this visit - the
   * element said so, not the button. Never for the demo's simulated clip,
   * where nothing played.
   */
  onPlayed?: () => void;
  /**
   * `system_busy` bracket for playback (Touch Signal Contract: media_playing is
   * its own reason — the student is attending, not idle). Start on play, end on
   * pause, finish or unmount mid-clip.
   */
  onBusy?: (phase: "start" | "end") => void;
  /**
   * The recording would not load, after its one fresh link (B12). The card
   * already says so and opens the transcript; this tells the engine.
   */
  onMediaFailed?: (reason: MediaFailReason) => void;
}) {
  // No asset means the designed demo, which animates a placeholder. Anything
  // with a `src` is a real clip and plays for real.
  const simulated = !content.src;
  const [playing, setPlaying] = useState(false);
  const [pct, setPct] = useState(0);
  // An expired link is re-issued once, and a failure is retried when the
  // connection returns - see `useMediaSource`.
  const media = useMediaSource(
    content.src,
    content.storagePath,
    onMediaFailed,
  );
  const failed = media.failed;
  /** What the element says the clip is; null until metadata lands. */
  const [assetDuration, setAssetDuration] = useState<number | null>(null);
  /*
   * The child's own open/close, or null for "not chosen". A clip that fails
   * opens the transcript for them: the card says "read the same words below",
   * and those words sat behind a closed disclosure.
   */
  const [transcriptChoice, setTranscriptChoice] = useState<boolean | null>(
    null,
  );
  const transcriptOpen = transcriptChoice ?? failed;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const onBusyRef = useRef(onBusy);
  const playingRef = useRef(false);
  const onPlayedRef = useRef(onPlayed);
  const startedOnce = useRef(false);

  const duration = simulated
    ? (content.durationSec ?? 40)
    : (assetDuration ?? 0);

  useEffect(() => {
    onBusyRef.current = onBusy;
    onPlayedRef.current = onPlayed;
  }, [onBusy, onPlayed]);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      // Unmounting mid-clip must still close the busy window.
      if (playingRef.current) onBusyRef.current?.("end");
    },
    [],
  );

  const setPlayState = (on: boolean) => {
    if (playingRef.current === on) return;
    playingRef.current = on;
    setPlaying(on);
    onBusyRef.current?.(on ? "start" : "end");
    if (on && !simulated && !startedOnce.current) {
      startedOnce.current = true;
      onPlayedRef.current?.();
    }
  };

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  const toggle = () => {
    // A clip that would not load has nothing to toggle. The transcript below
    // is the way in, and the card says so.
    if (failed) return;

    if (playing) {
      if (simulated) {
        stop();
        setPlayState(false);
      } else {
        audioRef.current?.pause();
      }
      return;
    }

    // Pressing play on a finished clip restarts it — that's a replay.
    if (pct >= 100) onReplay?.();

    if (!simulated) {
      const el = audioRef.current;
      if (!el) return;
      if (pct >= 100) el.currentTime = 0;
      /*
       * NOT EVERY REFUSAL IS A BROKEN CLIP. Any rejection used to mark the
       * clip failed for good - including `AbortError`, which is what a child
       * pausing while it buffers produces, and `NotAllowedError`, which is the
       * browser asking for a tap. Both left Play disabled until they left the
       * segment, over a recording that was fine.
       *
       * Only a source the browser cannot play is a failure, and it goes the
       * same way as the element's own error: one fresh link, then the words.
       */
      void el.play().catch((err: unknown) => {
        setPlayState(false);
        if ((err as { name?: string } | null)?.name === "NotSupportedError") {
          void media.onError();
        }
      });
      return;
    }

    setPct((p) => (p >= 100 ? 0 : p));
    setPlayState(true);
    const step = 100 / (duration * 10); // ~10 ticks/sec
    timer.current = setInterval(() => {
      setPct((p) => {
        if (p + step >= 100) {
          stop();
          setPlayState(false);
          return 100;
        }
        return p + step;
      });
    }, 100);
  };

  const played = (pct / 100) * duration;

  return (
    <article>
      {content.heading && (
        <h2 className="text-[22px] font-semibold leading-[1.3] tracking-[-0.01em] text-nevo-near-black sm:text-[26px] lg:text-[28px]">
          {content.heading}
        </h2>
      )}
      {content.intro && (
        <p className="mt-4 text-base leading-[1.6] text-nevo-near-black/82 sm:text-[18px] lg:text-[19px]">
          {content.intro}
        </p>
      )}

      {/* The real clip. `preload="metadata"` so the duration is known before a
          child presses anything - the card would otherwise read 0:00 until the
          first play. Playing state is driven by the ELEMENT's own play/pause
          events rather than set optimistically, so a pause from the OS, a
          headphone unplug or the lock screen keeps the card truthful. */}
      {content.src && !failed && (
        <audio
          // Keyed so a re-issued link actually reloads; the element otherwise
          // keeps the source that failed.
          key={media.key}
          ref={audioRef}
          src={media.src}
          preload="metadata"
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d) && d > 0) setAssetDuration(d);
          }}
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            if (!Number.isFinite(el.duration) || el.duration <= 0) return;
            setPct(Math.min(100, (el.currentTime / el.duration) * 100));
          }}
          onPlay={() => setPlayState(true)}
          onPause={() => setPlayState(false)}
          onEnded={() => {
            setPct(100);
            setPlayState(false);
          }}
          onError={() => {
            setPlayState(false);
            void media.onError();
          }}
        />
      )}

      <div className="mt-[22px] flex flex-col gap-[18px] rounded-[12px] bg-nevo-cream-elevated p-[22px] shadow-elevation-1">
        <div className="flex items-center gap-3.5">
          <button
            type="button"
            aria-label={playing ? "Pause" : "Play"}
            disabled={failed}
            onClick={toggle}
            className={cn(
              "flex size-[52px] shrink-0 items-center justify-center rounded-full bg-nevo-navy text-nevo-cream transition-transform",
              failed
                ? "cursor-not-allowed opacity-40"
                : "cursor-pointer active:scale-[0.98]",
            )}
          >
            {playing ? (
              <Pause className="size-5" fill="currentColor" strokeWidth={0} />
            ) : (
              <Play
                className="ml-0.5 size-5"
                fill="currentColor"
                strokeWidth={0}
              />
            )}
          </button>
          <div className="min-w-0 flex-1">
            {content.title && (
              <p className="text-[15px] font-semibold text-nevo-near-black">
                {content.title}
              </p>
            )}
            <span className="text-[13px] text-nevo-near-black/60">
              {failed ? (
                // Not "0:00 / 0:00", which reads as a clip of no length rather
                // than one we could not load.
                "Couldn't load this recording"
              ) : (
                <>
                  {clock(played)} / {duration > 0 ? clock(duration) : "--:--"}
                </>
              )}
            </span>
          </div>
        </div>

        {/* Waveform — bottom-aligned violet bars; opacity tracks the played fraction */}
        <div className="flex h-9 items-end gap-[3px]">
          {BAR_HEIGHTS.map((h, i) => {
            const on = (i + 1) / BAR_HEIGHTS.length <= pct / 100;
            return (
              <span
                key={i}
                className="w-1 shrink-0 rounded-full bg-nevo-violet transition-opacity duration-200"
                style={{ height: `${h}px`, opacity: on ? 1 : 0.3 }}
              />
            );
          })}
        </div>

        <div className="h-[5px] w-full overflow-hidden rounded-full bg-nevo-near-black/12">
          <div
            className="h-full rounded-full bg-nevo-navy transition-[width] duration-[180ms] ease-linear"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {failed && (
        <p
          role="status"
          className="mt-3 text-[14px] leading-[1.55] text-nevo-near-black/70"
        >
          The recording didn&rsquo;t load. You can read the same words below.
        </p>
      )}

      {/* Transcript disclosure */}
      <button
        type="button"
        aria-expanded={transcriptOpen}
        onClick={() => setTranscriptChoice(!transcriptOpen)}
        className="mt-3.5 flex cursor-pointer items-center gap-2 text-sm font-medium text-nevo-navy"
      >
        <ChevronDown
          className={cn(
            "size-4 transition-transform duration-[180ms]",
            transcriptOpen && "rotate-180",
          )}
          strokeWidth={2}
        />
        {transcriptOpen ? "Hide transcript" : "Show transcript"}
      </button>
      {transcriptOpen && (
        <div className="mt-3 rounded-[12px] bg-nevo-violet/8 p-[18px]">
          <p className="text-base leading-[1.7] text-nevo-near-black/82 sm:text-[18px] lg:text-[19px]">
            {content.transcript}
          </p>
        </div>
      )}
    </article>
  );
}
