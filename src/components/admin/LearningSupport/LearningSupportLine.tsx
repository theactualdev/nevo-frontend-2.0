"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ApiError, apiErrorMessage } from "@/lib/api/client";
import {
  SELF_GRANT_FORBIDDEN,
  holderFor,
  learningSupportApi,
  refusedWith,
  type LearningSupportHolder,
  type LearningSupportHolders,
} from "@/lib/api/learningSupport";
import { cn } from "@/lib/utils";

/**
 * D03b Learning Support · permission line (design 9d0ff6b, 12 Oct; SCRUM-247).
 *
 * One line among the record's permissions, at the same weight as the others:
 * the label, "Granted by {name} · {date}" under it when held, and a toggle.
 * Routine staff administration, so no confirm step.
 *
 * Two invariants (design's reference, "Permissions live on the person's
 * record"):
 * - NEVER SELF-GRANTED. On your own record the line says whether you hold it
 *   and offers nothing to press - a quiet status, not a greyed control.
 * - THE LAST HOLDER. Removing it from the school's only holder is refused by
 *   the backend (SCRUM-248) and met with D03b's calm dialog: it names the
 *   holder, says to give it to someone else first, and closes. Nothing red.
 */

const FAILED = "That didn't go through, and nothing has changed. Try again in a moment.";
const SELF_GRANT = "Learning Support has to be given by another administrator.";

