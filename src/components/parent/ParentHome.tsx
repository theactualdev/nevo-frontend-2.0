"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { getSession } from "@/lib/auth/session";
import { parentApi, type ParentChild } from "@/lib/api/parent";
import { ageChecksApi, holdStage } from "@/lib/api/ageChecks";
import { ChildWeek } from "./ChildWeek";

/**
 * The signed-in parent portal: D02's portal home, one subject card per subject.
 * It was D15d "How Amara Is Growing" until 11 Oct, a month after design struck
 * it - see `ChildWeek`.
 *
 * SEPARATE FROM `/parent/[token]`, which is public and stays that way: a
 * statutory data right must not sit behind a login. This surface is the other
 * half - what a parent sees once consent has given them an account.
 *
 * NO PROXY GUARD, deliberately. `proxy.ts` is optimistic by its own admission
 * (it reads a mirror cookie, not a session) and it is a shared file three
 * sessions edit. The real boundary is the API's Bearer check, which answers
 * 401 without a session and 403 for any non-parent role, and both are handled
 * here. A guard would add a second, weaker copy of a rule the server already
 * enforces.
 *
 * A signed-out parent is offered D03's sign-in, which exists now.
 */

type Phase = "loading" | "ready" | "signed-out" | "not-parent" | "failed";

export function ParentHome() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [children, setChildren] = useState<ParentChild[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  /**
   * Children whose date of birth the parent is being asked to give again
   * (SCRUM-243, D01d): the school has re-checked and the parent hasn't yet.
   * The route to D01d was left to us; this is it - one quiet line, only when
   * there is something to do. Its own read: unread asks nothing.
   */
  const [asks, setAsks] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let cancelled = false;
    // A missing local session and a session the server rejects are the SAME
    // fact to a parent, so they take the same path instead of being handled in
    // two places. Folding the local check into the chain also keeps every
    // setState inside a callback - `react-hooks/set-state-in-effect` exists
    // because a synchronous setState in an effect body cascades an extra
    // render. No request is made without a session; the throw happens first.
    Promise.resolve()
      .then(() => {
        if (!getSession()) throw new ApiError(401, "no local session");
        return parentApi.myChildren();
      })
      .then((kids) => {
        if (cancelled) return;
        ageChecksApi
          .parent()
          .then((checks) => {
            if (cancelled) return;
            setAsks(
              new Set(
                checks
                  .filter((c) => c.blocksAccess && holdStage(c) === "parent")
                  .map((c) => c.studentId),
              ),
            );
          })
          .catch(() => undefined);
        setChildren(kids);
        // One child is the overwhelmingly common case; making a parent pick
        // from a list of one is a step that exists only for the code's benefit.
        setSelected(kids.length === 1 ? kids[0].studentId : null);
        setPhase("ready");
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) setPhase("signed-out");
        else if (e instanceof ApiError && e.status === 403) setPhase("not-parent");
        else setPhase("failed");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (phase === "loading") {
    return (
      <Shell>
        <span
          role="status"
          aria-label="Loading"
          className="mx-auto block size-[22px] rounded-full border-[2.5px] border-nevo-navy/20 border-t-nevo-navy motion-safe:animate-spin motion-safe:[animation-duration:800ms]"
        />
      </Shell>
    );
  }

  if (phase === "signed-out" || phase === "not-parent") {
    return (
      <Shell>
        <Card>
          {/*
           * THIS USED TO BE A DEAD END. The heading read "Open the link your
           * school sent you", which was the only true thing to say while the
           * consent link was the only door - and became wrong twice over the
           * moment account setup shipped. Wrong for a parent who HAS an
           * account and should simply sign in; useless to one whose link has
           * expired, because a spent token 404s and the school has to issue a
           * new one. Sign-in exists now, so this offers it.
           */}
          <h1 className="text-[21px] font-semibold text-nevo-near-black">
            {phase === "not-parent"
              ? "This page is for parents and guardians"
              : "Sign in to see how your child is getting on"}
          </h1>
          <p className={BODY}>
            {phase === "not-parent"
              ? "If you have a Nevo account for school, sign in there instead."
              : "We’ll send a code to the email address or phone number your child’s school has for you."}
          </p>
          {phase === "signed-out" && (
            <a
              href="/parent-sign-in"
              className="mt-5 inline-flex h-[50px] w-full cursor-pointer items-center justify-center rounded-[10px] bg-nevo-navy text-[15px] font-semibold text-nevo-cream transition-[filter] duration-[120ms] hover:brightness-93"
            >
              Sign in
            </a>
          )}
          <p className={BODY}>
            {phase === "not-parent"
              ? "If you can’t find it, your child’s school can send you a new one."
              : "Haven’t set up an account yet? Open the consent link your child’s school sent you, or ask them to send a new one."}
          </p>
        </Card>
      </Shell>
    );
  }

  if (phase === "failed") {
    return (
      <Shell>
        <Card>
          <h1 className="text-[21px] font-semibold text-nevo-near-black">
            We couldn’t load this just now
          </h1>
          <p className={BODY}>
            Something went wrong at our end. Please try again in a moment.
          </p>
        </Card>
      </Shell>
    );
  }

  if (children.length === 0) {
    return (
      <Shell>
        <Card>
          <h1 className="text-[21px] font-semibold text-nevo-near-black">
            Nothing to show yet
          </h1>
          <p className={BODY}>
            Your account isn’t linked to a child yet. Your child’s school can
            sort that out for you.
          </p>
        </Card>
      </Shell>
    );
  }

  const selectedChild = children.find((c) => c.studentId === selected) ?? null;

  return (
    <Shell dataHref={`/parent-portal/data${selected ? `?child=${encodeURIComponent(selected)}` : ""}`}>
      {children.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {children.map((c) => {
            const on = c.studentId === selected;
            return (
              <button
                key={c.studentId}
                type="button"
                onClick={() => setSelected(c.studentId)}
                aria-pressed={on}
                className={`cursor-pointer rounded-full px-4 py-2 text-[14.5px] font-semibold transition-colors ${
                  on
                    ? "bg-nevo-navy text-nevo-cream"
                    : "bg-nevo-cream-elevated text-nevo-near-black hover:bg-nevo-navy/10"
                }`}
              >
                {c.firstName ?? "Your child"}
              </button>
            );
          })}
        </div>
      )}

      {selectedChild && asks.has(selectedChild.studentId) ? (
        <Link
          href={`/parent-portal/date-check?child=${encodeURIComponent(selectedChild.studentId)}`}
          className="mb-5 flex items-center justify-between gap-3 rounded-xl bg-nevo-cream-elevated px-5 py-4 text-[15px] font-semibold text-nevo-navy shadow-[0_2px_8px_rgba(0,0,0,0.05)] hover:bg-nevo-navy/[0.06]"
        >
          Can you confirm {selectedChild.firstName?.trim() || "your child"}&rsquo;s date of birth?
          <span aria-hidden>&rarr;</span>
        </Link>
      ) : null}

      {selectedChild ? (
        <ChildWeek
          key={selectedChild.studentId}
          studentId={selectedChild.studentId}
          firstName={selectedChild.firstName}
          schoolName={selectedChild.schoolName}
        />
      ) : (
        <Card>
          <h1 className="text-[21px] font-semibold text-nevo-near-black">
            Choose a child
          </h1>
          <p className={BODY}>
            Pick a name above to see how they&rsquo;re getting on.
          </p>
        </Card>
      )}
    </Shell>
  );
}

