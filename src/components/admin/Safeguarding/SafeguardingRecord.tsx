"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { LearningSupportHolders } from "@/lib/api/learningSupport";
import { safetyApi, type SafetyEvent } from "@/lib/api/safety";
import { getSession } from "@/lib/auth/session";
import { longDay } from "./SafeguardingView";
import { failureKind } from "../NoAccess";
import { ReadFailed } from "../ReadFailed";

/**
 * D08b's safeguarding line on a learner's profile (design 96cd4b4, 20 Oct).
 *
 * The same plain, dated shape as the Learning Support acknowledgement line -
 * no chip, no colour - with the one clarifier this case needs: seeing it is
 * not the same as resolving it. It routes to the safeguarding list, and the
 * list routes back here (design's reachability rule).
 *
 * ONLY FOR A LEARNING SUPPORT HOLDER, as the list is, and ONLY WHEN THERE IS
 * SOMETHING TO SAY: no entry for this child, or a read the server refuses
 * (the record is not this viewer's), draws nothing at all.
 *
 * A READ THAT FAILS IS SAID, NEVER SILENT (Hub, 25 Nov, TO-DO 13). It used to
 * draw nothing, and on this line nothing reads as "not flagged" - an untrue
 * state about a child, on the page a SENCo opens before a meeting. It is
 * asked whenever the viewer is not KNOWN to lack the role, so a holders read
 * that failed doesn't silence it either; the server's refusal still does.
 *
 * The child's own words are never on it, and there is no place for them.
 */
export function SafeguardingRecord({
  studentId,
  firstName,
  holders,
}: {
  studentId: string;
  firstName: string;
  holders: LearningSupportHolders | null;
}) {
  const mayRead = holders?.viewerHoldsIt !== false;
  const [latest, setLatest] = useState<SafetyEvent | null>(null);
  const [failed, setFailed] = useState(false);
  const [asked, setAsked] = useState(0);
  const [me] = useState(() => getSession()?.userId ?? null);

  useEffect(() => {
    if (!mayRead) return;
    let alive = true;
    safetyApi
      .events({ limit: 200 })
      // Newest first, so the first of this child's is the latest.
      .then((rows) => {
        if (!alive) return;
        setLatest(rows.find((e) => e.studentId === studentId) ?? null);
        setFailed(false);
      })
      .catch((err: unknown) => {
        // Refused is the role's answer: not this viewer's record, so silent.
        if (alive) setFailed(failureKind(err) !== "denied");
      });
    return () => {
      alive = false;
    };
  }, [mayRead, studentId, asked]);

  const retry = useCallback(() => {
    setFailed(false);
    setAsked((n) => n + 1);
  }, []);

  if (mayRead && failed) {
    return (
      <>
        <h3 className="mb-0 mt-7 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-nevo-near-black/45">
          Safeguarding
        </h3>
        <div className="mt-2.5 rounded-xl bg-nevo-cream-elevated px-[22px] py-5 max-xl:px-[18px] max-xl:py-4">
          <ReadFailed what={`${firstName}’s safeguarding record`} onRetry={retry} />
        </div>
      </>
    );
  }

  if (!mayRead || !latest) return null;

  const recorded = longDay(latest.createdAt);
  const seenOn = longDay(latest.acknowledgedAt);
  // The server's name for whoever recorded it as seen (fc058d4).
  const by =
    latest.acknowledgedByName?.trim() ||
    (latest.acknowledgedBy && latest.acknowledgedBy === me ? "You" : null);

  return (
    <>
      <h3 className="mb-0 mt-7 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-nevo-near-black/45">
        Safeguarding
      </h3>
      <div className="mt-2.5 rounded-xl bg-nevo-cream-elevated px-[22px] py-5 max-xl:px-[18px] max-xl:py-4">
        <p className="m-0 text-[14px] leading-[1.6] text-nevo-near-black max-xl:text-[12.5px]">
          A safeguarding concern was recorded for {firstName}
          {recorded ? ` on ${recorded}` : ""}. What {firstName} asked is never shown here.
        </p>
        {seenOn ? (
          <>
            <p className="m-0 mt-2.5 text-[13.5px] leading-[1.5] text-nevo-near-black/62 max-xl:text-[12px]">
              {by ? `${by} recorded this as seen on ${seenOn}.` : `This was recorded as seen on ${seenOn}.`}
            </p>
            <p className="m-0 mt-2.5 text-[13px] leading-[1.55] text-[#5b5e8f] max-xl:text-[11.5px]">
              Seeing it is not the same as resolving it. Your school&rsquo;s own safeguarding steps
              continue outside Nevo.
            </p>
          </>
        ) : null}
        <Link
          href="/admin/safeguarding"
          className="mt-3.5 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-nevo-navy hover:underline max-xl:text-[12.5px]"
        >
          Open the safeguarding list
          <span aria-hidden>&rarr;</span>
        </Link>
      </div>
    </>
  );
}
