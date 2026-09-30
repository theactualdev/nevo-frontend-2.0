"use client";

import { useEffect, useRef } from "react";
import type { TeacherAssignmentRole } from "@/lib/api/classes";
import { cn } from "@/lib/utils";
import { useSetupGate } from "@/hooks";

/**
 * The shared vocabulary of the roster screens - D5 Classes, D6 Teachers and
 * D7 Students.
 *
 * These three screens are one family, and SCRUM-40 says so directly: role
 * pills use "the same two treatments everywhere a role appears", the assign
 * sheet on teacher detail is "a mirror rather than a variant" of the one on
 * class detail, and the Classes header actions match "the D7 pattern exactly".
 * Keeping them here is what makes that true by construction instead of by
 * three careful copies.
 *
 * FRAME vs SPEC, where the two disagree, and why the spec wins:
 * - Sheet width. The D5 frame draws 468px; SCRUM-40 says 420px for the create
 *   sheet and again for the assign sheet. Two independent spec statements
 *   against one frame value, so 420. Raised with design.
 * - Backdrop. The frame dims only; the spec's G1 rule adds a 0.4px blur.
 */

export const CARD =
  "rounded-xl bg-nevo-cream-elevated shadow-[0_2px_8px_rgba(0,0,0,0.06)] overflow-hidden";

export const ROW_DIVIDER = "border-b border-nevo-near-black/[0.07]";

/** Navy primary. `cursor-pointer` is house rule, not decoration. */
/*
 * D14 INTERACTION STATES. Hover, PRESSED and disabled are D14's per kind:
 *   primary - hover brightens to 1.12; pressed dims to 0.9 and drops 1px
 *   ghost   - hover fills #ede8dc; pressed fills #e5dfd3 and drops 1px
 *   both    - disabled at 40%, not-allowed, and a disabled control never
 *             moves or changes when pressed
 * Neither had a pressed state. The FOCUS ring is the same on every control in
 * the console, so it lives once in `app/admin/admin.css` rather than here.
 */
export const PRIMARY_BTN =
  "inline-flex flex-none cursor-pointer items-center gap-2 rounded-[10px] bg-nevo-navy px-[18px] py-[11px] text-[14.5px] font-semibold text-nevo-cream transition-[filter,transform] duration-[140ms] hover:brightness-[1.12] active:translate-y-px active:brightness-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100 disabled:active:translate-y-0 disabled:active:brightness-100";

export const GHOST_BTN =
  "inline-flex flex-none cursor-pointer items-center justify-center rounded-[10px] border-[1.5px] border-nevo-near-black/18 px-[18px] py-[11px] text-[14.5px] font-semibold text-nevo-near-black transition-[background-color,transform] duration-[140ms] hover:bg-nevo-cream-elevated active:translate-y-px active:bg-[#e5dfd3] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:active:translate-y-0 disabled:active:bg-transparent";

/**
 * A quiet navy text action - "Assign a teacher", "Archive this class".
 * `rounded-sm` so the console's focus ring sits around it rather than square.
 */
export const TEXT_ACTION =
  "inline-flex cursor-pointer items-center gap-[7px] rounded-sm text-sm font-semibold text-nevo-navy transition-opacity hover:opacity-75 active:opacity-60 disabled:cursor-not-allowed disabled:text-nevo-near-black/45 disabled:hover:opacity-100 disabled:active:opacity-100";

/**
 * WHY A WRITE CONTROL IS GREYED, in the setup gate's words.
 *
 * D24: *"The rest of the console is reachable and visibly locked."* D01b
 * AC-05 says the same for an unconfirmed address. A disabled button with no
 * reason is the thing both frames exist to avoid - the admin is left guessing
 * whether it is broken - so every screen that pauses a control renders this
 * once beside it. The sentence is `pauseNote`'s, never composed per screen,
 * so thirty controls cannot end up with thirty wordings for one reason.
 *
 * Renders nothing unless the gate KNOWS writes are paused; it fails open.
 */
export function PausedNote({ className }: { className?: string }) {
  const { writesPaused, note } = useSetupGate();
  if (!writesPaused || !note) return null;
  return (
    <p className={cn("m-0 text-[13px] leading-[1.5] text-nevo-near-black/55", className)}>
      {note}
    </p>
  );
}

