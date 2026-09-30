"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks";
import { authApi } from "@/lib/api";
import {
  DOOR_HREF,
  DOOR_LABEL,
  doorForRole,
  knownRole,
  type ConsoleDoor,
} from "@/lib/auth/consoleDoor";
import { classifyLoginFailure, type LoginFailure } from "@/lib/auth/loginFailure";
import { cn } from "@/lib/utils";
import { SupportEmailLink } from "../SupportEmail";

/**
 * D02 Admin Sign-In - one door for every admin. Password sign-in is LIVE
 * against POST /api/v1/auth/login/password.
 *
 * Three things the frame draws that are deliberately absent, because each one
 * would be a control leading nowhere:
 *
 * - The school eyebrow ("Corona Secondary School · Lagos"). The frame resolves
 *   school identity BEFORE auth, from the school-specific URL that D10 issues.
 *   Nothing hands us a school pre-auth, so naming one would be inventing it.
 * - "Continue with Microsoft 365". The provider comes from the school's own
 *   config, and there is no admin SSO callback screen in the admin set - the
 *   teacher console has C02b, admin has no equivalent.
 * - "Forgot your password?" IS BACK. This said "No reset endpoint exists
 *   anywhere in the spec and no admin reset screen is drawn". Two exist -
 *   `POST /auth/forgot-password` and `POST /auth/password-reset/complete` -
 *   and the teacher console has consumed both since 1 Sep. Meanwhile the error
 *   at `SIGN_IN_FAILED` told a locked-out proprietor to "reset your password"
 *   and gave them nothing to press.
 *
 * The success line loses the school name for the same reason: "Taking you to
 * your Overview" rather than the school's.
 *
 * TODO(api): a pre-auth lookup keyed on the school's URL SLUG that returns the
 * school's name and its SSO PROVIDER. `POST /api/v1/auth/school-code/verify`
 * already resolves a school before auth and is wrapped in `lib/api/auth.ts`,
 * but it is keyed on a typed school code and its `authMethod` only ever says
 * "sso" - never microsoft vs google - while `SsoStartRequest` requires both a
 * slug and a provider. So the gap is narrower than "school resolution
 * pre-auth" claimed.
 *
 * "AN SSO START FOR ADMINS" WAS ALSO ON THIS LIST AND IS NOT MISSING.
 * `POST /api/v1/auth/sso/start` and
 * `GET /api/v1/schools/{slug}/sso/{provider}/start` both exist, both are
 * unauthenticated, and HandoverStep in this same console already calls the
 * second. Two wrong entries on one line, one of them already corrected in
 * place - which is the argument for correcting rather than deleting these.
 * TODO(screen): D17 IT Admin Home and D18 Finance Home. The frame routes each
 * persona to their own landing; until those exist everyone lands on Overview.
 */

const SUCCESS_HOLD_MS = 1400;
const LIVE_TIMEOUT_MS = 20000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** D02, verbatim. The system owns the failure - soft violet, never red. */
const MISMATCH_MSG =
  "We couldn't sign you in with those details. Check them and try again, or reset your password.";
/** Not drawn in D02; ours, and flagged. */
const UNREACHABLE_MSG =
  "We couldn't reach your school's sign-in right now. Nothing on your end - try again in a moment.";
/**
 * A 401 STOPPED BEING ONE THING, AND THIS WAS THE LAST DOOR STILL READING IT
 * AS ONE.
 *
 * Backend documents the three cases on `POST /api/v1/auth/login/password`
 * itself: "authentication_failed when the credential is wrong, account_paused
 * when it is right but the account is not open, too_many_attempts when rate
 * limited". Mapping all three to MISMATCH_MSG told an administrator whose
 * password was RIGHT to check it and try again - and then relabelled the
 * button "Try again" so they could. The student doors have used
 * `classifyLoginFailure` since they shipped and the teacher door since 14 Sep;
 * only this one was left.
 *
 * THE PAUSED LINE CANNOT BE THE TEACHER'S. Teachers are told "your school
 * admin can tell you more". Said to an administrator that is a circle, and to
 * a proprietor it names nobody at all - they ARE the school admin. A SENCo or
 * IT admin can be reopened by a colleague holding `team`; a sole proprietor
 * cannot be reopened by anyone inside the school, and the refusal carries
 * nothing that tells the two apart. So the line offers the colleague first and
 * ends on the route that exists either way.
 *
 * NO WHOLE-SCREEN PAUSE STATE, for the reason the teacher door gives: `Account
 * On Pause` is drawn "NEVO - STUDENT" and reads "talk to your teacher".
 *
 * Neither line is drawn - D02 has one error state - so both are ours, like
 * UNREACHABLE_MSG above.
 */
const PAUSED_MSG = (
  <>
    This account isn&rsquo;t open at the moment. Another administrator at your
    school can reopen it. If there isn&rsquo;t one, email{" "}
    <SupportEmailLink className="font-semibold text-nevo-navy hover:underline" />
    .
  </>
);
const THROTTLED_MSG =
  "Too many attempts just now. Wait a few minutes before trying again.";

