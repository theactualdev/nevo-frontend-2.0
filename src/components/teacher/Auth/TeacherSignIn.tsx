"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { authApi } from "@/lib/api";
import {
  DOOR_HREF,
  DOOR_LABEL,
  doorForRole,
  knownRole,
  type ConsoleDoor,
} from "@/lib/auth/consoleDoor";
import { classifyLoginFailure } from "@/lib/auth/loginFailure";
import { useAuth } from "@/hooks";
import { cn } from "@/lib/utils";
import { SystemMessage } from "@/components/shared/SystemMessage";
import {
  SIGNED_OUT_HOLD_MS,
  SIGNED_OUT_LINE,
  SIGNED_OUT_PARAM,
} from "./signedOut";

/**
 * C02 Teacher Sign-In - the returning teacher's door. Email + password or
 * school SSO, never PIN (that's the students'). Wrong credentials own the
 * failure in soft violet - never red. Two views now: the form and the
 * "You're in" success bridge - reset moved to its own screen (C02d).
 *
 * Password sign-in is LIVE against POST /api/v1/auth/login/password (the
 * deployed contract); the session token is stored by authApi and the success
 * beat routes into the console. SSO IS NO LONGER A SIMULATED HOP - this line
 * said so while the code 150 lines below had already stopped pretending; the
 * button now explains that school sign-in is not set up rather than miming a
 * handoff. See the comment on the SSO handler. The frame draws the error banner
 * but leaves its copy blank - the messages here are ours, flagged in the PR.
 */

const SUCCESS_HOLD_MS = 1400;
const LIVE_TIMEOUT_MS = 20000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MISMATCH_MSG =
  "That email and password didn't match. Try again, or reset your password.";
/**
 * A 401 STOPPED BEING ONE THING, and this door was still reading it as one.
 *
 * Backend documents the distinction on `POST /api/v1/auth/login/password`
 * itself: "authentication_failed when the credential is wrong, account_paused
 * when it is right but the account is not open, too_many_attempts when rate
 * limited." Mapping all three to MISMATCH_MSG told a teacher whose password was
 * CORRECT that they had mistyped it, and told a rate-limited teacher to do the
 * one thing that extends the lockout.
 *
 * `classifyLoginFailure` already existed, already tested, already role-neutral,
 * and both student doors already used it. Only the two staff doors were left
 * reading a 401 as a typo.
 *
 * NO WHOLE-SCREEN PAUSE STATE HERE, deliberately. `Account On Pause` is drawn
 * "NEVO · STUDENT" and reads "If you have questions, talk to your teacher" -
 * which is not a sentence to show a teacher. Raised with design; until there is
 * a staff variant this stays an inline line that neither blames nor invites a
 * retry that cannot work.
 */
const PAUSED_MSG =
  "Your account isn't open at the moment. Your school admin can tell you more.";
const THROTTLED_MSG =
  "Too many attempts just now. Wait a few minutes before trying again.";
/**
 * Never a dead end: it says what to do instead, and names the admin rather
 * than leaving a teacher to guess who could turn it on.
 */
const SSO_UNAVAILABLE_MSG =
  "School sign-in isn't set up for Nevo yet. Use your email and password for now - your school admin can tell you when that changes.";
/**
 * NEVO, NOT "YOUR SCHOOL'S SIGN-IN". This door is Nevo's own password login,
 * so a network failure here is ours to own; naming the school's sign-in
 * pointed a teacher at a system that was never involved.
 */
const UNREACHABLE_MSG =
  "We couldn't reach Nevo right now. Nothing on your end - try again in a moment.";
/**
 * For a role no door serves. The admin door's sentence, word for word - the
 * two doors refuse the same way.
 */
const WRONG_DOOR_MSG =
  "Those details are right, but this account can’t be used to sign in here. Check with whoever set up your Nevo account.";

type Phase = "idle" | "signing" | "error" | "success";

const EYE_OPEN = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EYE_OFF = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 3l18 18" />
    <path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.4 17.4 0 0 1-3 3.9" />
    <path d="M6.1 6.1A17 17 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 3.9-.8" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </svg>
);

function Spinner({ onNavy = false, size = 18 }: { onNavy?: boolean; size?: number }) {
  return (
    <span
      role="status"
      aria-label="Working"
      style={{ width: size, height: size }}
      className={cn(
        "shrink-0 rounded-full border-[2.4px] motion-safe:animate-spin motion-safe:[animation-duration:900ms]",
        onNavy
          ? "border-nevo-cream/40 border-t-nevo-cream"
          : "border-nevo-navy/25 border-t-nevo-navy",
      )}
    />
  );
}

