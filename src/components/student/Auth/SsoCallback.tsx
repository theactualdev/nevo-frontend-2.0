"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Info } from "lucide-react";
import { Button } from "@/components/shared";
import { useAuth, useSignals } from "@/hooks";
import { authApi } from "@/lib/api/auth";
import { setSession } from "@/lib/auth/session";
import { studentDestination } from "@/lib/auth/entryGate";
import {
  BUSY_PHASE,
  BUSY_REASON,
  SIGNAL_EVENT_TYPES,
  type UserRole,
} from "@/lib/constants";
import { randomId } from "@/lib/utils";

type Phase = "signing-in" | "success" | "error";

/** A quiet beat on "You're in" before the redirect (matches the frame). */
const SUCCESS_HOLD_MS = 900;

/**
 * SSO callback (screen 00b) — the Student App's dedicated SSO entry point. The
 * identity provider redirects here after auth; we resolve the handshake, then:
 *   • first-ever sign-in → establish the session and route into onboarding
 *     (the Observed Interaction Sequence reads `method: "sso"` from that session)
 *   • returning student → straight into the app
 *   • failure → a calm, never-red error that points to the school, not the learner
 *
 * This keeps SSO architecturally separate from the manual Welcome → Steps 1–3
 * entry; the two paths converge only at the sequence.
 *
 * A REAL HANDSHAKE, OR NONE. This used to hand a genuine `code` and `state`
 * to `resolveMockSso`, which ignored both and invented
 * `{ id: "sso-<random>", schoolId: "school-demo" }`, called `signIn()` on it
 * and routed to a mock lesson. No token was ever stored, so `AuthContext` said
 * `authenticated` while `useHasSession()` stayed false - and every screen the
 * child then opened rendered fixtures. Any school signing in through an
 * identity provider would have onboarded every one of its children into an
 * account that did not exist.
 *
 * The TODO that stood here said the contract had not landed. It had:
 * `authApi.ssoCallback` is typed against the deployed spec and
 * `TeacherSsoCallback` has been calling it. This is the same implementation,
 * and the same rule - with no `provider`, `code` and `state` there is no
 * handshake to complete and nothing to sign in with, so the screen says so
 * rather than inventing one.
 *
 * Starting the flow is separately blocked on the `schoolSlug` chicken-and-egg
 * (see `lib/api/sso.ts`), so in practice that is what a visitor here sees
 * today - which is the truth.
 */