/**
 * The wrong-door line for a role no door serves - `parent_guardian`, or
 * anything this build does not recognise.
 *
 * The named-door version below is better and is used whenever we can work out
 * where they belong. This is the honest floor: we know the credentials were
 * right and we know this is not their console, and we do not know more than
 * that. It does not invite a retry, because retrying is the one thing that
 * cannot help.
 */
const WRONG_DOOR_MSG =
  "Those details are right, but this account can’t be used to sign in here. Check with whoever set up your Nevo account.";

const MESSAGE: Record<LoginFailure, ReactNode> = {
  credentials: MISMATCH_MSG,
  ours: UNREACHABLE_MSG,
  paused: PAUSED_MSG,
  throttled: THROTTLED_MSG,
  wrong_door: WRONG_DOOR_MSG,
};

/**
 * Whether pressing the button again could possibly help. For a paused account
 * it cannot, and for a throttled one it is the instruction that extends the
 * lockout - so neither gets told to retry by the most prominent control on the
 * screen.
 */
const RETRYABLE: Record<LoginFailure, boolean> = {
  credentials: true,
  ours: true,
  paused: false,
  throttled: false,
  /*
   * The same credentials will be just as correct next time, and just as wrong
   * for this door. Offering "Try again" here would send somebody round the
   * loop that produced the bug report - press, succeed, get refused, press.
   */
  wrong_door: false,
};

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
          ? "border-nevo-cream/30 border-t-nevo-cream"
          : "border-nevo-navy/25 border-t-nevo-navy",
      )}
    />
  );
}