export function TeacherSignIn() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn } = useAuth();
  // The route guard appends ?next= when it turns someone away; send them
  // back where they were headed. Only same-app paths, never an open redirect.
  const nextParam = searchParams.get("next");
  const destination =
    nextParam && nextParam.startsWith("/teacher/")
      ? nextParam
      : "/teacher/dashboard";
  /** Arrived from signing out, so the door says so for a moment (T228). */
  const signedOut = searchParams.get(SIGNED_OUT_PARAM) === "1";
  const [signedOutSaid, setSignedOutSaid] = useState(false);
  useEffect(() => {
    if (!signedOut) return;
    const t = setTimeout(() => {
      setSignedOutSaid(true);
      // Off the address too, or a reload would say it again.
      const rest = new URLSearchParams(searchParams.toString());
      rest.delete(SIGNED_OUT_PARAM);
      const q = rest.toString();
      router.replace(q ? `/auth/teacher?${q}` : "/auth/teacher");
    }, SIGNED_OUT_HOLD_MS);
    return () => clearTimeout(t);
  }, [signedOut, searchParams, router]);
  /** Which attempt is current, so a late answer to an abandoned one can be told apart. */
  const attempt = useRef(0);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [errMsg, setErrMsg] = useState("");
  /**
   * Where they belong instead, when the details were right for a different
   * console. Null for every other failure, and for a role no door serves -
   * `WRONG_DOOR_MSG` covers that one.
   */
  const [wrongDoor, setWrongDoor] = useState<ConsoleDoor | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const validEmail = EMAIL_RE.test(email.trim());
  const canSubmit = validEmail && pw.length >= 6;
  const emailInvalid = email.trim().length > 0 && !validEmail;
  const pwInvalid = pw.length > 0 && pw.length < 6;

  const clearError = useCallback(() => {
    setPhase((p) => (p === "error" ? "idle" : p));
  }, []);

  const submit = () => {
    if (!canSubmit || phase === "signing" || phase === "success") return;
    setPhase("signing");
    setWrongDoor(null);
    const mine = ++attempt.current;
    const live = authApi.loginPassword({ email: email.trim(), password: pw });
    const cap = new Promise<never>((_, reject) =>
      timers.current.push(
        setTimeout(() => reject(new Error("timeout")), LIVE_TIMEOUT_MS),
      ),
    );
    Promise.race([live, cap])
      .then((session) => {
        /*
         * REFUSE AT THE DOOR, NOT AFTER IT - what the admin door has done
         * since 23 Sep, and this one never did.
         *
         * Any role was let in: an admin's details were stored as a session,
         * shown "You're in", and pushed at `/teacher/dashboard` - where
         * `proxy.ts` bounced them back here with the session still live, and
         * round again. `doorForRole` is built on the guard's own rule, so the door
         * and the guard cannot disagree about who belongs.
         */
        const role = knownRole(session.role);
        const belongs = doorForRole(role);
        if (belongs !== "teacher" || !role) {
          setWrongDoor(belongs);
          setErrMsg(WRONG_DOOR_MSG);
          setPhase("error");
          // The login SUCCEEDED, so a session exists. Someone told "not here"
          // must not leave carrying one; `logout` clears locally regardless.
          void authApi.logout().catch(() => {});
          return;
        }
        signIn({
          id: session.userId,
          role,
          schoolId: "",
          method: "manual",
        });
        setPhase("success");
        timers.current.push(
          setTimeout(() => router.push(destination), SUCCESS_HOLD_MS),
        );
      })
      .catch((err: unknown) => {
        /*
         * GAVE UP, BUT THE LOGIN MAY STILL LAND (T206). After the cap the
         * teacher is told Nevo could not be reached - and the request is still
         * out. `loginPassword` stores the session it gets, so a late answer
         * left them signed in behind a screen saying they were not, and the
         * door's next load bounced them into the console. If it lands, end it;
         * unless they have since tried again, in which case it is theirs.
         */
        if (err instanceof Error && err.message === "timeout") {
          live
            .then(() => {
              if (attempt.current === mine) void authApi.logout().catch(() => {});
            })
            .catch(() => {});
        }
        const failure = classifyLoginFailure(err);
        setErrMsg(
          failure === "paused"
            ? PAUSED_MSG
            : failure === "throttled"
              ? THROTTLED_MSG
              : failure === "credentials"
                ? MISMATCH_MSG
                : UNREACHABLE_MSG,
        );
        setPhase("error");
      });
  };

  /**
   * SCHOOL SSO CANNOT WORK YET, AND THIS NO LONGER PRETENDS IT CAN.
   *
   * It used to hold a spinner reading "Taking you to Microsoft..." for 1.4s and
   * then push to `/auth/teacher/sso-callback` with no provider, code or state -
   * which is exactly the shape that callback renders its ERROR phase for. So
   * the most prominent secondary control on the first screen a school sees
   * mimed a handoff to a named provider and then failed, every time.
   *
   * It cannot be wired from here either. `POST /auth/sso/start` is public but
   * needs `{schoolSlug, provider}`, and nothing available before sign-in yields
   * a slug - `SchoolCodeResponse` carries `authMethod` but no slug. More to the
   * point, NOTHING IN THE API CREATES AN SSO CONNECTION: all ten sso operations
   * presuppose one. So a correctly-wired start would fail for every school.
   *
   * The affordance stays, because design drew it and a school that expects SSO
   * should get an answer rather than a missing button. It just tells the truth
   * now, and points at the route that does work.
   */
  const sso = () => {
    if (phase === "signing" || phase === "success") return;
    setErrMsg(SSO_UNAVAILABLE_MSG);
    setPhase("error");
  };

  // The design moved reset onto its own screen - navigate, don't swap views.
  const forgot = () => router.push("/auth/teacher/reset");

  const isSuccess = phase === "success";
  const isForm = !isSuccess;
  /** The one failure that is about the password typed. */
  const mismatch = phase === "error" && errMsg === MISMATCH_MSG;

  return (
    <div className="relative flex min-h-full w-full flex-1 items-center justify-center px-6 py-[88px]">
      <span className="absolute top-[34px] left-[clamp(24px,4vw,48px)] block h-[18px] w-[62px] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/logo-wordmark-purple.png"
          alt="Nevo"
          className="absolute block h-[181px] w-[181px] max-w-none -translate-x-[66px] -translate-y-[87px]"
        />
      </span>

      <div className="w-full max-w-[432px]">
        {isForm && (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="flex flex-col items-start"
          >
            {/*
              NO SCHOOL EYEBROW. The frame draws "Corona Secondary School ·
              Lagos" here and this shipped it as a literal, so every teacher at
              every school was greeted by one tenant's name.

              The frame resolves school identity BEFORE auth, from the
              school-specific URL that D10 issues. Nothing hands this door a
              school: there is no school-code step on the teacher door, and
              `POST /api/v1/auth/school-code/verify` is keyed on a code the
              teacher never types. So naming a school here is inventing one.

              Removed rather than made dynamic, which is the same call the admin
              door made for the same reason (`AdminSignIn.tsx`). When a pre-auth
              lookup exists, both doors get it together.
            */}
            <h1 className="text-[34px] leading-[1.15] font-semibold tracking-[-0.02em]">
              Welcome back
            </h1>
            <p className="mt-3 text-[16px] leading-[1.55] text-nevo-near-black/70">
              Sign in to your teacher console.
            </p>

            <label
              htmlFor="teacher-email"
              className="mt-[30px] text-[13.5px] font-semibold text-nevo-near-black/70"
            >
              Email
            </label>
            <input
              id="teacher-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearError();
              }}
              placeholder="you@yourschool.edu.ng"
              className="mt-2 h-[52px] w-full rounded-[10px] border-[1.5px] border-nevo-near-black/16 bg-nevo-cream-elevated px-4 text-[16px] text-nevo-near-black transition-[border-color,background-color] duration-150 outline-none focus:border-nevo-navy focus:bg-nevo-cream"
            />
            {emailInvalid && (
              <p className="mt-[7px] text-[13px] text-[#7c7ea8]">
                Enter a valid email address to continue.
              </p>
            )}

            <div className="mt-[22px] flex w-full items-baseline justify-between">
              <label
                htmlFor="teacher-password"
                className="text-[13.5px] font-semibold text-nevo-near-black/70"
              >
                Password
              </label>
              <button
                type="button"
                onClick={forgot}
                className="cursor-pointer text-[13.5px] font-medium text-nevo-navy"
              >
                Forgot your password?
              </button>
            </div>
            <div
              className={cn(
                "mt-2 flex h-[52px] w-full items-center rounded-[10px] border-[1.5px] bg-nevo-cream-elevated pr-3.5 pl-4 transition-[border-color] duration-150",
                // The violet mismatch border owns the field until typing
                // clears it - even while focused (the frame's error state).
                // A MISMATCH only (T207): paused, throttled, unreachable and
                // SSO all marked the password as the thing that was wrong.
                mismatch
                  ? "border-nevo-violet focus-within:border-nevo-violet"
                  : "border-nevo-near-black/16 focus-within:border-nevo-navy",
              )}
            >
              <input
                id="teacher-password"
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                value={pw}
                onChange={(e) => {
                  setPw(e.target.value);
                  clearError();
                }}
                placeholder="Enter your password"
                aria-invalid={mismatch || undefined}
                className="h-full min-w-0 flex-1 border-none bg-transparent text-[16px] text-nevo-near-black outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                aria-label={showPw ? "Hide password" : "Show password"}
                className="flex shrink-0 cursor-pointer pl-2 text-nevo-near-black/50"
              >
                {showPw ? EYE_OFF : EYE_OPEN}
              </button>
            </div>
            {pwInvalid && (
              <p className="mt-[7px] text-[13px] text-[#7c7ea8]">
                Use at least 6 characters.
              </p>
            )}

            {phase === "error" && (
              <div
                role="status"
                className="mt-3.5 flex w-full items-start gap-2.5 rounded-[10px] bg-nevo-violet/18 px-[15px] py-[13px] motion-safe:animate-nevo-reveal"
              >
                <span className="mt-px shrink-0 text-nevo-navy">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 8h.01M11 12h1v4h1" />
                  </svg>
                </span>
                <span className="text-[14px] leading-[1.5] text-nevo-near-black">
                  {wrongDoor ? (
                    <>
                      Those details are right, but this is the teacher sign-in.
                      Your account is a {DOOR_LABEL[wrongDoor]} account &ndash;{" "}
                      <Link
                        href={DOOR_HREF[wrongDoor]}
                        className="cursor-pointer font-semibold text-nevo-navy underline underline-offset-2"
                      >
                        sign in as a {DOOR_LABEL[wrongDoor]}
                      </Link>
                      .
                    </>
                  ) : (
                    errMsg
                  )}
                </span>
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className={cn(
                "mt-[30px] flex h-[54px] w-full items-center justify-center rounded-[10px] text-[16px] font-semibold tracking-[-0.005em] transition-[filter] duration-150",
                canSubmit
                  ? "cursor-pointer bg-nevo-navy text-nevo-cream hover:brightness-93"
                  : "cursor-not-allowed bg-nevo-navy/32 text-nevo-cream/85",
              )}
            >
              {phase === "signing" ? (
                <span className="flex items-center gap-2.5">
                  <Spinner onNavy />
                  {"Signing you in…"}
                </span>
              ) : (
                "Sign in"
              )}
            </button>

            <div className="mt-6 flex w-full items-center gap-3.5 text-[12.5px] text-nevo-near-black/40">
              <span className="h-px flex-1 bg-nevo-near-black/14" />
              or
              <span className="h-px flex-1 bg-nevo-near-black/14" />
            </div>

            <button
              type="button"
              onClick={sso}
              className="mt-6 flex h-[54px] w-full cursor-pointer items-center justify-center gap-[11px] rounded-[10px] border-[1.5px] border-nevo-navy/28 bg-nevo-cream-elevated text-[15.5px] font-semibold text-nevo-navy transition-[filter] duration-150 hover:brightness-[0.97]"
            >
              {(
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <path d="M3 8h18M9 4v16" />
                  </svg>
                  Continue with school SSO
                </>
              )}
            </button>
          </form>
        )}

        {isSuccess && (
          <div className="flex flex-col items-center text-center motion-safe:animate-nevo-reveal">
            <span className="flex size-[72px] items-center justify-center rounded-full bg-nevo-navy motion-safe:animate-nevo-pop">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#f7f1e6" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
            <h1 className="mt-[26px] text-[30px] font-semibold tracking-[-0.02em]">
              {"You're in"}
            </h1>
            <p className="mt-3 text-[16px] leading-[1.55] text-nevo-near-black/70">
              Taking you to your console.
            </p>
            <span className="mt-[26px] flex items-center gap-2.5 text-[13.5px] text-nevo-near-black/55">
              <Spinner size={16} />
              {"One moment…"}
            </span>
          </div>
        )}
      </div>

      {/* SCRUM-88 step 3, bottom-centre for the teacher console. The region is
          always here, so the words arriving in it are announced. */}
      <div
        role="status"
        className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4"
      >
        {signedOut && !signedOutSaid && (
          <SystemMessage message={{ kind: "confirm", message: SIGNED_OUT_LINE }} />
        )}
      </div>
    </div>
  );
}
