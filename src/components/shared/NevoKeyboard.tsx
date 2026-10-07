"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Delete } from "lucide-react";
import { cn } from "@/lib/utils";

export type KeyboardLayout = "qwerty" | "pad";
export type KeyboardComposer = "single" | "multi";

/** Handoff: dock the keyboard behind focus state, debouncing blur ~120ms. */
const BLUR_DEBOUNCE_MS = 120;

/**
 * Focus-gated docking for the Nevo Keyboard (frontend handoff §05): a field sets
 * the dock open on focus and closed on blur, with the blur debounced ~120ms so
 * momentary focus churn (e.g. a key tap racing the guard on some platforms)
 * doesn't dismiss the keyboard. Refocusing within the window cancels the close.
 */
export function useNevoKeyboardDock() {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  const onFocus = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const onBlur = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), BLUR_DEBOUNCE_MS);
  };
  const close = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(false);
  };

  return { open, onFocus, onBlur, close };
}

/**
 * Nevo Keyboard (design frame · "Nevo Keyboard") — the branded on-screen keyboard
 * used wherever the app suppresses the native OS keyboard on web (Product Arch
 * A.12): onboarding text entry and PIN. Not the calculation's number entry,
 * which takes the device's numeric keyboard as the solver frame draws it -
 * this pad has no minus sign or decimal point (audit 51). Two layouts —
 * `pad` (3×4 numeric) and `qwerty` — sized for mobile (default) and tablet (md+).
 *
 * Presentational only: it emits key presses; the host owns the field state, so
 * the same physical-keyboard path keeps working on desktop (where this is hidden).
 * Chrome tones (`#e4ddcc` tray, `#d8d0be` modifier keys) are keyboard-specific,
 * not DS surface tokens.
 */
/**
 * WHO NEEDS THIS KEYBOARD IS A QUESTION ABOUT THE POINTER, NOT THE WIDTH.
 *
 * Every screen that uses this sets `inputMode="none"` on its field, which
 * suppresses the device's own keyboard - this one is meant to replace it. Each
 * caller then hid this with `lg:hidden`, on the assumption that 1024px or wider
 * means a desktop with a real keyboard attached.
 *
 * That assumption is false, and it locked children out. A touch tablet whose
 * PORTRAIT width is 1024px or more - an iPad Pro 12.9" is exactly 1024 - got no
 * device keyboard because we suppressed it, and no Nevo keyboard because we hid
 * it. No PIN, no name, no school code. The screens rendered perfectly and simply
 * would not accept a character, with nothing on screen to explain why and no
 * error to report.
 *
 * `(pointer: fine)` asks the right question: is the PRIMARY pointer a mouse or
 * trackpad? If so there is a hardware keyboard and this one is noise. A touch
 * device answers `coarse` however wide it is, and keeps its keyboard.
 *
 * The failure direction is deliberate. A tablet with a keyboard case may answer
 * `coarse` and get a keyboard it did not need - a small annoyance. The reverse,
 * which is what we shipped, is a child who cannot use the app at all. And a
 * browser too old to know `pointer` matches nothing, so the keyboard stays.
 *
 * It lives HERE rather than at each call site because the call sites are what
 * got it wrong: four repeated `lg:hidden`, and a fifth screen that forgot it.
 */
const HIDE_WHEN_A_REAL_KEYBOARD_EXISTS = "[@media(pointer:fine)]:hidden";

/** See the `presentation` prop. */
export type KeyboardPresentation = "docked" | "block";

