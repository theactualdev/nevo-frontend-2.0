"use client";

import { useState } from "react";
import { ApiError, apiErrorMessage } from "@/lib/api/client";
import {
  LAST_LEARNING_SUPPORT_HOLDER,
  SELF_GRANT_FORBIDDEN,
  holderFor,
  learningSupportApi,
  refusedWith,
  type LearningSupportHolder,
  type LearningSupportHolders,
} from "@/lib/api/learningSupport";
import { longDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

/**
 * Learning Support on a person's record (SCRUM-247, Olayinka 12 Oct).
 *
 * WHERE: on the person's own record - their row in Admin Team, and a teacher's
 * page - beside everything else they are permitted to do. Never on
 * Compliance, which is a reporting surface.
 *
 * WHAT: whether they hold it, and where they do, who gave it and when. The
 * holder carries the granter's name since 13 Oct; one without it is left out
 * rather than guessed, and the date still shows.
 *
 * NEVER SELF-GRANTED. The backend allows an administrator to give it to
 * themselves; the console does not. Your own record shows where you stand and
 * offers no control at all - "an admin without it gets it from another admin".
 *
 * THE LAST HOLDER. Removing it from the only person who holds it is refused by
 * the backend (SCRUM-248, 409 `last_learning_support_holder`, 13 Oct) and
 * said here as what happened and what to do.
 */

export function givenLine(held: LearningSupportHolder, me: string | null): string | null {
  const by = held.grantedBy === me ? "you" : held.grantedByName?.trim() || null;
  const on = longDate(held.grantedAt);
  if (by && on) return `Given by ${by} on ${on}`;
  if (on) return `Given on ${on}`;
  if (by) return `Given by ${by}`;
  return null;
}

const FAILED = "That didn't go through, and nothing has changed. Try again in a moment.";

export function lastHolderLine(name: string): string {
  return `${name} is the only person in your school with Learning Support, so it can't be removed. Give Learning Support to someone else first, then remove it from ${name}.`;
}

/** The same refusal, met by taking the person's access away. */
export function lastHolderAccessLine(name: string): string {
  return `${name} is the only person in your school with Learning Support, so their access can't be removed. Give Learning Support to someone else first, then remove their access.`;
}

const SELF_GRANT = "Learning Support has to be given by another administrator.";

type Asking = "give" | "remove" | null;

export function LearningSupportRecord({
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
  /** This is the viewer's own record: shown, never changeable from here. */
  you: boolean;
  /** The viewer's user id, so a grant they made reads "Given by you". */
  me: string | null;
  /** Whether "Give" may be offered (an active person, writes not paused). */
  canGive: boolean;
  /** Whether "Remove" may be offered. */
  canRemove: boolean;
  /** The list as the server now has it, after a grant or a removal. */
  onChange: (next: LearningSupportHolders) => void;
  className?: string;
}) {
  const [asking, setAsking] = useState<Asking>(null);
  const [working, setWorking] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const held = holderFor(holders, person.userId);
  const given = held ? givenLine(held, me) : null;
  const offer: Asking = you ? null : held ? (canRemove ? "remove" : null) : canGive ? "give" : null;

  const confirm = () => {
    if (!asking) return;
    const write = asking === "give" ? learningSupportApi.grant : learningSupportApi.remove;
    const removing = asking === "remove";
    setWorking(true);
    setRefusal(null);
    write(person.userId)
      .then((next) => {
        setAsking(null);
        onChange(next);
      })
      .catch((err: unknown) => {
        setAsking(null);
        if (removing && refusedWith(err, LAST_LEARNING_SUPPORT_HOLDER)) {
          setRefusal(lastHolderLine(person.name));
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
    <div className={cn("text-[13px] leading-[1.5]", className)}>
      <p className="m-0 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {held ? (
          <span className="text-nevo-near-black/70">
            <span className="font-semibold text-nevo-navy">Learning Support</span>
            {given ? ` · ${given}` : null}
          </span>
        ) : (
          <span className="text-nevo-near-black/55">
            No Learning Support
            {you ? ". Another administrator can give it to you." : null}
          </span>
        )}
        {offer && asking === null ? (
          <button
            type="button"
            onClick={() => {
              setRefusal(null);
              setAsking(offer);
            }}
            disabled={working}
            className="cursor-pointer font-semibold text-nevo-navy hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
          >
            {offer === "give" ? "Give Learning Support" : "Remove Learning Support"}
          </button>
        ) : null}
      </p>

      {asking ? (
        <div className="mt-2.5 rounded-[10px] bg-nevo-violet/[0.18] px-4 py-3">
          <p className="m-0 text-[13.5px] leading-[1.5] text-nevo-navy">
            {asking === "give"
              ? `Give ${person.name} Learning Support? It opens a learner's adaptation history and progress reports, and it's recorded with your name and today's date.`
              : `Remove Learning Support from ${person.name}? This is recorded with your name and today's date.`}
          </p>
          <div className="mt-3 flex gap-2.5">
            <button
              type="button"
              onClick={confirm}
              disabled={working}
              className="cursor-pointer rounded-lg bg-nevo-navy px-4 py-2 text-[13.5px] font-semibold text-nevo-cream transition-[filter] hover:brightness-110 disabled:opacity-60"
            >
              {asking === "give"
                ? working
                  ? "Giving…"
                  : "Give Learning Support"
                : working
                  ? "Removing…"
                  : "Remove Learning Support"}
            </button>
            <button
              type="button"
              onClick={() => setAsking(null)}
              disabled={working}
              className="cursor-pointer rounded-lg px-4 py-2 text-[13.5px] font-semibold text-nevo-near-black/70 transition-colors hover:bg-nevo-near-black/[0.06]"
            >
              {asking === "give" ? "Cancel" : "Keep"}
            </button>
          </div>
        </div>
      ) : null}

      {refusal ? (
        <p role="status" className="m-0 mt-2 text-[13px] leading-[1.5] text-nevo-near-black/70">
          {refusal}
        </p>
      ) : null}
    </div>
  );
}
