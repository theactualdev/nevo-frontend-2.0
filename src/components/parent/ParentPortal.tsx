"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChildHeldLines, LINK_LIFETIME_LINE, isHeld } from "./childHeld";
import { TryAgain } from "./TryAgain";
import { ApiError } from "@/lib/api/client";
import { parentApi, type ParentInvitation } from "@/lib/api/parent";
import { AccountSetup, ParentConsent } from "./ParentConsent";
import { ParentDataManagement } from "./ParentDataManagement";

/**
 * The whole parent surface behind one tokenised link (SCRUM-80).
 *
 * A parent gets ONE link and taps it whenever they think of it - before
 * deciding, right after deciding, or six weeks later. So the route does not
 * decide what to show; the record does:
 *
 *   not_sent / pending  -> D01b, the consent request
 *   confirmed           -> D01c, data management - with D01e's held card on
 *                          top when the date-of-birth check holds the child
 *                          (`ageCheck`, Teslim's item 16): sign in if they
 *                          have an account (`parentAccountReady`), set one up
 *                          if not. The rights stay below it - a held child's
 *                          parent keeps the route to them (NDPA s.31).
 *   withdrawn           -> D01c, which opens in its suspended state
 *
 * Backend made this possible on purpose: an already-decided link still
 * resolves rather than 404ing, precisely so "a parent who already decided
 * lands on the state of that decision, not on the question again". Asking a
 * parent to consent to something they already consented to - or worse,
 * something they already withdrew - would be the single worst bug this
 * surface could have.
 *
 * The read happens HERE and once. Both screens take the invitation as a prop
 * rather than fetching their own, so there is one request, one loading state,
 * and no window where the two disagree about the same record.
 */

type Phase = "loading" | "ready" | "gone" | "failed";

export function ParentPortal({ token }: { token: string }) {
  const [invitation, setInvitation] = useState<ParentInvitation | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  /** Bumped by Try again, to read the link again. */
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    parentApi
      .getInvitation(token)
      .then((inv) => {
        if (cancelled) return;
        setInvitation(inv);
        setPhase("ready");
      })
      .catch((e) => {
        if (cancelled) return;
        // 404 covers unknown, revoked AND expired. All three are the same dead
        // end for a parent and have the same fix: the school issues a new link.
        setPhase(e instanceof ApiError && e.status === 404 ? "gone" : "failed");
      });
    return () => {
      cancelled = true;
    };
  }, [token, attempt]);

  const retry = () => {
    setPhase("loading");
    setAttempt((a) => a + 1);
  };

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

  if (phase === "gone" || !invitation) {
    return (
      <Shell>
        <div className="rounded-[14px] bg-nevo-cream-elevated px-[22px] py-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
          {/* A failed read, in Lydia's words (SCRUM-321): nothing about
              whether consent is recorded - unread, the page doesn't know. */}
          <h1 className="text-[21px] font-semibold text-nevo-near-black">
            {phase === "failed"
              ? "We couldn’t load this just now"
              : "This link is no longer active"}
          </h1>
          {phase === "failed" ? null : (
            <p className="mt-3 text-[15px] leading-[1.6] text-nevo-near-black/68">
              It may have expired, been replaced by a newer one, or the school may have updated
              your details. Contact your child&rsquo;s school and they can send you a fresh link.
            </p>
          )}
          {phase === "failed" ? <TryAgain onClick={retry} /> : null}
        </div>
      </Shell>
    );
  }

  // Only an affirmative decision moves a parent off the consent request.
  // `not_sent` and `pending` both mean "not decided yet" - see `consents.ts`,
  // where the same distinction is the whole of design's SCRUM-80 ruling.
  const decided =
    invitation.status === "confirmed" || invitation.status === "withdrawn";

  return decided ? (
    <ParentDataManagement
      token={token}
      invitation={invitation}
      lead={
        invitation.status === "confirmed" && isHeld(invitation.ageCheck) ? (
          <ReturningHeld token={token} invitation={invitation} />
        ) : null
      }
    />
  ) : (
    <ParentConsent token={token} invitation={invitation} />
  );
}

/**
 * D01e's return state: back through the same link, consent recorded, the
 * child held. Lydia's lines (SCRUM-321), then the one step that's theirs -
 * sign in, or set up the account they'll confirm from.
 */
function ReturningHeld({ token, invitation }: { token: string; invitation: ParentInvitation }) {
  const [skipped, setSkipped] = useState(false);
  const name = invitation.studentFirstName;
  const child = name ? name.charAt(0).toUpperCase() + name.slice(1) : "Your child";
  return (
    <div className="mb-3.5 rounded-[14px] bg-nevo-cream-elevated px-[22px] py-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
      <h2 className="text-[18px] font-semibold text-nevo-near-black">Welcome back.</h2>
      <p className="mt-1.5 text-[14.5px] leading-[1.55] text-nevo-near-black/68">
        {child}&rsquo;s consent is recorded.
      </p>
      <ChildHeldLines
        child={child}
        className="mt-1.5 mb-0 text-[14.5px] font-medium leading-[1.55] text-nevo-near-black/80"
      />
      {invitation.parentAccountReady ? (
        <Link
          href="/parent-sign-in"
          className="mt-4 flex h-12 w-full cursor-pointer items-center justify-center rounded-[10px] bg-nevo-navy px-5 text-[15px] font-semibold text-nevo-cream"
        >
          Sign in
        </Link>
      ) : skipped ? null : (
        <AccountSetup token={token} contact={invitation.parentContact} onSkip={() => setSkipped(true)} />
      )}
      <p className="mt-4 mb-0 text-[12.5px] leading-[1.5] text-nevo-near-black/55">{LINK_LIFETIME_LINE}</p>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-nevo-cream px-5 py-8 text-nevo-near-black">
      <div className="mx-auto w-full max-w-[560px]">{children}</div>
    </main>
  );
}