export function NevoKeyboard({
  layout,
  presentation = "docked",
  onKey,
  onBackspace,
  onReturn,
  onDone,
  composer,
  value,
  placeholder = "Type here",
  className,
}: {
  layout: KeyboardLayout;
  /**
   * How the keys sit on the screen.
   *
   * `docked` (the default, and what every caller had): a full-width tray that
   * slides up from the bottom edge - the keyboard metaphor, for a field the
   * keyboard would otherwise cover.
   *
   * `block`: a compact, content-sized grid with no tray band and no slide-up,
   * for a single numeric field sat inside a layout rather than docked - a
   * child's PIN. The pad is simply part of the screen, so there is nothing to
   * summon and nothing that can cover the boxes it fills.
   *
   * Only meaningful for `layout="pad"`; a qwerty tray has no content-sized
   * form, and the type says so.
   */
  presentation?: KeyboardPresentation;
  /** A character key was pressed (letter, digit, or " "). */
  onKey: (char: string) => void;
  onBackspace: () => void;
  /** The accent "return" key (qwerty only). In `multi` it inserts a newline. */
  onReturn?: () => void;
  /**
   * PAD ONLY: a navy check key in the grid's empty bottom-left corner, for
   * "that's all of it".
   *
   * Separate from `onReturn` on purpose. A pad has never drawn a return key,
   * and callers already pass `onReturn` to one expecting nothing to appear -
   * the full sign-in does, and has its own Sign in button. This key exists for
   * the one screen that submits by itself and sometimes cannot: the one-tap
   * unlock, when a child's PIN is not the length the device remembers.
   */
  onDone?: () => void;
  /**
   * Attach a composer field above the tray (Nevo Keyboard frame) — for fields
   * the docked keyboard would cover, and `multi` for notes. Displays `value`.
   */
  composer?: KeyboardComposer;
  /** The host field's current text, mirrored in the composer. */
  value?: string;
  /** Composer placeholder while `value` is empty. */
  placeholder?: string;
  className?: string;
}) {
  /*
   * qwerty-only modes: capitalisation + a digits/symbols plane.
   *
   * SHIFT IS ONE-SHOT, armed for the first letter. It started on and stayed
   * on, so every name and message arrived in capitals - "AMARA" - unless a
   * child knew to find the shift key after the first letter. A phone's
   * keyboard capitalises the first letter and drops back by itself, and so
   * does this one now; tapping shift arms it again for one more letter.
   */
  const [caps, setCaps] = useState(true);
  const [numeric, setNumeric] = useState(false);

  const isMulti = composer === "multi";
  const hasVal = Boolean(value && value.length > 0);

  const block = presentation === "block" && layout === "pad";

  const tray = (
    <div
      className={cn(
        block
          ? // No tray band, no padding, no slide-up: the grid IS the assembly.
            "flex shrink-0 flex-col"
          : "flex shrink-0 flex-col gap-2.5 bg-[#e4ddcc] px-1.5 pt-1.5 pb-3 md:gap-[11px] md:px-3 md:pt-3 md:pb-3.5",
        // Without a composer the tray is the whole assembly: it carries the
        // top hairline and the slide-up itself.
        !composer &&
          !block &&
          "border-t border-nevo-near-black/8 motion-safe:animate-nevo-kb-up",
      )}
    >
      {layout === "pad" ? (
        <PadLayout
          block={block}
          onKey={onKey}
          onBackspace={onBackspace}
          onDone={onDone}
        />
      ) : (
        <QwertyLayout
          caps={caps}
          numeric={numeric}
          returnLabel={isMulti ? "return ↵" : "return"}
          onKey={onKey}
          onBackspace={onBackspace}
          onReturn={onReturn}
          onToggleCaps={() => setCaps((c) => !c)}
          onShiftSpent={() => setCaps(false)}
          onToggleNumeric={() => setNumeric((n) => !n)}
        />
      )}
    </div>
  );

  return (
    <div
      role="group"
      aria-label="On-screen keyboard"
      // Keep the focused field focused when a key is tapped (the keys drive its
      // state directly), so a focus-gated keyboard doesn't dismiss itself.
      onMouseDown={(e) => e.preventDefault()}
      className={cn(
        "flex flex-col",
        HIDE_WHEN_A_REAL_KEYBOARD_EXISTS,
        composer && "motion-safe:animate-nevo-kb-up",
        className,
      )}
    >
      {composer && (
        <div className="w-full border-t border-nevo-near-black/8 bg-[#e4ddcc] px-1.5 pt-1.5 pb-1 md:px-3 md:pt-3 md:pb-2">
          <div
            className={cn(
              "flex w-full flex-wrap rounded-[10px] border-[1.5px] border-nevo-near-black/16 bg-nevo-cream px-3.5 py-3 shadow-[inset_0_1px_2px_rgba(43,43,47,0.05)]",
              isMulti
                ? "min-h-[84px] items-start md:min-h-[100px]"
                : "min-h-[46px] items-center md:min-h-[52px]",
            )}
          >
            <span
              className={cn(
                "text-[16px] leading-[1.5] break-words whitespace-pre-wrap md:text-[18px]",
                hasVal ? "text-nevo-near-black" : "text-nevo-near-black/40",
              )}
            >
              {hasVal ? value : placeholder}
            </span>
            <span
              aria-hidden
              className="mt-0.5 ml-px inline-block h-[19px] w-[2px] bg-nevo-navy md:h-[22px] motion-safe:animate-nevo-kb-caret"
            />
          </div>
        </div>
      )}
      {tray}
    </div>
  );
}

