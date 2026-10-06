"use client";

import { useRef, useState } from "react";
import { Check } from "lucide-react";
import { NevoKeyboard } from "@/components/shared";
import { cn } from "@/lib/utils";

export type CodeStatus = "idle" | "pending" | "success" | "error";

/** The contract's bounds for a school code (`PinLoginRequest.schoolCode`). */
export const SCHOOL_CODE_MIN = 2;
export const SCHOOL_CODE_MAX = 50;

/** Uppercase; letters, digits and the hyphen real codes use. */
export function normaliseCode(raw: string, max: number): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, max);
}

export function codeIsEnterable(code: string, min: number): boolean {
  return code.trim().length >= min;
}

/**
 * A free-length school code field - 00c Sign Back In's, and nowhere else now.
 *
 * 05 Entry draws the four cells design ruled on 30 Sep (D6), from
 * `lib/auth/schoolCode`, since every school's code became four characters
 * (SCRUM-201). This field predates that: it was written when real codes were
 * `751A1136` and `BGA-4827`, so it guesses nothing - uppercased, trimmed,
 * hyphen kept, bounded by the contract - and the server decides whether it
 * names anything. 00c's frame draws four cells too; moving it over is its own
 * change.
 *
 * A code is submitted deliberately - Return, or the step's own button - rather
 * than fired the moment it looks full, because with no fixed length there is no
 * such moment, and checking on every keystroke would tell a child their
 * half-typed code was wrong.
 */
export function CodeInput({
  value,
  onChange,
  onSubmit,
  status,
  label,
  placeholder,
  min,
  max,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Return, or an on-screen keyboard's return key. */
  onSubmit: (code: string) => void;
  status: CodeStatus;
  /** Names the field for a screen reader, e.g. "School code". */
  label: string;
  placeholder: string;
  min: number;
  max: number;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [kbOpen, setKbOpen] = useState(false);

  const submit = () => {
    const code = value.trim();
    if (codeIsEnterable(code, min)) onSubmit(code);
  };

  const fieldBorder =
    status === "success"
      ? "border-nevo-navy"
      : status === "error"
        ? "border-nevo-violet"
        : "border-nevo-near-black/[0.16]";

  return (
    <div
      className={cn(
        "relative flex h-15 w-full items-center rounded-[10px] border-[1.5px] bg-nevo-cream px-4 shadow-elevation-1 transition-colors sm:h-17",
        fieldBorder,
      )}
    >
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(normaliseCode(e.target.value, max))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        onFocus={() => setKbOpen(true)}
        // ~120ms debounce per the handoff's keyboard-docking guidance.
        onBlur={() => {
          setTimeout(() => {
            if (document.activeElement !== inputRef.current) setKbOpen(false);
          }, 120);
        }}
        maxLength={max}
        // A.12: the Nevo Keyboard is the input on touch; a hardware keyboard
        // still types on desktop, where the on-screen one is hidden.
        inputMode="none"
        autoComplete="off"
        autoCapitalize="characters"
        autoFocus
        enterKeyHint="go"
        aria-label={label}
        placeholder={placeholder}
        className="h-full min-w-0 flex-1 bg-transparent pr-8 text-[22px] font-bold tracking-[0.06em] text-nevo-near-black uppercase outline-none placeholder:text-[15px] placeholder:font-normal placeholder:tracking-normal placeholder:text-nevo-near-black/35 sm:text-[26px]"
      />

      {(status === "pending" || status === "success") && (
        <div className="absolute top-1/2 right-4 flex size-7 -translate-y-1/2 items-center justify-center">
          {status === "pending" ? (
            <span className="size-5 rounded-full border-[2.5px] border-nevo-navy/20 border-t-nevo-navy motion-safe:animate-spin" />
          ) : (
            <span className="flex size-7 items-center justify-center rounded-full bg-nevo-navy motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-200">
              <Check className="size-4 text-nevo-cream" strokeWidth={2.6} />
            </span>
          )}
        </div>
      )}

      {kbOpen && (
        <NevoKeyboard
          layout="qwerty"
          onKey={(ch) => onChange(normaliseCode(value + ch, max))}
          onBackspace={() => onChange(value.slice(0, -1))}
          onReturn={submit}
          className="fixed inset-x-0 bottom-0 z-40"
        />
      )}
    </div>
  );
}
