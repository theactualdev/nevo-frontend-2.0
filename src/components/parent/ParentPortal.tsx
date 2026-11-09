"use client";

import { useEffect, useState } from "react";
import { TryAgain } from "./TryAgain";
import { ApiError } from "@/lib/api/client";
import { parentApi, type ParentInvitation } from "@/lib/api/parent";
import { ParentConsent } from "./ParentConsent";
import { ParentDataManagement } from "./ParentDataManagement";

/**
 * The whole parent surface behind one tokenised link (SCRUM-80).
 *
 * A parent gets ONE link and taps it whenever they think of it - before
 * deciding, right after deciding, or six weeks later. So the route does not
 * decide what to show; the record does:
 *
 *   not_sent / pending  -> D01b, the consent request
 *   confirmed           -> D01c, data management
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

  /*
   * NO "WELCOME BACK" CARD FOR A HELD CHILD (Lydia, 9 Nov, item 9). D01e's
   * return state - sign in, or set up an account from this link - is the way
   * back after Maybe later, which her part-three hold keeps from shipping
   * ahead of the rest of that flow. It comes back as part of that flow when
   * she clears the hold, never as a card on its own.
   */
  return decided ? (
    <ParentDataManagement token={token} invitation={invitation} />
  ) : (
    <ParentConsent token={token} invitation={invitation} />
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-nevo-cream px-5 py-8 text-nevo-near-black">
      <div className="mx-auto w-full max-w-[560px]">{children}</div>
    </main>
  );
}