/* ── shared key visuals ─────────────────────────────────────────────────── */

const KEY_BASE =
  "flex h-[42px] min-w-0 flex-1 cursor-pointer items-center justify-center rounded-md shadow-[0_1px_1px_rgba(43,43,47,0.28)] text-nevo-near-black transition-transform select-none active:scale-95 md:h-[46px] md:rounded-lg";

/** A standard cream key. */
function Key({
  label,
  onClick,
  grow,
}: {
  label: string;
  onClick: () => void;
  grow?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={grow ? { flexGrow: grow } : undefined}
      className={cn(
        KEY_BASE,
        "bg-nevo-cream text-[20px] font-normal md:text-[22px]",
      )}
    >
      {label}
    </button>
  );
}

/** A modifier key (⇧, 123/ABC, space) — `#d8d0be`, smaller label. */
function ModKey({
  label,
  onClick,
  grow,
  ariaLabel,
  children,
}: {
  label?: string;
  onClick: () => void;
  grow?: number;
  ariaLabel?: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      style={grow ? { flexGrow: grow } : undefined}
      className={cn(
        KEY_BASE,
        "bg-[#d8d0be] text-[13px] font-medium shadow-[0_1px_1px_rgba(43,43,47,0.22)] md:text-[15px]",
      )}
    >
      {children ?? label}
    </button>
  );
}

/** The navy accent key (return). */
function AccentKey({
  label,
  onClick,
  grow,
}: {
  label: string;
  onClick: () => void;
  grow?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={grow ? { flexGrow: grow } : undefined}
      className={cn(
        KEY_BASE,
        "bg-nevo-navy text-[13px] font-medium text-nevo-cream md:text-[15px]",
      )}
    >
      {label}
    </button>
  );
}

const ROW = "flex justify-center gap-1.5 md:gap-2";

/* ── pad (numeric) ──────────────────────────────────────────────────────── */

function PadLayout({
  block,
  onKey,
  onBackspace,
  onDone,
}: {
  /** Content-sized keys rather than a full-width tray. See `presentation`. */
  block: boolean;
  onKey: (d: string) => void;
  onBackspace: () => void;
  onDone?: () => void;
}) {
  const grid = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["", "0", "⌫"],
  ];
  /*
   * Block keys are a FIXED size rather than a share of the width, which is the
   * whole difference: a tray fills the screen edge to edge, and a pad sitting
   * inside a layout has to be the size of a pad. Sized up at the tablet
   * breakpoint rather than through a `variant` prop - every other size in this
   * component is responsive, and a prop would be one more thing a caller can
   * get wrong on a screen that is already the same on both.
   */
  const blockKey =
    "size-[60px] min-w-0 flex-none cursor-pointer items-center justify-center rounded-lg text-[22px] text-nevo-near-black shadow-[0_1px_1px_rgba(43,43,47,0.28)] transition-transform select-none active:scale-95 flex sm:h-[62px] sm:w-[72px] sm:text-[25px]";

  return (
    <div
      className={cn(
        block
          ? "mx-auto grid grid-cols-3 gap-2.5"
          : "mx-auto grid w-full max-w-[420px] grid-cols-3 gap-1.5 md:gap-2",
      )}
    >
      {grid.flat().map((d, i) => {
        if (d === "" && onDone) {
          return (
            <button
              key={i}
              type="button"
              aria-label="Done"
              onClick={onDone}
              className={cn(
                block ? blockKey : KEY_BASE,
                "bg-nevo-navy text-nevo-cream",
              )}
            >
              <Check className="size-5" strokeWidth={2.4} />
            </button>
          );
        }
        if (d === "") return <span key={i} aria-hidden />;
        if (d === "⌫") {
          return (
            <button
              key={i}
              type="button"
              aria-label="Delete"
              onClick={onBackspace}
              className={cn(
                block ? blockKey : KEY_BASE,
                "bg-[#d8d0be] shadow-[0_1px_1px_rgba(43,43,47,0.22)]",
              )}
            >
              <Delete className="size-5" strokeWidth={2} />
            </button>
          );
        }
        if (block) {
          return (
            <button
              key={i}
              type="button"
              onClick={() => onKey(d)}
              className={cn(blockKey, "bg-nevo-cream")}
            >
              {d}
            </button>
          );
        }
        return <Key key={i} label={d} onClick={() => onKey(d)} />;
      })}
    </div>
  );
}

