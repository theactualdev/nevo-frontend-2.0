"use client";

import { cn } from "@/lib/utils";

export type ToggleState = "default" | "manual" | "system";

export type ToggleSegment = {
  id: string;
  label: string;
  state: ToggleState;
};

/**
 * Adaptive Toggle Bar (Lesson Player frame; Design System v2 §6). Compact pacing
 * control on a quiet near-black track. Two active looks: manual (navy fill — the
 * student chose it) and system (violet fill — Nevo's density, in force).
 *
 * NO GLOW AND NO SPARKLE ON THE SYSTEM CHIP (design D144, 8 Oct). The frame
 * still draws a one-shot ring on it and a violet glint on the control's corner
 * while it sits unfollowed. Design: "Everything that reacts visibly to a
 * child's input is coming out, and leaving one instance behind means it
 * survives into the build as an exception nobody remembers deciding." The
 * violet fill stays: it is the state, not a reaction.
 */
export function AdaptiveToggleBar({
  segments,
  onSelect,
  className,
}: {
  segments: ToggleSegment[];
  onSelect?: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Lesson pacing"
      className={cn(
        // 44px-tall pills with 8px gaps - touch-first sizing (frame 17 / Touch Audit).
        "relative inline-flex items-center gap-2 rounded-full bg-nevo-near-black/6 p-1",
        className,
      )}
    >
      {segments.map((seg) => (
        <button
          key={seg.id}
          type="button"
          onClick={() => onSelect?.(seg.id)}
          aria-pressed={seg.state !== "default"}
          className={cn(
            "flex h-11 cursor-pointer items-center justify-center rounded-full px-4 text-[13px] font-medium whitespace-nowrap transition-colors",
            seg.state === "manual" && "bg-nevo-navy text-nevo-cream",
            seg.state === "system" && "bg-nevo-violet/80 text-nevo-near-black",
            seg.state === "default" &&
              "bg-transparent text-nevo-near-black hover:bg-nevo-navy/6",
          )}
        >
          {seg.label}
        </button>
      ))}
    </div>
  );
}
