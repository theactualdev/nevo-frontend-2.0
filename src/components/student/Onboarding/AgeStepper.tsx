"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export const AGE_MIN = 5;
export const AGE_MAX = 18;
const AGE_DEFAULT = 11;

/** True when `value` parses to an age within the accepted range. */
export function isAgeInRange(value: string): boolean {
  const n = parseInt(value, 10);
  return !Number.isNaN(n) && n >= AGE_MIN && n <= AGE_MAX;
}

const clamp = (v: number) => Math.max(AGE_MIN, Math.min(AGE_MAX, v));

/** What the age field keeps of what was typed: two digits, nothing else. */
export function ageDigits(raw: string): string {
  return raw.replace(/[^0-9]/g, "").slice(0, 2);
}

/**
 * Age picker (UI/UX spec B.2 Step 1). Large tap-target stepper with a directly
 * editable numeric field. First +/- from empty jumps to the default age; typing
 * is digits-only and clamps to range on blur.
 *
 * THE DEVICE KEYBOARD STAYS DOWN. The step-1 frame docks the Nevo keyboard on
 * this field exactly as it does on the name, and this was the one field on the
 * screen that opened the tablet's own keyboard instead. The host owns the
 * dock: it passes the focus handlers and mounts the `NevoKeyboard`.
 */
export function AgeStepper({
  value,
  onChange,
  onFocus,
  onBlur,
}: {
  value: string;
  onChange: (value: string) => void;
  /** The host's keyboard dock opening for this field. */
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const parsed = value === "" ? null : parseInt(value, 10);
  const age = parsed === null || Number.isNaN(parsed) ? null : parsed;
  const inRange = age !== null && age >= AGE_MIN && age <= AGE_MAX;
  const decDisabled = inRange && age <= AGE_MIN;
  const incDisabled = inRange && age >= AGE_MAX;

  const step = (delta: number) =>
    onChange(String(age === null ? AGE_DEFAULT : clamp(age + delta)));

  const commit = () => {
    if (value === "") return;
    const p = parseInt(value, 10);
    onChange(Number.isNaN(p) ? "" : String(clamp(p)));
  };

  const btnBase =
    "flex size-12 items-center justify-center rounded-[10px] border-[1.5px] transition-colors";
  const btnActive =
    "cursor-pointer border-nevo-navy text-nevo-navy hover:bg-nevo-navy/[0.06]";
  const btnOff =
    "cursor-not-allowed border-nevo-near-black/[0.14] text-nevo-near-black/[0.32]";

  return (
    <div className="flex h-18 w-full items-center justify-between rounded-[10px] border-[1.5px] border-nevo-near-black/[0.16] bg-nevo-cream px-3 shadow-elevation-1">
      <button
        type="button"
        aria-label="Decrease age"
        disabled={decDisabled}
        onClick={() => step(-1)}
        className={cn(btnBase, decDisabled ? btnOff : btnActive)}
      >
        <Minus className="size-5" strokeWidth={2.2} />
      </button>

      <input
        value={value}
        onChange={(e) => onChange(ageDigits(e.target.value))}
        onFocus={onFocus}
        onBlur={() => {
          commit();
          onBlur?.();
        }}
        inputMode="none"
        autoComplete="off"
        aria-label="Age"
        placeholder="-"
        className="w-18 bg-transparent text-center text-[28px] font-semibold tracking-[-0.01em] text-nevo-near-black tabular-nums outline-none placeholder:text-nevo-near-black/40"
      />

      <button
        type="button"
        aria-label="Increase age"
        disabled={incDisabled}
        onClick={() => step(1)}
        className={cn(btnBase, incDisabled ? btnOff : btnActive)}
      >
        <Plus className="size-5" strokeWidth={2.2} />
      </button>
    </div>
  );
}