/* ── qwerty ─────────────────────────────────────────────────────────────── */

const NUM_ROWS = [
  "1234567890".split(""),
  "-/:;()$&@".split(""),
  ".,?!'".split(""),
];

function QwertyLayout({
  caps,
  numeric,
  returnLabel,
  onKey,
  onBackspace,
  onReturn,
  onToggleCaps,
  onShiftSpent,
  onToggleNumeric,
}: {
  caps: boolean;
  numeric: boolean;
  returnLabel: string;
  onKey: (c: string) => void;
  onBackspace: () => void;
  onReturn?: () => void;
  onToggleCaps: () => void;
  /** A capital was typed, so the one-shot shift drops back to lowercase. */
  onShiftSpent: () => void;
  onToggleNumeric: () => void;
}) {
  const emit = (c: string) => {
    onKey(caps ? c.toUpperCase() : c.toLowerCase());
    if (caps) onShiftSpent();
  };

  const backspace = (
    <button
      type="button"
      aria-label="Delete"
      onClick={onBackspace}
      style={{ flexGrow: 1.5 }}
      className={cn(
        KEY_BASE,
        "bg-[#d8d0be] shadow-[0_1px_1px_rgba(43,43,47,0.22)]",
      )}
    >
      <Delete className="size-5" strokeWidth={2} />
    </button>
  );

  if (numeric) {
    return (
      <>
        <div className={ROW}>
          {NUM_ROWS[0].map((c) => (
            <Key key={c} label={c} onClick={() => onKey(c)} />
          ))}
        </div>
        <div className={ROW}>
          {NUM_ROWS[1].map((c) => (
            <Key key={c} label={c} onClick={() => onKey(c)} />
          ))}
        </div>
        {/*
          NO "#+=" KEY. It offered more symbols, there is no symbols page in
          the frame or in this component, and it called the SHIFT toggle - so
          tapping it changed nothing on this page and quietly flipped the case
          of the letters typed after it.
        */}
        <div className={ROW}>
          {NUM_ROWS[2].map((c) => (
            <Key key={c} label={c} onClick={() => onKey(c)} />
          ))}
          {backspace}
        </div>
        <div className={ROW}>
          <ModKey label="ABC" onClick={onToggleNumeric} grow={1.5} />
          <Key label="space" onClick={() => onKey(" ")} grow={5} />
          {onReturn && (
            <AccentKey label={returnLabel} onClick={onReturn} grow={1.8} />
          )}
        </div>
      </>
    );
  }

  const r1 = "QWERTYUIOP".split("");
  const r2 = "ASDFGHJKL".split("");
  const r3 = "ZXCVBNM".split("");
  const show = (c: string) => (caps ? c : c.toLowerCase());

  return (
    <>
      <div className={ROW}>
        {r1.map((c) => (
          <Key key={c} label={show(c)} onClick={() => emit(c)} />
        ))}
      </div>
      <div className={cn(ROW, "px-5")}>
        {r2.map((c) => (
          <Key key={c} label={show(c)} onClick={() => emit(c)} />
        ))}
      </div>
      <div className={ROW}>
        <ModKey
          onClick={onToggleCaps}
          grow={1.5}
          ariaLabel={caps ? "Lowercase" : "Uppercase"}
        >
          <span className={cn(!caps && "opacity-45")}>⇧</span>
        </ModKey>
        {r3.map((c) => (
          <Key key={c} label={show(c)} onClick={() => emit(c)} />
        ))}
        {backspace}
      </div>
      <div className={ROW}>
        <ModKey label="123" onClick={onToggleNumeric} grow={1.5} />
        <Key label="space" onClick={() => onKey(" ")} grow={5} />
        {onReturn && (
          <AccentKey label={returnLabel} onClick={onReturn} grow={1.8} />
        )}
      </div>
    </>
  );
}
