"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks";
import { authApi } from "@/lib/api";
import { setSession } from "@/lib/auth/session";
import { ssoLanding } from "@/lib/auth/entryGate";
import { type UserRole } from "@/lib/constants";

/**
 * C02b - where "Continue with school SSO" lands after the identity provider.
 * A brief auto-routing screen, a quiet success bridge, and a calm error that
 * owns the failure and points to school IT - never the teacher.
 *
 * THE HANDSHAKE IS NOT SIMULATED, whatever this comment said until 16 Sep.
 * `authApi.ssoCallback` is a real GET against
 * `/api/v1/auth/sso/{provider}/callback` (`lib/api/auth.ts:257`) and its result
 * is what sets the session. What is still true is that no school can reach this
 * screen: nothing in the deployed spec ENROLS a school in SSO, so every sso
 * path presupposes a connection that cannot be created. Loaded with no code
 * on the URL, the screen shows its error state - which is also how design
 * reviews it. There is no `?mock=` switch.
 */

const SUCCESS_HOLD_MS = 900;

type Phase = "signing-in" | "success" | "error";

function Ring({ size }: { size: number }) {
  return (
    <span
      role="status"
      aria-label="Working"
      style={{ width: size, height: size }}
      className="rounded-full border-[2.5px] border-nevo-navy/20 border-t-nevo-navy motion-safe:animate-spin motion-safe:[animation-duration:800ms]"
    />
  );
}

function LogoMark() {
  return (
    <span className="relative block size-[31px] overflow-hidden xl:size-[34px]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/logo-icon-purple.png"
        alt="Nevo"
        className="absolute block h-[195px] w-[195px] max-w-none -translate-x-[82px] -translate-y-[86px] xl:h-[214px] xl:w-[214px] xl:-translate-x-[90px] xl:-translate-y-[94px]"
      />
    </span>
  );
}

