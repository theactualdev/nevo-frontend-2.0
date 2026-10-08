"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { authApi } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { SetPasswordForm } from "./SetPasswordForm";
import { AuthWordmark, ContactFooter } from "./AuthChrome";

/**
 * Password reset (C02d) - two steps and a failure state, lifted out of the
 * sign-in screen when the design moved it to its own surface.
 *
 * Step A asks for the email and always shows the same confirmation, so the
 * screen never reveals whether an account exists. Step B is the screen the
 * emailed link opens, which is the shared Set Password component in reset
 * mode. An expired link owns the failure and always offers a way forward.
 *
 * Routing: `?token=` opens Step B, `?expired=1` the failure state, otherwise
 * Step A.
 *
 * The request is live against POST /api/v1/auth/forgot-password, which always
 * returns the same generic receipt whether or not the address is known - so
 * the screen cannot be used to discover who has an account. That is also why
 * the confirmation stays non-committal, and why a failed request still shows
 * it: revealing "no such user" through an error would defeat the endpoint's
 * own design.
 *
 * Backend confirmed on 1 Sep that transactional email is live on Resend, and
 * that reset and invite mails send INLINE rather than through the queue - so
 * a dead key surfaces here as a 5xx rather than failing quietly. Inbox
 * placement still depends on domain verification, which is not something this
 * side can observe.
 */

const SENDING_MS = 1100;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Medallion({ tone, children }: { tone: "violet" | "navy"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "flex size-14 items-center justify-center rounded-full",
        tone === "violet" ? "bg-nevo-violet/20 text-nevo-navy" : "bg-nevo-navy text-nevo-cream",
      )}
    >
      {children}
    </span>
  );
}