/** "12 October", with the year only when it isn't this one. */
function grantDate(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** D03b's "Granted by Mrs. F. Adebayo · 12 October". A granter with no name is left out. */
export function grantedLine(held: LearningSupportHolder, me: string | null): string | null {
  const by = held.grantedByName?.trim() || (held.grantedBy === me ? "you" : null);
  const on = grantDate(held.grantedAt);
  if (by && on) return `Granted by ${by} · ${on}`;
  if (on) return `Granted ${on}`;
  if (by) return `Granted by ${by}`;
  return null;
}

/** The refusal met by taking away the access of the school's only holder. */
export function lastHolderAccessLine(name: string): string {
  return `${name} is the only person in your school with Learning Support, so their access can't be removed. Give Learning Support to someone else first, then remove their access.`;
}

export function LearningSupportLine({
  person,
  holders,
  you,
  me,
  canGive,
  canRemove,
  onChange,
  className,
}: {
  person: { userId: string; name: string };
  holders: LearningSupportHolders;
  /** The viewer's own record: status only, nothing to press. */
  you: boolean;
  me: string | null;
  /** Whether it may be granted from here (an active person, writes not paused). */
  canGive: boolean;
  /** Whether it may be removed from here. */
  canRemove: boolean;
  /** The list as the server now has it, after a grant or a removal. */
  onChange: (next: LearningSupportHolders) => void;
  /** The row's own box: padding, divider, background. */
  className?: string;
}) {
  const [working, setWorking] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [lastHolder, setLastHolder] = useState(false);

  const held = holderFor(holders, person.userId);
  const granted = held ? grantedLine(held, me) : null;
  const sub = you
    ? held
      ? "Another administrator manages this. You can't grant Learning Support to yourself."
      : "Another administrator can grant you Learning Support."
    : granted;
  const enabled = !working && (held ? canRemove : canGive);

  const toggle = () => {
    if (!enabled) return;
    const removing = Boolean(held);
    setWorking(true);
    setRefusal(null);
    (removing ? learningSupportApi.remove : learningSupportApi.grant)(person.userId)
      .then(onChange)
      .catch((err: unknown) => {
        // The removal route's only conflict is the last holder (SCRUM-248);
        // its code is `last_learning_support_holder`, which the published
        // spec does not list yet, so the status decides.
        if (removing && err instanceof ApiError && err.status === 409) {
          setLastHolder(true);
          return;
        }
        if (refusedWith(err, SELF_GRANT_FORBIDDEN)) {
          setRefusal(SELF_GRANT);
          return;
        }
        setRefusal((err instanceof ApiError && apiErrorMessage(err.detail)) || FAILED);
      })
      .finally(() => setWorking(false));
  };

  return (
    <div className={className}>
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <span className="text-[15px] font-semibold text-nevo-near-black">Learning Support</span>
          {sub ? (
            <div className="mt-[3px] text-[13px] leading-[1.45] text-nevo-near-black/60">{sub}</div>
          ) : null}
        </div>
        {you ? (
          <span className="flex-none whitespace-nowrap text-[13px] font-semibold text-nevo-near-black/55">
            {held ? "Held" : "Not held"}
          </span>
        ) : (
          <button
            type="button"
            role="switch"
            aria-checked={Boolean(held)}
            aria-label={`Learning Support for ${person.name}`}
            onClick={toggle}
            disabled={!enabled}
            className={cn(
              "relative h-[26px] w-[44px] flex-none cursor-pointer rounded-full transition-colors disabled:cursor-not-allowed",
              held ? "bg-nevo-navy" : "bg-nevo-navy/25",
              working && "opacity-60",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "absolute top-[3px] size-[20px] rounded-full bg-nevo-cream transition-[left] duration-150",
                held ? "left-[21px]" : "left-[3px]",
              )}
            />
          </button>
        )}
      </div>
      {refusal ? (
        <p role="status" className="m-0 mt-2 text-[13px] leading-[1.5] text-nevo-near-black/70">
          {refusal}
        </p>
      ) : null}
      {lastHolder ? (
        <LastHolderDialog name={person.name} onClose={() => setLastHolder(false)} />
      ) : null}
    </div>
  );
}

/** D03b: "Removing the school's last holder · calm refusal". */
export function LastHolderDialog({ name, onClose }: { name: string; onClose: () => void }) {
  return (
    <CalmRefusal
      icon="heart"
      title="Someone needs to hold Learning Support"
      body={`${name} is the only person in your school with Learning Support right now. Give it to someone else first, then you can remove it here.`}
      onClose={onClose}
    />
  );
}

/**
 * D03b's calm refusal: an icon, what has to be true, how to get there, and
 * Close. Nothing red. Drawn twice - the last Learning Support holder (heart)
 * and the last senior administrator (shield).
 */
export function CalmRefusal({
  icon,
  title,
  body,
  onClose,
}: {
  icon: "heart" | "shield";
  title: string;
  body: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-nevo-near-black/32 p-7"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="w-[460px] max-w-full rounded-2xl bg-nevo-cream px-8 py-[30px] shadow-[0_24px_60px_rgba(0,0,0,0.3)] motion-safe:animate-nevo-pop max-lg:w-[440px] max-lg:px-7 max-lg:py-[26px]"
      >
        <span className="inline-flex size-[52px] items-center justify-center rounded-full bg-nevo-violet/22 text-nevo-navy max-lg:size-12">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {icon === "shield" ? (
              <>
                <path d="M12 3l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6l7-3z" />
                <path d="M9.5 12l1.8 1.8L15 10" />
              </>
            ) : (
              <path d="M12 21s-6.5-4.2-9-8.5A5 5 0 0 1 12 6a5 5 0 0 1 9 6.5C18.5 16.8 12 21 12 21z" />
            )}
          </svg>
        </span>
        <h3
          id={titleId}
          className="m-0 mt-[18px] text-[21px] font-semibold tracking-[-0.01em] text-nevo-near-black max-lg:mt-4 max-lg:text-[19px]"
        >
          {title}
        </h3>
        <p className="m-0 mt-[11px] text-[15px] leading-[1.6] text-nevo-near-black/70 max-lg:mt-2.5 max-lg:text-[14.5px]">
          {body}
        </p>
        <div className="mt-6 flex justify-end max-lg:mt-[22px]">
          <button
            ref={close}
            type="button"
            onClick={onClose}
            className="inline-flex h-12 cursor-pointer items-center rounded-[10px] bg-nevo-navy px-[26px] text-[15px] font-semibold text-nevo-cream transition-[filter] hover:brightness-110 max-lg:h-[46px] max-lg:px-6 max-lg:text-[14.5px]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