export function PlusIcon({ size = 17 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function CheckIcon({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

export function CloseIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/**
 * Initials from a display name, falling back to the email's local part.
 *
 * A roster row whose name is null is not hypothetical - the admin team route
 * already returns one, which is why the email fallback is load-bearing rather
 * than defensive.
 */
export function initials(name: string | null, email?: string | null): string {
  const source = (name ?? "").trim() || (email ?? "").split("@")[0] || "";
  const words = source.split(/[\s._-]+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function Avatar({
  name,
  email,
  size = 38,
}: {
  name: string | null;
  email?: string | null;
  size?: number;
}) {
  return (
    <span
      aria-hidden="true"
      className="flex flex-none items-center justify-center rounded-full bg-nevo-navy/14 font-semibold text-nevo-navy"
      style={{ width: size, height: size, fontSize: size <= 32 ? 12 : 13 }}
    >
      {initials(name, email)}
    </span>
  );
}

const PILL_BASE =
  "inline-flex flex-none items-center rounded-full px-3 py-[5px] text-[12.5px] font-semibold text-nevo-navy";

/**
 * Primary reads heavier than Co-teacher, and that is the whole point: one
 * teacher per class leads. Both are navy on a tint - no red anywhere in the
 * admin set, and neither role is a problem state.
 */
export function RolePill({ role }: { role: TeacherAssignmentRole }) {
  const primary = role === "primary";
  return (
    <span className={cn(PILL_BASE, primary ? "bg-nevo-navy/12" : "bg-nevo-violet/24")}>
      {primary ? "Primary" : "Co-teacher"}
    </span>
  );
}

/**
 * The "worth a glance" marker: a class with nobody teaching it.
 *
 * SCRUM-40 fixes this copy and explains the reasoning - it is a STATE, not an
 * error and not a button. A violet dot, navy text, no icon, no red.
 *
 * The D5 frame's own text node reads "Assign a teacher", which turns the same
 * marker into an action. The spec names "No teacher yet" twice, once in its
 * FIXED COPY block marked do-not-paraphrase and once in D5b's no-teacher
 * state, so that is what ships. Raised with design.
 */
export function NoTeacherYet() {
  return (
    <span className="inline-flex items-center gap-[6px] text-[13.5px] font-semibold text-nevo-navy">
      <span aria-hidden="true" className="size-[7px] flex-none rounded-full bg-nevo-violet" />
      No teacher yet
    </span>
  );
}

export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="m-0 text-[13px] font-semibold uppercase tracking-[0.05em] text-nevo-near-black/50">
      {children}
    </h3>
  );
}

/**
 * A right-docked sheet: the single focused action.
 *
 * SCRUM-40's first rule draws the line - lists open into full PAGES, and a
 * sheet is reserved for one action with one decision plus a commit. Anything
 * needing more than that is a page, which is why there is no "manage class"
 * sheet anywhere in this family.
 *
 * Dismissal is Escape or a backdrop press, per G1. Focus moves into the sheet
 * on open so a keyboard reaches the fields without tabbing the page behind it.
 */
/**
 * DISMISSAL WHILE A WRITE IS IN FLIGHT.
 *
 * Both overlays dismiss three ways - Escape, a backdrop press, and the X - and
 * none of them could see whether the dialog had started a POST. So an admin
 * could reflex-press Escape at a spinner, the request would land (there is no
 * AbortController anywhere in `lib/api`, so a dismissed request always
 * completes), and the `.then` would set state on an unmounted tree, which
 * React discards in silence. The dialog's own honest copy - "the class was
 * created, but the teacher wasn't assigned", the erase confirmation, the
 * half-applied count on a bulk revoke - was never shown to anybody.
 *
 * That is the INVERSE of the law this console has fixed fifteen times over: a
 * write that DID happen, reading as one that did not. `WriteFailed`'s own
 * header states the assumption every one of those fixes was built on - "the
 * dialog stays open and the button stays pressable, because the admin's intent
 * has not been served yet" - and the primitive was the one thing that could
 * take the dialog away before the promise resolved.
 *
 * THE RULE: reflex dismissal is inert while `busy`; deliberate dismissal is not.
 *
 *   Escape   - inert. It carries no target and no confirmation, and it is the
 *              gesture most likely to be fired BECAUSE a write is slow.
 *   Backdrop - inert. It fires on mousedown, before a release could be
 *              redirected, so it already catches a click meant to refocus the
 *              window. Pressing empty space is not a statement about a POST.
 *   The X    - STAYS LIVE. It is the only route that must be acquired and
 *              clicked, the only one named in the accessibility tree, and the
 *              only one a keyboard reaches by decision rather than by reflex.
 *              Every dialog here already withdraws its own Cancel mid-write,
 *              so deadening the X too would leave a browser reload as the only
 *              exit - which loses strictly more than the dismissal does.
 *
 * Three overlays outside this file already worked this way by hand and are the
 * precedent: `AdminSignOutModal` gates Escape on `!busy`, `BillingContactSheet`
 * and `SsoView` gate their backdrops. None of the three has an X, which is why
 * they are silent on it.
 */
export function Sheet({
  title,
  subtitle,
  onClose,
  children,
  footer,
  /**
   * 420px is the default the spec sets for create and assign. D6's
   * reassignment sheet is the one exception at 472px, "matching the built
   * invite sheet" - it carries a scrolling list rather than two fields.
   */
  widthClass = "max-w-[420px]",
  busy = false,
}: {
  title: string;
  subtitle?: string | null;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
  widthClass?: string;
  /** True while this dialog's own write is in flight. See the note above. */
  busy?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);

  /*
   * `busy` IS IN THE DEPS, and it has to be.
   *
   * These deps were `[onClose]`, and most callers pass a stable handler - so a
   * `busy` read inside the listener would be captured on the first run and stay
   * `false` for the life of the dialog. The guard would read correctly in the
   * source and do nothing at all, which is the worst kind of fix.
   *
   * A ref would also solve it and is the usual dodge, but writing one during
   * render is what `react-hooks/refs` forbids. Re-registering a document
   * keydown when `busy` flips is cheap and happens at most twice per dialog.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-nevo-near-black/28 backdrop-blur-[0.4px] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
      onMouseDown={(e) => {
        if (busy) return;
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-busy={busy}
        tabIndex={-1}
        className={cn(
          "flex h-full w-full flex-col bg-nevo-cream shadow-[-8px_0_32px_rgba(0,0,0,0.16)] outline-none motion-safe:animate-nevo-sheet-r",
          widthClass,
        )}
      >
        <div className="flex flex-none items-start justify-between gap-3 border-b border-nevo-near-black/8 px-[26px] pb-[18px] pt-6">
          <div className="min-w-0">
            <span className="text-xl font-semibold tracking-[-0.01em] text-nevo-near-black">
              {title}
            </span>
            {subtitle ? (
              <p className="mt-1 text-[13px] text-nevo-near-black/60">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-[34px] flex-none cursor-pointer items-center justify-center rounded-lg text-nevo-near-black transition-colors hover:bg-nevo-near-black/[0.06]"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-[22px] overflow-y-auto px-[26px] py-6">
          {children}
        </div>

        <div className="flex flex-none items-center gap-3 border-t border-nevo-near-black/8 px-[26px] pb-[22px] pt-4">
          {footer}
        </div>
      </div>
    </div>
  );
}

/**
 * A centred modal - the one interruption these screens allow.
 *
 * SCRUM-40 asks for this shape specifically where an action changes what the
 * school sees everywhere else (archiving a class), and for a sheet everywhere
 * else. A modal stops you; a sheet sits beside the thing you were reading.
 * Keeping the two visually distinct is what makes the interruption mean
 * something.
 */
export function Modal({
  title,
  busy = false,
  subtitle,
  onClose,
  children,
  footer,
  /** D19's bulk preview needs room for a table; everything else wants 460. */
  widthClass = "max-w-[460px]",
}: {
  title: string;
  subtitle?: string | null;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
  widthClass?: string;
  /** True while this dialog's own write is in flight. See `Sheet`'s note. */
  busy?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);

  /** `busy` in the deps for the same reason as `Sheet` - see the note there. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-nevo-near-black/28 p-6 backdrop-blur-[0.4px] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
      onMouseDown={(e) => {
        if (busy) return;
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-busy={busy}
        tabIndex={-1}
        className={cn(
          "flex max-h-full w-full flex-col overflow-y-auto rounded-2xl bg-nevo-cream p-7 shadow-[0_20px_56px_rgba(0,0,0,0.28)] outline-none motion-safe:animate-nevo-rise",
          widthClass,
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="m-0 text-xl font-semibold tracking-[-0.01em] text-nevo-near-black">
              {title}
            </h3>
            {subtitle ? (
              <p className="mt-1 text-[13px] text-nevo-near-black/60">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-[34px] flex-none cursor-pointer items-center justify-center rounded-lg text-nevo-near-black transition-colors hover:bg-nevo-near-black/[0.06]"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="mt-4">{children}</div>

        <div className="mt-6 flex items-center gap-3">{footer}</div>
      </div>
    </div>
  );
}

/**
 * The one failure treatment these screens use.
 *
 * Violet, never red - the admin set has no red anywhere - and the system owns
 * the failure rather than blaming the person. What they typed is still there,
 * which the copy says out loud so they do not retype it defensively.
 */
export function FailureLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="m-0 flex-1 text-[13.5px] leading-[1.5] text-nevo-navy">{children}</p>
  );
}

export function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-[18px] flex-none animate-spin rounded-full border-[2.5px] border-nevo-navy/20 border-t-nevo-navy"
    />
  );
}
