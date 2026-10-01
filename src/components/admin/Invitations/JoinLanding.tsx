"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { invitesApi, type JoinLookup } from "@/lib/api/invites";
import { linkIsDead } from "@/lib/auth/linkAnswer";
import { cn } from "@/lib/utils";
import { PRIMARY_BTN, Spinner } from "../Roster/primitives";

/**
 * The join-link landing (D19, "JOIN LINK · parent / student-facing landing").
 *
 * This is the one surface in the admin ticket that a parent or a child will
 * ever see, and the only one that is MOBILE-FIRST - a join link arrives in a
 * message and gets opened on a phone. The desktop variant is the same page
 * with room around it, not a different design.
 *
 * It is also PUBLIC. `proxy.ts` guards `/teacher`, `/admin`, `/student` and
 * the sign-in doors, and its matcher never sees `/join`, so `/join/:token`
 * needs no exemption - but that is worth knowing rather than rediscovering:
 * this page must never assume a session, and `lookupJoin` is deliberately the
 * only call it makes before someone chooses to continue.
 *
 * A dead link is a dead end by design. It says so plainly and points at the
 * school; it offers no retry, because there is nothing the person holding it
 * can do from here. It is not styled as an error - a link that ran out of time
 * is not the reader's mistake.
 *
 * D19 DRAWS "EXPIRED" AND "INVALID / REVOKED" APART, AND THE CONTRACT CANNOT.
 * `JoinInspectionResponse.status` is the constant "valid", so a 200 is a good
 * link, and every dead one is the same 404 - *"Join link is invalid or
 * expired"*, live, 1 Oct. The expired panel used to be reached by comparing
 * `expiresAt` with this device's clock, which the server had already done: on
 * a tablet whose clock ran fast it turned a good invite away. Shipped reduced
 * to the one dead panel, whose words fit both, until the wire tells them apart.
 *
 * TODO(api): `GET /api/v1/join/{token}` returns
 * `{status, role, schoolName, expiresAt}` and no NAME, so D19's "Welcome,
 * Amara" cannot be personalised. The greeting is warm but general rather than
 * addressed to somebody we cannot name.
 *
 * DONE. This read: "Students do not: they land on onboarding with the token in
 * the query and nothing yet reads it... the student half of this handoff is not
 * finished until that route exists."
 *
 * Four files read it. `app/student/onboarding/page.tsx` passes `?token=`
 * through as `joinToken`, `WelcomeScreen` persists it to the onboarding draft,
 * `NameAndAgeStep` routes on it, and `ObservedInteractionSequence` redeems it
 * with `invitesApi.acceptJoin`. Both halves of the handoff are finished.
 */

/**
 * `failed` is the lookup ANSWERING that the link is dead - see `linkIsDead`.
 * `unreachable` is the lookup not answering at all - a network blip or a 5xx.
 * They used to be one state, so a brief outage told a teacher or a child that
 * their invite was "no longer valid" - on the one public page they reach from
 * a message, with no way to try again.
 */
type Phase = "loading" | "ready" | "failed" | "unreachable";

export function JoinLanding({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [lookup, setLookup] = useState<JoinLookup | null>(null);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    invitesApi
      .lookupJoin(token)
      .then((res) => {
        // A 200 IS the server saying the link is good: the status is a
        // constant on the wire, and expiry was judged where the clock is
        // right. See the docblock above.
        setLookup(res);
        setPhase("ready");
      })
      // A dead link is not an error state here - it IS the answer, and the
      // "no longer valid" panel below is what it means. Anything else is the
      // lookup failing to answer, which says nothing about the invite.
      .catch((err: unknown) => {
        setPhase(linkIsDead(err) ? "failed" : "unreachable");
      });
  }, [token, attempt]);

  const valid = phase === "ready";
  const invalid = phase === "failed";

  const isTeacher = (lookup?.role ?? "").toLowerCase() === "teacher";
  /*
   * `via=join` matters. The activation screen serves two token namespaces -
   * admin-team invitations and product-access join links - and posts to a
   * different endpoint for each. Without this flag it posted join tokens to
   * the admin-team accept, which does not know them, so a teacher invited
   * from the admin console could never redeem their link.
   */
  const onward = isTeacher
    ? `/auth/teacher/activate?token=${encodeURIComponent(token)}&via=join`
    : `/student/onboarding?token=${encodeURIComponent(token)}`;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-nevo-cream px-6 py-12">
      {/*
        * THE MARK, ABOVE THE PANEL AND OUTSIDE EVERY BRANCH.
        *
        * This is the one page in the lane a stranger opens from a link in a
        * message, on a phone, with nothing else around it - and it carried
        * nothing at all saying who had sent them. It renders in all four
        * states deliberately: an expired link is exactly the moment someone
        * wants to know whether the thing they were sent was real.
        *
        * The crop is the sidebar's, scaled - one source image, so the two
        * surfaces cannot drift apart.
        */}
      <span className="relative mb-9 block h-[24px] w-[81px] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/logo-wordmark-purple.png"
          alt="Nevo"
          className="absolute block h-[236px] w-[236px] max-w-none -translate-x-[85px] -translate-y-[113px]"
        />
      </span>
      <div className="w-full max-w-[420px] text-center">
        {phase === "loading" ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <Spinner />
            <p className="m-0 text-sm text-nevo-near-black/60">
              Checking your invitation…
            </p>
          </div>
        ) : null}

        {valid ? (
          <>
            <p className="m-0 text-[15px] leading-[1.6] text-nevo-near-black/62">
              {lookup?.schoolName
                ? `${lookup.schoolName} has invited you to Nevo`
                : "You have been invited to Nevo"}
            </p>
            <h1 className="m-0 mt-3 text-[30px] font-semibold tracking-[-0.02em] text-nevo-near-black">
              Welcome
            </h1>
            <p className="m-0 mt-2.5 text-[15px] text-nevo-near-black/62">
              You are joining as {isTeacher ? "a teacher" : "a student"}
            </p>
            <Link href={onward} className={cn(PRIMARY_BTN, "mt-8 w-full justify-center")}>
              Get started
            </Link>
          </>
        ) : null}

        {invalid ? (
          <>
            <h1 className="m-0 text-[26px] font-semibold tracking-[-0.018em] text-nevo-near-black">
              This invite is no longer valid
            </h1>
            <p className="m-0 mt-3 text-[15px] leading-[1.6] text-nevo-near-black/62">
              Contact your school administrator for help.
            </p>
          </>
        ) : null}

        {phase === "unreachable" ? (
          <>
            <h1 className="m-0 text-[26px] font-semibold tracking-[-0.018em] text-nevo-near-black">
              We couldn&rsquo;t check your invite just now
            </h1>
            <p className="m-0 mt-3 text-[15px] leading-[1.6] text-nevo-near-black/62">
              Your link may be fine &ndash; we just couldn&rsquo;t reach Nevo.
              Try again in a moment.
            </p>
            <button
              type="button"
              onClick={() => {
                setPhase("loading");
                setAttempt((n) => n + 1);
              }}
              className={cn(PRIMARY_BTN, "mx-auto mt-6")}
            >
              Try again
            </button>
          </>
        ) : null}
      </div>
    </main>
  );
}