export function AdminSignIn() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn } = useAuth();
  // Same-app paths only, never an open redirect.
  const nextParam = searchParams.get("next");
  // `/admin` picks the persona home from the caller's scopes - the Overview
  // is gated on `oversight`, so sending everyone there landed IT and finance
  // admins on a refusal. A deep link still wins.
  const destination =
    nextParam && nextParam.startsWith("/admin/")
      ? nextParam
      : "/admin";

  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [failure, setFailure] = useState<LoginFailure | null>(null);
  /**
   * Where they actually belong, when we can tell. Null means a role no door
   * serves, and the generic `WRONG_DOOR_MSG` covers that case.
   */
  const [wrongDoor, setWrongDoor] = useState<ConsoleDoor | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const validEmail = EMAIL_RE.test(email.trim());
  const canSubmit = validEmail && pw.length > 0;

  const clearError = useCallback(() => {
    setPhase((p) => (p === "error" ? "idle" : p));
  }, []);

  const submit = () => {
    if (!canSubmit || phase === "signing" || phase === "success") return;
    setPhase("signing");
    const live = authApi.loginPassword({ email: email.trim(), password: pw });
    const cap = new Promise<never>((_, reject) =>
      timers.current.push(
        setTimeout(() => reject(new Error("timeout")), LIVE_TIMEOUT_MS),
      ),
    );
    Promise.race([live, cap])
      .then((session) => {
        /*
         * REFUSE AT THE DOOR, NOT AFTER IT.
         *
         * This used to cast `session.role as UserRole` straight into the
         * session and push. A teacher signing in here was shown "You're in",
         * held for the success beat, pushed to an admin route, and only then
         * bounced by `proxy.ts` - so a correct password looked like a broken
         * login. The guard held and nothing leaked; the door was still lying
         * for a second and a half.
         *
         * `roleBelongsAt` is the guard's own `isAdminRole`, so the two cannot
         * drift into refusing in one place and admitting in the other.
         */
        const role = knownRole(session.role);
        const door = doorForRole(role);
        if (door !== "admin" || !role) {
          setWrongDoor(door);
          setFailure("wrong_door");
          setPhase("error");
          /*
           * The login SUCCEEDED, so a session exists server-side even though
           * we are refusing. Leaving it would mean a person told "not here"
           * is nonetheless carrying a live session for another console.
           * `logout` clears locally in a `finally`, so a failed round trip
           * still leaves nothing behind - and the screen never waits on it.
           */
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
        // The timeout above rejects with a bare Error, which classifies as
        // "ours" - the same answer this branch used to give it by hand.
        setFailure(classifyLoginFailure(err));
        setPhase("error");
      });
  };

  if (phase === "success") {
    return (
      <div className="flex w-full max-w-[420px] flex-col items-center px-6 text-center">
        <span className="flex size-[76px] items-center justify-center rounded-full bg-nevo-navy motion-safe:animate-nevo-pop">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#f7f1e6" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <h2 className="mt-[26px] text-[30px] font-semibold tracking-[-0.02em] text-nevo-near-black">
          You&rsquo;re in
        </h2>
        <p className="mt-3 text-[16px] leading-[1.55] text-nevo-near-black/70">
          {/* The school name is not ours to say - see the docblock. */}
          Taking you to your Overview.
        </p>
        <span className="mt-[26px] flex items-center gap-2.5 text-[13.5px] text-nevo-near-black/55">
          <Spinner />
          One moment&hellip;
        </span>
      </div>
    );
  }

  const busy = phase === "signing";
  const errored = phase === "error";

  return (
    <div className="flex w-full max-w-[440px] flex-col items-stretch px-6">
      {/*
        * THE WORDMARK, on a pre-shell surface that carries no sidebar.
        *
        * The frames put it on every state of both of these screens, and
        * neither rendered any mark at all - so the two places a school meets
        * Nevo before there is a console around them were the only two with
        * nothing saying whose product this is. The crop is `AdminSidebar`'s,
        * scaled: one source image, so the surfaces cannot drift apart.
        */}
      <span className="relative mb-8 block h-[24px] w-[81px] overflow-hidden self-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/logo-wordmark-purple.png"
          alt="Nevo"
          className="absolute block h-[236px] w-[236px] max-w-none -translate-x-[85px] -translate-y-[113px]"
        />
      </span>
      <h2 className="text-center text-[34px] leading-[1.15] font-semibold tracking-[-0.02em] text-nevo-near-black">
        Welcome back
      </h2>
      <p className="mt-3 text-center text-[16px] leading-[1.55] text-nevo-near-black/70">
        Sign in to your school workspace.
      </p>

      <label
        htmlFor="admin-email"
        className={cn(
          "mt-7 text-[13.5px] font-semibold text-nevo-near-black/70",
          busy && "opacity-60",
        )}
      >
        Email
      </label>
      <input
        id="admin-email"
        type="email"
        autoComplete="username"
        value={email}
        disabled={busy}
        onChange={(e) => {
          setEmail(e.target.value);
          clearError();
        }}
        placeholder="you@yourschool.edu.ng"
        className={cn(
          "mt-2 h-[52px] w-full rounded-[10px] border-[1.5px] bg-nevo-cream-elevated px-4 text-[16px] text-nevo-near-black outline-none transition-colors placeholder:text-nevo-near-black/35 focus:border-nevo-navy disabled:opacity-60",
          "border-nevo-near-black/16",
        )}
      />

      <label
        htmlFor="admin-password"
        className={cn(
          "mt-[18px] text-[13.5px] font-semibold text-nevo-near-black/70",
          busy && "opacity-60",
        )}
      >
        Password
      </label>
      <div
        className={cn(
          "mt-2 flex h-[52px] w-full items-center rounded-[10px] border-[1.5px] bg-nevo-cream-elevated px-4 transition-colors focus-within:border-nevo-navy",
          errored ? "border-nevo-violet" : "border-nevo-near-black/16",
          busy && "opacity-60",
        )}
      >
        <input
          id="admin-password"
          type={showPw ? "text" : "password"}
          autoComplete="current-password"
          value={pw}
          disabled={busy}
          onChange={(e) => {
            setPw(e.target.value);
            clearError();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="Enter your password"
          className="h-full min-w-0 flex-1 border-none bg-transparent text-[16px] text-nevo-near-black outline-none placeholder:text-nevo-near-black/35"
        />
        <button
          type="button"
          onClick={() => setShowPw((v) => !v)}
          aria-label={showPw ? "Hide password" : "Show password"}
          className="flex shrink-0 cursor-pointer pl-2 text-nevo-near-black/50"
        >
          {showPw ? EYE_OPEN : EYE_OFF}
        </button>
      </div>

      {errored && failure && (
        <p className="mt-3 rounded-[10px] bg-nevo-violet/16 px-4 py-3 text-[13.5px] leading-[1.5] text-nevo-near-black/78">
          {/*
            * NAME THE RIGHT DOOR WHERE WE CAN, and link it.
            *
            * Telling somebody their own role is not a disclosure: they have
            * just proved the account is theirs. The thing that would leak is
            * saying it BEFORE the password is checked, and this branch is only
            * reachable after a 200.
            *
            * Without the link this is a dead end - "not here" and no
            * indication of where "here" is. That is the state the bug report
            * described, minus the false success.
            */}
          {failure === "wrong_door" && wrongDoor ? (
            <>
              Those details are right, but this is the school admin sign-in.
              Your account is a {DOOR_LABEL[wrongDoor]} account &ndash;{" "}
              <Link
                href={DOOR_HREF[wrongDoor]}
                className="font-semibold text-nevo-navy underline underline-offset-2"
              >
                sign in as a {DOOR_LABEL[wrongDoor]}
              </Link>
              .
            </>
          ) : (
            MESSAGE[failure]
          )}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className={cn(
          "mt-6 flex h-[52px] w-full items-center justify-center gap-2.5 rounded-[10px] bg-nevo-navy text-[15px] font-semibold text-nevo-cream transition-[filter]",
          canSubmit && !busy
            ? "cursor-pointer hover:brightness-110 active:brightness-93"
            : "cursor-default opacity-50",
        )}
      >
        {busy ? (
          <>
            <Spinner onNavy />
            Signing you in&hellip;
          </>
        ) : errored && failure && RETRYABLE[failure] ? (
          "Try again"
        ) : (
          "Sign in"
        )}
      </button>

      <Link
        href="/auth/admin/reset"
        className="mt-4 self-center text-[13.5px] font-semibold text-nevo-navy hover:underline"
      >
        Forgot your password?
      </Link>
    </div>
  );
}
