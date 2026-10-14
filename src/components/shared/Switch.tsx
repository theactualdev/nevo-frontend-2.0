"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The track and knob at each size. `default` is Design System v2 §6, the
 * consoles' switch. `lg` is the student Profile's since 13 Oct: `Nevo Profile
 * Frame` draws its `track` 64×44 with 5px of padding and a 34px `knob`, so
 * the switch itself is the 44px a child taps. The knob sits 25px in when on
 * at both sizes, by coincidence of the arithmetic.
 */
const SIZES = {
  default: {
    track: "h-[30px] w-[52px]",
    knob: "top-[3px] size-6",
    on: "left-[25px]",
    off: "left-[3px]",
  },
  lg: {
    track: "h-11 w-16",
    knob: "top-[5px] size-[34px]",
    on: "left-[25px]",
    off: "left-[5px]",
  },
} as const;

/**
 * Nevo Switch / toggle (Design System v2 §6). 52×30 track with a 24px knob,
 * or 64×44 with a 34px knob at `size="lg"`.
 * Navy when on, muted near-black when off. Persists immediately (no save step).
 */
function Switch({
  checked = false,
  onCheckedChange,
  size = "default",
  className,
  disabled,
  ...props
}: Omit<React.ComponentProps<"button">, "onChange" | "type"> & {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  size?: keyof typeof SIZES;
}) {
  const drawn = SIZES[size];
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        "relative shrink-0 cursor-pointer rounded-full transition-colors disabled:cursor-default disabled:opacity-40",
        drawn.track,
        checked ? "bg-nevo-navy" : "bg-nevo-near-black/[0.22]",
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          "absolute rounded-full bg-nevo-cream shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-[left] duration-150",
          drawn.knob,
          checked ? drawn.on : drawn.off,
        )}
      />
    </button>
  );
}

export { Switch };