const BODY = "mt-3 text-[15px] leading-[1.6] text-nevo-near-black/68";

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[14px] bg-nevo-cream-elevated px-[22px] py-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
      {children}
    </div>
  );
}

/** D02's portal frame: the wordmark bar, then the page at its three widths. */
function Shell({
  children,
  dataHref,
}: {
  children: React.ReactNode;
  /**
   * L6 (Lydia, 14 Oct): a signed-in parent's route to D01c, where account
   * matters sit - the right of the bar, where D02 puts the parent's initials.
   * Only once the parent has a child to ask about.
   */
  dataHref?: string;
}) {
  return (
    <main className="min-h-dvh bg-nevo-cream text-nevo-near-black">
      <div className="flex h-14 items-center justify-between gap-4 border-b border-nevo-near-black/8 px-5 md:h-16 md:px-10 lg:h-[66px] lg:px-12">
        <Image
          src="/brand/nevo-wordmark.png"
          alt="Nevo"
          width={344}
          height={116}
          priority
          className="h-[15px] w-auto"
        />
        {dataHref ? (
          <Link
            href={dataHref}
            className="text-[14px] font-semibold text-nevo-navy hover:opacity-75"
          >
            Your child&rsquo;s data
          </Link>
        ) : null}
      </div>
      <div className="px-4 pt-[22px] pb-7 md:px-12 md:pt-9 md:pb-10 lg:py-10">
        <div className="mx-auto w-full md:max-w-[640px] lg:max-w-[760px]">
          {children}
        </div>
      </div>
    </main>
  );
}
