"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api/client";
import type { AdminAccessLevel } from "@/lib/api/permissions";
import { teamApi, type TeamMember } from "@/lib/api/team";
import { CalmRefusal } from "../LearningSupport/LearningSupportLine";

/**
 * D03b's administrator level line (design fc0b7ae, 14 Oct; Lydia's P2).
 *
 * One line on the person's record, beside Learning Support, at the same
 * weight: "Senior" as a quiet pill or "Standard" in muted text, and - for a
 * senior administrator looking at someone else who is active - "Make senior" or
 * "Return to standard" under it. Routine staff administration, so no confirm.
 *
 * - NEVER SELF-PROMOTED. On your own record it is status only, with D03b's
 *   line saying who can change it. The server agrees: both routes are a senior
 *   administrator's alone.
 * - THE LAST SENIOR. Returning the school's only senior to standard is refused
 *   (409 `last_senior_admin`) and met with D03b's calm dialog.
 *
 * NOT DRAWN: D03b's "Made senior by Mrs. F. Adebayo · 13 October". The team
 * read carries no promoted-by or promoted-at, so the line has no sub until it
 * does - asked of the backend, never invented.
 */

const FAILED = "That didn't go through, and nothing has changed. Try again in a moment.";
const NOT_SENIOR = "Only a senior administrator can change this.";

export function AdminLevelLine({
  person,
  level,
  you,
  canChange,
  onChange,
  className,
}: {
  person: { userId: string; name: string };
  level: AdminAccessLevel;
  /** The viewer's own record: status only, nothing to press. */
  you: boolean;
  /** A senior viewer, an active person, writes not paused. */
  canChange: boolean;
  /** The member as the server now has them. */
  onChange: (next: TeamMember) => void;
  /** The row's own box: padding, background. */
  className?: string;
}) {
  const [now, setNow] = useState<AdminAccessLevel>(level);
  const [working, setWorking] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [lastSenior, setLastSenior] = useState(false);

  const senior = now === "senior";
  const sub = you
    ? senior
      ? "Another senior administrator manages this."
      : "A senior administrator can make you senior."
    : null;

  const change = () => {
    if (working || !canChange || you) return;
    setWorking(true);
    setRefusal(null);
    (senior ? teamApi.demoteStandard : teamApi.promoteSenior)(person.userId)
      .then((next) => {
        if (next?.accessLevel) setNow(next.accessLevel);
        onChange(next);
      })
      .catch((err: unknown) => {
        if (senior && err instanceof ApiError && err.status === 409) {
          setLastSenior(true);
          return;
        }
        setRefusal(err instanceof ApiError && err.status === 403 ? NOT_SENIOR : FAILED);
      })
      .finally(() => setWorking(false));
  };

  return (
    <div className={className}>
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <span className="text-[15px] font-semibold text-nevo-near-black">Administrator level</span>
          {sub ? (
            <div className="mt-[3px] text-[13px] leading-[1.45] text-nevo-near-black/60">{sub}</div>
          ) : null}
        </div>
        <div className="flex flex-none flex-col items-end gap-1.5">
          {senior ? (
            <span className="whitespace-nowrap rounded-full bg-nevo-navy/10 px-[11px] py-[3px] text-[12.5px] font-semibold text-nevo-navy">
              Senior
            </span>
          ) : (
            <span className="whitespace-nowrap text-[13px] font-semibold text-nevo-near-black/55">
              Standard
            </span>
          )}
          {!you && canChange ? (
            <button
              type="button"
              onClick={change}
              disabled={working}
              aria-label={senior ? `Return ${person.name} to standard` : `Make ${person.name} senior`}
              className="cursor-pointer whitespace-nowrap text-[13px] font-semibold text-nevo-navy hover:opacity-75 disabled:cursor-default disabled:opacity-60"
            >
              {senior ? "Return to standard" : "Make senior"}
            </button>
          ) : null}
        </div>
      </div>
      {refusal ? (
        <p role="status" className="m-0 mt-2 text-[13px] leading-[1.5] text-nevo-near-black/70">
          {refusal}
        </p>
      ) : null}
      {lastSenior ? (
        <CalmRefusal
          icon="shield"
          title="Someone needs to be a senior administrator"
          body={`${person.name} is the only senior administrator at your school right now. Make someone else senior first, then you can change this.`}
          onClose={() => setLastSenior(false)}
        />
      ) : null}
    </div>
  );
}