export function TeacherPasswordReset({
  /*
   * BOTH ENDPOINTS BEHIND THIS SCREEN ARE ROLE-AGNOSTIC -
   * `POST /auth/forgot-password` and `POST /auth/password-reset/complete` - so
   * the only thing that was ever teacher-specific here is where the links
   * point. They are props now, defaulting to the teacher paths so that route
   * is unchanged, and the admin console renders the same screen rather than a
   * second copy that would drift from it.
   *
   * The name is historical; this is the shared password-reset flow.
   */
  signInHref = "/auth/teacher",
  resetHref = "/auth/teacher/reset",
}: {
  signInHref?: string;
  resetHref?: string;
} = {}) {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const expired = params.get("expired") === "1";

  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<
    "idle" | "sending" | "sent" | "unreachable"
  >("idle");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  // Step B - the emailed link lands here with a token.
  if (token && !expired) {
    // No email, no school: the reset token is opaque and nothing resolves it
    // to an account, so naming one would mean naming a stranger's.
    // The links go through, or an admin's reset finished on the teacher door.
    return (
      <SetPasswordForm
        mode="reset"
        signInHref={signInHref}
        resetHref={resetHref}
      />
    );
  }

  // Failure - the link aged out. Always a way forward.
  if (expired) {
    return (
      <div className="flex w-full max-w-[420px] flex-col items-center px-6 text-center">
        <AuthWordmark />
        <Medallion tone="violet">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        </Medallion>
        <h1 className="mt-[22px] text-[28px] leading-[1.15] font-semibold tracking-[-0.02em] text-nevo-near-black">
          This link has expired
        </h1>
        <p className="mt-3 text-[16px] leading-[1.55] text-nevo-near-black/70">
          Reset links last 30 minutes, for your security. Nothing is wrong
          with your account - request a fresh link and we&rsquo;ll send it right
          over.
        </p>
        <button
          type="button"
          onClick={() => router.push(resetHref)}
          className="mt-7 h-[54px] w-full cursor-pointer rounded-[10px] bg-nevo-navy text-[16px] font-semibold text-nevo-cream transition-[filter,transform] duration-150 hover:brightness-93 active:scale-[0.99]"
        >
          Send a new link
        </button>
        <Link
          href={signInHref}
          className="mt-4 cursor-pointer text-[14.5px] font-medium text-nevo-navy"
        >
          {"← Back to sign in"}
        </Link>
        <ContactFooter />
      </div>
    );
  }

  // Step A - sent state. Same words whether or not the account exists.
  if (phase === "unreachable") {
    return (
      <div className="flex w-full max-w-[420px] flex-col items-center px-6 text-center">
        <AuthWordmark />
        <span className="text-[12.5px] font-semibold tracking-[0.14em] text-nevo-violet uppercase">
          Password reset
        </span>
        <h1 className="mt-3.5 text-[30px] leading-[1.15] font-semibold tracking-[-0.02em] text-nevo-near-black">
          We couldn&rsquo;t reach Nevo
        </h1>
        <p className="mt-3 text-[16px] leading-[1.55] text-nevo-near-black/70">
          No link has been sent, so there&rsquo;s nothing waiting in your
          inbox. Try again in a moment.
        </p>
        <button
          type="button"
          onClick={() => setPhase("idle")}
          className="mt-7 h-[52px] w-full cursor-pointer rounded-[10px] bg-nevo-navy text-base font-semibold text-nevo-cream transition-[filter] hover:brightness-93"
        >
          Try again
        </button>
        <ContactFooter />
      </div>
    );
  }

  if (phase === "sent") {
    return (
      <div className="flex w-full max-w-[420px] flex-col items-center px-6 text-center motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300">
        <AuthWordmark />
        <Medallion tone="violet">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 6h16v12H4z" />
            <path d="M4 7l8 6 8-6" />
          </svg>
        </Medallion>
        <h1 className="mt-[22px] text-[28px] leading-[1.15] font-semibold tracking-[-0.02em] text-nevo-near-black">
          Check your inbox
        </h1>
        <p className="mt-3 text-[16px] leading-[1.55] text-nevo-near-black/70">
          {"If an account exists for "}
          <b className="font-semibold text-nevo-near-black">
            {email.trim() || "that address"}
          </b>
          {", a reset link is on its way. It expires in 30 minutes."}
        </p>
        <Link
          href={signInHref}
          className="mt-6 cursor-pointer text-[14.5px] font-medium text-nevo-navy"
        >
          {"← Back to sign in"}
        </Link>
        <ContactFooter />
      </div>
    );
  }

  const valid = EMAIL_RE.test(email.trim());
  const send = () => {
    if (!valid || phase === "sending") return;
    setPhase("sending");
    // The frame's beat and the request run together, so a fast reply still
    // lands after the beat rather than flashing past it.
    const beat = new Promise<void>((resolve) => {
      timers.current.push(setTimeout(resolve, SENDING_MS));
    });
    void Promise.all([
      // The same confirmation for any answer the SERVER gives: a different
      // outcome for a known and an unknown address would leak which is which,
      // and not leaking that is the whole point of this endpoint.
      //
      // A request that never reached the server is a different thing. `status
      // 0` is the client's own transport failure, and telling someone to check
      // their email for a link that was never requested is the one outcome
      // this screen must not produce.
      authApi
        .requestPasswordReset(email.trim())
        .then(() => true)
        .catch((err: unknown) =>
          err instanceof ApiError && err.status === 0 ? "unreachable" : true,
        ),
      beat,
    ]).then(([outcome]) =>
      setPhase(outcome === "unreachable" ? "unreachable" : "sent"),
    );
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
      className="flex w-full max-w-[420px] flex-col items-center px-6 text-center"
    >
      <AuthWordmark />
      <span className="text-[12.5px] font-semibold tracking-[0.14em] text-nevo-violet uppercase">
        Password reset
      </span>
      <h1 className="mt-3.5 text-[34px] leading-[1.15] font-semibold tracking-[-0.02em] text-nevo-near-black">
        Reset your password
      </h1>
      <p className="mt-3 text-[16px] leading-[1.55] text-nevo-near-black/70">
        Enter the email you use for Nevo and we&rsquo;ll send you a link to set
        a new password.
      </p>

      <label htmlFor="reset-email" className="mt-[30px] w-full text-left text-[13.5px] font-semibold text-nevo-near-black/70">
        Email
      </label>
      <input
        id="reset-email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@yourschool.edu.ng"
        className="mt-2 h-[52px] w-full rounded-[10px] border-[1.5px] border-nevo-near-black/16 bg-nevo-cream-elevated px-4 text-[16px] text-nevo-near-black transition-[border-color,background-color] duration-150 outline-none focus:border-nevo-navy focus:bg-nevo-cream"
      />

      <button
        type="submit"
        disabled={!valid}
        className={cn(
          "mt-7 flex h-[54px] w-full items-center justify-center gap-2.5 rounded-[10px] text-[16px] font-semibold transition-[filter] duration-150",
          valid
            ? "cursor-pointer bg-nevo-navy text-nevo-cream hover:brightness-93"
            : "cursor-not-allowed bg-nevo-navy/32 text-nevo-cream/85",
        )}
      >
        {phase === "sending" && (
          <span
            role="status"
            aria-label="Working"
            className="size-4 rounded-full border-[2.4px] border-nevo-cream/40 border-t-nevo-cream motion-safe:animate-spin motion-safe:[animation-duration:900ms]"
          />
        )}
        {phase === "sending" ? "Sending the link…" : "Send reset link"}
      </button>

      <Link
        href={signInHref}
        className="mt-4 cursor-pointer text-[14.5px] font-medium text-nevo-navy"
      >
        {"← Back to sign in"}
      </Link>
      <ContactFooter />
    </form>
  );
}
