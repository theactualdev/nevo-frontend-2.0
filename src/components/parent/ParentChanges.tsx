"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { parentApi, type ParentChild, type ParentLearningEvidence } from "@/lib/api/parent";

/*
 * D02b WHAT CHANGED (design 1397ec4), built REDUCED to what the server
 * returns (5 Nov check; raised to the hub, rule 10).
 *
 * What's here: the frame's heading, "What {child}'s strengthened", over the
 * concepts the server's own marking says this child has strengthened - each
 * with the day it was recorded. A fact about the child against themself; no
 * number, no level, no comparison (rules 3 and 9).
 *
 * What isn't, and why:
 *  - "Since you last looked, {day}." The read is all-time, and nothing holds
 *    when this parent last looked; a date kept on this device would say a
 *    false "since" on another, and filtering by it would be the page choosing
 *    the window.
 *  - A subject on each row, and "New this week" ("first met this week"): the
 *    read carries neither.
 *  - "Now secure" / "she's holding onto it now": the server says a line was
 *    crossed, not that the child has kept it - the same concept can be due
 *    back for review. LYDIA'S WORDS for it (SCRUM-321, 7 Nov): "{child}
 *    crossed the mark on this idea."
 *  - The empty state's "{child}'s just getting started": the read can't tell
 *    starting out from nothing strengthened yet. LYDIA'S ONE STATE for both
 *    (SCRUM-321): "Nothing has strengthened here yet." The home's way in shows
 *    only when there's something to list, but a kept link or Back can still
 *    land here on an empty list, so the screen says it itself.
 *  - "Measured against where {child} was before, not against anyone else":
 *    left for Lydia with the rest, rather than half-kept.
 * Pronouns become the child's name; this page uses none.
 */

type Read =
  | { kind: "loading" }
  | { kind: "failed" }
  | { kind: "none" }
  | { kind: "ready"; child: ParentChild; evidence: ParentLearningEvidence };

function onDay(iso: string): string | null {
  const t = Date.parse(iso);
  return Number.isNaN(t)
    ? null
    : new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function ParentChanges() {
  const wanted = useSearchParams().get("child");
  const [read, setRead] = useState<Read>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    parentApi
      .myChildren()
      .then((children) => {
        const child = children.find((c) => c.studentId === wanted) ?? children[0];
        if (!child) {
          if (alive) setRead({ kind: "none" });
          return;
        }
        return parentApi.learningEvidence(child.studentId).then((evidence) => {
          if (alive) setRead({ kind: "ready", child, evidence });
        });
      })
      .catch(() => {
        if (alive) setRead({ kind: "failed" });
      });
    return () => {
      alive = false;
    };
  }, [wanted, attempt]);

  return (
    <main className="min-h-dvh bg-nevo-cream text-nevo-near-black">
      <div className="flex h-14 items-center border-b border-nevo-near-black/8 px-5 md:h-16 md:px-10 lg:h-[66px] lg:px-12">
        <Image
          src="/brand/nevo-wordmark.png"
          alt="Nevo"
          width={344}
          height={116}
          priority
          className="h-[15px] w-auto"
        />
      </div>
      <div className="px-4 pt-[22px] pb-7 md:px-12 md:pt-9 md:pb-10 lg:py-10">
        <div className="mx-auto w-full md:max-w-[640px] lg:max-w-[760px]">
          <Link
            href="/parent-portal"
            className="text-[14px] font-semibold text-nevo-navy hover:opacity-75"
          >
            &larr; Portal home
          </Link>
          <Body read={read} retry={() => {
            setRead({ kind: "loading" });
            setAttempt((a) => a + 1);
          }} />
        </div>
      </div>
    </main>
  );
}

function Body({ read, retry }: { read: Read; retry: () => void }) {
  if (read.kind === "loading") {
    return <div aria-busy="true" className="mt-6 h-40" />;
  }
  if (read.kind !== "ready") {
    return (
      <div className="mt-5 rounded-[14px] bg-nevo-cream-elevated px-[22px] py-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
        <h1 className="m-0 text-[18px] font-semibold">
          {read.kind === "none" ? "Your account isn’t linked to a child yet" : "We couldn’t load this just now"}
        </h1>
        <p className="mt-1.5 mb-0 text-[14.5px] leading-[1.55] text-nevo-near-black/68">
          {read.kind === "none"
            ? "Your child’s school can link your account to them."
            : "Nothing has changed. Try again in a moment."}
        </p>
        {read.kind === "failed" ? (
          <button
            type="button"
            onClick={retry}
            className="mt-4 cursor-pointer text-[14.5px] font-semibold text-nevo-navy hover:underline"
          >
            Try again
          </button>
        ) : null}
      </div>
    );
  }

  const name = read.child.firstName?.trim() || "your child";
  const rows = read.evidence.strengthenedConcepts;
  return (
    <>
      <p className="mt-5 mb-0 text-[12.5px] font-medium text-nevo-near-black/55">
        {read.child.schoolName}
      </p>
      <h1 className="m-0 mt-1 text-[24px] font-semibold tracking-[-0.01em]">
        What {name}&rsquo;s strengthened
      </h1>
      {rows.length > 0 ? (
        <ul className="m-0 mt-5 list-none overflow-hidden rounded-[14px] bg-nevo-cream-elevated p-0 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
          {rows.map((r, i) => (
            <li
              key={`${r.conceptId}-${r.recordedAt}`}
              className={`flex items-baseline justify-between gap-4 px-[22px] py-4 ${
                i < rows.length - 1 ? "border-b border-nevo-near-black/7" : ""
              }`}
            >
              <span className="min-w-0">
                <span className="block text-[15.5px] font-semibold text-nevo-near-black">
                  {r.conceptName}
                </span>
                <span className="mt-0.5 block text-[13.5px] leading-[1.45] text-nevo-near-black/62">
                  {name} crossed the mark on this idea.
                </span>
              </span>
              {onDay(r.recordedAt) ? (
                <span className="shrink-0 text-[13px] text-nevo-near-black/55">{onDay(r.recordedAt)}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 mt-5 rounded-[14px] bg-nevo-cream-elevated px-[22px] py-5 text-[15px] leading-[1.55] text-nevo-near-black/70 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
          Nothing has strengthened here yet.
        </p>
      )}
      <Link
        href="/parent-portal"
        className="mt-5 inline-block text-[14.5px] font-semibold text-nevo-navy hover:underline"
      >
        See all {name}&rsquo;s subjects
      </Link>
    </>
  );
}