export function TeacherSsoCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn } = useAuth();
  const [phase, setPhase] = useState<Phase>("signing-in");
  // Derived, not assigned: the URL is known at render, so an incomplete link
  // is a render-time fact. Setting it from the effect would be the
  // setState-in-effect the codebase rules out.
  const provider = searchParams.get("provider") ?? "";
  const code = searchParams.get("code") ?? "";
  const state = searchParams.get("state") ?? "";
  const incomplete = !provider || !code || !state;
  const shown: Phase = incomplete ? "error" : phase;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Schedules the handshake; only ever sets state from inside the
  // timer callback, so the effect body stays setState-free.
  /*
   * A REAL handshake, or none.
   *
   * This used to ignore the URL entirely and, after 1100ms, write
   * `setSession({ token: "", role: "teacher" })` and route to the dashboard.
   * The `nevo.role` cookie is what the route guard reads, so ANY anonymous
   * visitor who loaded this URL was let into the console shell - and because
   * the token was empty, every hook then fell back to fixtures, turning the
   * whole console into a demo that looked signed in. It also disarmed the
   * session-expired redirect, which only fires for a request that carried a
   * token.
   *
   * The contract requires `provider`, `code` and `state`; the response is a
   * real session. With no code on the URL there is no handshake to complete
   * and nothing to sign in with, so the screen says so instead of inventing
   * one. Starting the flow is separately blocked on the schoolSlug
   * chicken-and-egg (see `lib/api/sso.ts`), so in practice that is what a
   * visitor here will see today - which is the truth.
   */
  const schedule = useCallback(() => {
    if (incomplete) return;
    void authApi
      .ssoCallback({ provider, code, state })
      .then((res) => {
        const role = res.role as UserRole;
        /*
         * `destination` IS AN ENUM, NOT A ROUTE (T225): "home_dashboard" or
         * "observed_interaction". Handed to `router.replace` it was a relative
         * path that 404s. `ssoLanding` is the student callback's own answer:
         * the enum only decides a child's route, and a staff member goes to
         * their console's home. A role no console serves gets no session.
         */
        const landing = ssoLanding(role, res.destination);
        if (!landing) {
          setPhase("error");
          return;
        }
        setSession({
          token: res.accessToken,
          expiresAt: res.expiresAt,
          userId: res.userId,
          role,
        });
        // The callback carries no school, and `AuthUser.schoolId` is not
        // optional - so it is left to `users/me`, which returns the real one
        // once the session exists. Seeding a placeholder here would put an
        // invented school into the signed-in user.
        signIn({ id: res.userId, role, schoolId: "", method: "sso" });
        setPhase("success");
        timers.current.push(
          setTimeout(
            () => router.replace(landing),
            SUCCESS_HOLD_MS,
          ),
        );
      })
      .catch(() => setPhase("error"));
  }, [router, signIn, provider, code, state, incomplete]);

  useEffect(() => {
    const pending = timers.current;
    schedule();
    return () => pending.forEach(clearTimeout);
  }, [schedule]);

  /*
   * "TRY AGAIN" STARTS AGAIN. It re-ran the callback, which either did
   * nothing - with no code, the only state this screen can reach today, it
   * fell straight back to the error - or would re-send a single-use OAuth
   * code the provider has already spent. Trying again means beginning the
   * sign-in again, from the door.
   */
  const retry = () => router.push("/auth/teacher");

  return (
    <div className="flex w-full max-w-none flex-col items-center px-10 text-center xl:max-w-[440px]">
      {shown === "signing-in" && (
        <>
          <span className="mb-7">
            <LogoMark />
          </span>
          <Ring size={28} />
          {/*
            "Signing you in through {school}" named `TEACHER_INVITE.school`, a
            fixture, so a teacher of any school was told they were being signed
            in through Corona Secondary School.

            Nothing on this screen knows the school. The teacher arrives here
            from the identity provider BEFORE the token exchange, so there is no
            session to read a school off, and the callback carries a provider
            and a code, not a school name.

            "your school" is the honest version: it says what is happening
            without claiming to know whose. Same reasoning as the sign-in door's
            missing eyebrow.
          */}
          <p className="mt-6 text-[16px] text-nevo-near-black xl:text-[17px]">
            Signing you in through your school…
          </p>
        </>
      )}

      {shown === "success" && (
        <>
          <span className="mb-9 xl:mb-[38px]">
            <LogoMark />
          </span>
          <span className="flex size-[68px] items-center justify-center rounded-full bg-nevo-navy motion-safe:animate-nevo-pop xl:size-[72px]">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f7f1e6" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="xl:size-[34px]">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
          <h1 className="mt-6 text-[24px] font-semibold tracking-[-0.015em] text-nevo-near-black xl:mt-[26px] xl:text-[26px]">
            {"You're in"}
          </h1>
          <p className="mt-[11px] max-w-[380px] text-[16px] leading-[1.55] text-nevo-near-black/65 xl:mt-3 xl:max-w-[420px] xl:text-[16.5px]">
            {"Taking you to your dashboard…"}
          </p>
          <span className="mt-7 xl:mt-[30px]">
            <Ring size={22} />
          </span>
        </>
      )}

      {shown === "error" && (
        <>
          <LogoMark />
          <span className="mt-7 flex size-[68px] items-center justify-center rounded-full bg-nevo-violet/20 xl:mt-[30px] xl:size-[72px]">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3b3f6e" strokeWidth="2" strokeLinecap="round" aria-hidden className="xl:size-[34px]">
              <circle cx="12" cy="8" r="0.9" fill="#3b3f6e" />
              <path d="M12 11.5v6" />
              <circle cx="12" cy="12" r="9" />
            </svg>
          </span>
          <h1 className="mt-6 text-[24px] font-semibold tracking-[-0.015em] text-nevo-near-black xl:mt-[26px] xl:text-[26px]">
            {"We couldn't sign you in"}
          </h1>
          <p className="mt-[11px] max-w-[400px] text-[16px] leading-[1.55] text-nevo-near-black/65 xl:mt-3 xl:max-w-[440px] xl:text-[16.5px]">
            {"Something went wrong between Nevo and your school's sign-in. Nothing on your end - let's try once more, or your school's IT admin can check the connection."}
          </p>
          <button
            type="button"
            onClick={retry}
            className="mt-[30px] h-[52px] w-[340px] max-w-full cursor-pointer rounded-[10px] bg-nevo-navy text-[15.5px] font-semibold text-nevo-cream transition-[filter,transform] duration-150 hover:brightness-108 active:scale-[0.98] xl:mt-8 xl:h-[54px] xl:w-[360px] xl:text-[16px]"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => router.push("/auth/teacher")}
            className="mt-2 h-12 w-[340px] max-w-full cursor-pointer rounded-[10px] text-[14.5px] font-medium text-nevo-navy transition-[background-color,transform] duration-150 hover:bg-nevo-navy/6 active:scale-[0.98] xl:h-[50px] xl:w-[360px] xl:text-[15px]"
          >
            Sign in with a password instead
          </button>
        </>
      )}
    </div>
  );
}