export function SsoCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn } = useAuth();
  const [phase, setPhase] = useState<Phase>("signing-in");
  // Read at render time: what the URL carries is a render-time fact, and
  // deriving it in an effect would be the setState-in-effect the codebase
  // rules out. All three are REQUIRED by the contract.
  const provider = searchParams.get("provider") ?? "";
  const code = searchParams.get("code") ?? "";
  const state = searchParams.get("state") ?? "";
  const incomplete = !provider || !code || !state;
  const shown: Phase = incomplete ? "error" : phase;
  // Short-lived signal session for the handshake window (SCRUM-94.8): waiting
  // on the identity provider is the system's time, marked so it is never read
  // as the student hesitating. A bare UUID and `sso`: the ingest contract
  // takes nothing else, and `auth-<id>` defaulted to a lesson stream with no
  // lesson, so it was held until the screen went and then dropped.
  const [signalSession] = useState(() => randomId());
  const { trackEvent } = useSignals(signalSession, undefined, "sso");

  useEffect(() => {
    if (shown !== "signing-in") return;
    trackEvent(SIGNAL_EVENT_TYPES.SYSTEM_BUSY, {
      reason: BUSY_REASON.AUTH_PENDING,
      phase: BUSY_PHASE.START,
    });
    return () =>
      trackEvent(SIGNAL_EVENT_TYPES.SYSTEM_BUSY, {
        reason: BUSY_REASON.AUTH_PENDING,
        phase: BUSY_PHASE.END,
      });
  }, [shown, trackEvent]);

  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resolve = useCallback(() => {
    if (incomplete) return;
    void authApi
      .ssoCallback({ provider, code, state })
      .then((res) => {
        const role = res.role as UserRole;
        setSession({
          token: res.accessToken,
          expiresAt: res.expiresAt,
          userId: res.userId,
          role,
        });
        // The callback carries no school, and `AuthUser.schoolId` is not
        // optional - so it is left to `users/me`, which returns the real one
        // once the session exists. Seeding a placeholder here would put an
        // invented school into the signed-in child.
        signIn({ id: res.userId, role, schoolId: "", method: "sso" });
        setPhase("success");
        // Where a first-ever sign-in goes is the SERVER's answer now. It used
        // to be a mock's `isFirstUse` flag, which nothing real set. Consent is
        // resolved on top of that answer, because SSO is an entry path like any
        // other - and `studentDestination` leaves a teacher's or an admin's
        // destination alone, since `consent-gate` is `students/me`.
        void studentDestination(res.destination).then((destination) => {
          redirectTimer.current = setTimeout(() => {
            router.replace(destination);
          }, SUCCESS_HOLD_MS);
        });
      })
      .catch(() => setPhase("error"));
  }, [router, signIn, provider, code, state, incomplete]);

  useEffect(() => {
    resolve();
    return () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    };
  }, [resolve]);

  const retry = () => {
    setPhase("signing-in");
    resolve();
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-nevo-cream px-9 text-center text-nevo-near-black">
      <Image
        src="/brand/nevo-wordmark.png"
        alt="Nevo"
        width={344}
        height={116}
        priority
        className="mb-9 h-5 w-auto"
      />

      {shown === "signing-in" && (
        <>
          <Spinner className="size-[26px]" />
          <p className="mt-6 text-base text-nevo-near-black sm:text-[17px]">
            Signing you in…
          </p>
        </>
      )}

      {shown === "success" && (
        <>
          <span className="flex size-16 items-center justify-center rounded-full bg-nevo-navy motion-safe:animate-nevo-pop">
            <Check className="size-[30px] text-nevo-cream" strokeWidth={2.4} />
          </span>
          <h1 className="mt-6 text-[21px] font-semibold tracking-[-0.01em] sm:text-[22px]">
            You&apos;re in
          </h1>
          <p className="mt-2.5 max-w-[290px] text-[15px] leading-[1.55] text-nevo-near-black/65 sm:max-w-[360px] sm:text-base">
            Taking you to Nevo…
          </p>
          <Spinner className="mt-7 size-[22px]" />
        </>
      )}

      {shown === "error" && (
        <>
          <span className="flex size-16 items-center justify-center rounded-full bg-nevo-violet/20">
            <Info className="size-[30px] text-nevo-navy" strokeWidth={2} />
          </span>
          <h1 className="mt-6 text-[21px] font-semibold tracking-[-0.01em] sm:text-[22px]">
            We couldn&apos;t sign you in
          </h1>
          <p className="mt-2.5 max-w-[290px] text-[15px] leading-[1.55] text-nevo-near-black/65 sm:max-w-[360px] sm:text-base">
            Something went wrong on our side. Let&apos;s try once more.
          </p>
          <Button className="mt-7 w-full max-w-[360px]" onClick={retry}>
            Try again
          </Button>
          <Button
            variant="ghost"
            className="mt-2 h-12 w-full max-w-[360px] text-[15px]"
            onClick={() => router.push("/auth/login")}
          >
            Contact your school
          </Button>
        </>
      )}
    </div>
  );
}

/** Navy ring spinner (DS "working" state) — honours reduced-motion via animate. */
function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Working"
      className={
        "block rounded-full border-[2.5px] border-nevo-navy/20 border-t-nevo-navy motion-safe:animate-spin motion-safe:[animation-duration:800ms] " +
        (className ?? "")
      }
    />
  );
}
