"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMediaSource } from "./useMediaSource";

/** 17a's narration-bar silhouette - 20 bars, explicit px heights. */
const BAR_HEIGHTS = [6, 10, 13, 8, 14, 10, 12, 7, 13, 9, 11, 14, 8, 12, 10, 7, 13, 9, 11, 8];

/**
 * A spoken question's prompt (B16, 1 Oct).
 *
 * WHETHER A QUESTION IS SPOKEN IS THE SERVER'S CALL. `ComprehensionCheckpoint`
 * carries `format` and `promptAudioUrl`, and this renders only where both say
 * so. Nothing here chooses a modality for a child (rule 1).
 *
 * DRAWN AS 17a's NARRATION BAR, the one spoken-prompt treatment the frames
 * have: a slim cream card with the navy play control and a waveform that
 * fills as it plays. The rule that comes with it is the important part -
 * "audio is a layer, not a replacement". The printed question stays on screen
 * the whole time, so it is the fallback before anything fails, not after.
 *
 * It plays once on arrival, which is what a spoken question is for; the same
 * control replays it from the top once it has finished. A browser that
 * refuses to start sound without a tap simply leaves it ready to press.
 *
 * A recording that will not load says so, in the words the lesson's own audio
 * uses, and the control goes quiet. One fresh attempt when the connection
 * returns - see `useMediaSource`.
 *
 * THE LABEL IS "LISTEN", THEN "LISTEN AGAIN" (design D95, 6 Oct): "'Listen
 * again' where the child has already heard it, 'Listen' where they have not.
 * Both are things a child understands without being taught." It sits where
 * 17a's label sits, above the waveform, and the play control carries the same
 * words as its name. Heard means played through to the end: that is when
 * pressing play starts it again from the top. 17a's own words, "Read this step
 * aloud · TEXT STAYS", name a calculation step and are not used here.
 */
export function SpokenPrompt({
  src,
  onBusy,
}: {
  src: string;
  /**
   * `system_busy` bracket while it plays (Touch Signal Contract: the child is
   * listening, not idle). Start on play, end on pause, finish or unmount.
   */
  onBusy?: (phase: "start" | "end") => void;
}) {
  // No storage path travels with a prompt, so a failure is final until the
  // connection comes back.
  const media = useMediaSource(src, undefined);
  const failed = media.failed;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pct, setPct] = useState(0);
  /** Played through to the end at least once. */
  const [heard, setHeard] = useState(false);
  const label = heard ? "Listen again" : "Listen";
  const playingRef = useRef(false);
  const onBusyRef = useRef(onBusy);

  useEffect(() => {
    onBusyRef.current = onBusy;
  }, [onBusy]);

  // Leaving mid-sentence must still close the busy window.
  useEffect(
    () => () => {
      if (playingRef.current) onBusyRef.current?.("end");
    },
    [],
  );

  const setPlayState = (on: boolean) => {
    if (playingRef.current === on) return;
    playingRef.current = on;
    setPlaying(on);
    onBusyRef.current?.(on ? "start" : "end");
  };

  const toggle = () => {
    const el = audioRef.current;
    if (failed || !el) return;
    if (playing) {
      el.pause();
      return;
    }
    // Pressing play on a finished prompt says it again from the top.
    if (pct >= 100) el.currentTime = 0;
    // Only a source the browser cannot play is a failure. A refusal to start
    // without a tap, or a pause while buffering, is not.
    void el.play()?.catch((err: unknown) => {
      setPlayState(false);
      if ((err as { name?: string } | null)?.name === "NotSupportedError") {
        void media.onError();
      }
    });
  };

  return (
    <div className="flex items-center gap-3 rounded-[12px] bg-nevo-cream-elevated px-3 py-2.5 shadow-elevation-1">
      {!failed && (
        <audio
          // Keyed so a re-issued link actually reloads.
          key={media.key}
          ref={audioRef}
          src={media.src}
          preload="auto"
          // Spoken on arrival, and only then - not again when a dropped
          // connection comes back mid-question.
          autoPlay={media.key === "0"}
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            if (!Number.isFinite(el.duration) || el.duration <= 0) return;
            setPct(Math.min(100, (el.currentTime / el.duration) * 100));
          }}
          onPlay={() => setPlayState(true)}
          onPause={() => setPlayState(false)}
          onEnded={() => {
            setPct(100);
            setHeard(true);
            setPlayState(false);
          }}
          onError={() => {
            setPlayState(false);
            void media.onError();
          }}
        />
      )}
      <button
        type="button"
        aria-label={playing ? "Pause" : label}
        disabled={failed}
        onClick={toggle}
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-full bg-nevo-navy text-nevo-cream transition-transform",
          failed
            ? "cursor-not-allowed opacity-40"
            : "cursor-pointer active:scale-[0.98]",
        )}
      >
        {playing ? (
          <Pause className="size-[18px]" fill="currentColor" strokeWidth={0} />
        ) : (
          <Play
            className="ml-0.5 size-[18px]"
            fill="currentColor"
            strokeWidth={0}
          />
        )}
      </button>
      {failed ? (
        <span role="status" className="text-[13px] text-nevo-near-black/70">
          {"Couldn't load this recording"}
        </span>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
          {/* Shown, and the control already says it: read once, not twice. */}
          <span
            aria-hidden
            className="text-[13px] font-semibold text-nevo-near-black"
          >
            {label}
          </span>
          <div aria-hidden className="flex h-3.5 items-end gap-0.5">
            {BAR_HEIGHTS.map((h, i) => (
              <span
                key={i}
                className="w-[3px] shrink-0 rounded-full bg-nevo-navy transition-opacity duration-150"
                style={{
                  height: `${h}px`,
                  opacity:
                    (i + 1) / BAR_HEIGHTS.length <= pct / 100 ? 0.95 : 0.28,
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
