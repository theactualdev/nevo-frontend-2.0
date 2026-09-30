"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { authApi, teamApi } from "@/lib/api";
import { invitesApi } from "@/lib/api/invites";
import {
  DOOR_HREF,
  DOOR_LABEL,
  doorForRole,
  knownRole,
} from "@/lib/auth/consoleDoor";
import { clearSession } from "@/lib/auth/session";

/**
 * Set Password (`Nevo Set Password`) - one component behind two flows:
 * activation, opened from the invite link an admin sent, and reset, opened
 * from the emailed reset link. Live validation throughout: strength, the
 * three requirements and the confirm match all update as you type, and the
 * button only unlocks when the password is valid, confirmed, and (activation
 * only) consent is ticked.
 *
 * The frame draws no failure state at all - no expired token, no server
 * rejection - so the error branch here is ours, written in the house voice
 * and flagged to design.
 *
 * Activation is live against POST /api/v1/admin/team/invitations/accept, with
 * the invitation token read off the link. That endpoint returns no access
 * token, so the screen chains a password login to honour its own "Taking you
 * to your console" beat - and when only that second hop fails the account is
 * still active, so the screen says so and routes to sign-in instead of
 * reporting an activation failure.
 *
 * Reset is live against POST /api/v1/auth/password-reset/complete, using the
 * token from the emailed link. A rejected token is almost always an expired
 * one, so that failure routes to the reset screen's own expired state rather
 * than dead-ending here.
 */

const SUCCESS_HOLD_MS = 1600;

/** The staff consoles this form can finish in. */
type StaffDoor = "teacher" | "admin";

/**
 * Where each console starts - the same homes `proxy.ts` sends a signed-in
 * teacher or admin to. `/admin` picks the persona home from the caller's
 * scopes itself.
 */
const CONSOLE_HOME: Record<StaffDoor, string> = {
  teacher: "/teacher/dashboard",
  admin: "/admin",
};

const RESET_HREF: Record<StaffDoor, string> = {
  teacher: "/auth/teacher/reset",
  admin: "/auth/admin/reset",
};

const REQUIREMENTS = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "Contains a letter", test: (p: string) => /[a-zA-Z]/.test(p) },
  { label: "At least one number", test: (p: string) => /[0-9]/.test(p) },
];

/** Display only - it never gates the button, the three requirements do. */
function strength(p: string): { level: 0 | 1 | 2 | 3; label: string } {
  if (!p) return { level: 0, label: "" };
  let score = 0;
  if (p.length >= 8) score += 1;
  if (/[a-zA-Z]/.test(p) && /[0-9]/.test(p)) score += 1;
  if (p.length >= 12) score += 1;
  if (/[^a-zA-Z0-9]/.test(p)) score += 1;
  const level = Math.min(3, Math.max(1, score - 1)) as 1 | 2 | 3;
  return { level, label: level <= 1 ? "Weak" : level === 2 ? "Fair" : "Strong" };
}

const EYE = (open: boolean) =>
  open ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 3l18 18" />
      <path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.4 17.4 0 0 1-3 3.9" />
      <path d="M6.1 6.1A17 17 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 3.9-.8" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );

function PasswordField({
  id,
  label,
  placeholder,
  value,
  onChange,
  borderClass,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  borderClass?: string;
}) {
  const [shown, setShown] = useState(false);
  return (
    <>
      <label htmlFor={id} className="mt-5 text-[13.5px] font-semibold text-nevo-near-black/70">
        {label}
      </label>
      <div
        className={cn(
          "mt-2 flex h-[52px] w-full items-center rounded-[10px] border-[1.5px] bg-nevo-cream-elevated pr-3.5 pl-4 transition-[border-color] duration-150",
          borderClass ?? "border-nevo-near-black/16 focus-within:border-nevo-navy",
        )}
      >
        <input
          id={id}
          type={shown ? "text" : "password"}
          autoComplete="new-password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-full min-w-0 flex-1 border-none bg-transparent text-[16px] text-nevo-near-black outline-none"
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? "Hide password" : "Show password"}
          className="flex shrink-0 cursor-pointer pl-2 text-nevo-near-black/50"
        >
          {EYE(shown)}
        </button>
      </div>
    </>
  );
}

export function SetPasswordForm({
  mode,
  email,
  school,
  door = "teacher",
  signInHref,
  resetHref,
}: {
  mode: "activation" | "reset";
  /** Activation only: the invite names the account. A reset link does not,
   *  and nothing resolves an opaque reset token to an address. */
  email?: string;
  school?: string;
  /**
   * WHOSE FORM THIS IS - it was the teacher's whatever route rendered it.
   *
   * Every destination and one sentence were hardcoded to the teacher console,
   * so an invited admin was told "Your teacher account is active" and sent to
   * the teacher door, and an admin's reset finished there too. The admin
   * routes say so now. It decides where a failed sign-in hop and a reset
   * finish; a successful sign-in goes by the role the server returned, which
   * is the better answer when there is one.
   */
  door?: StaffDoor;
  /** Where "sign in" means on this route. Defaults to the door's own. */
  signInHref?: string;
  /** Where an expired reset link recovers. Defaults to the door's own. */
  resetHref?: string;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<"form" | "saving" | "done">("form");
  const [error, setError] = useState("");
  const [landing, setLanding] = useState<"console" | "signin">("console");
  /** The console they turned out to belong to - what the success line names. */
  const [arrivedAs, setArrivedAs] = useState<StaffDoor>(door);
  const signInAt = signInHref ?? DOOR_HREF[door];
  const resetAt = resetHref ?? RESET_HREF[door];
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const params = useSearchParams();
  /** The invite link is the credential; without it there is nothing to accept. */
  const token = params.get("token");
  /** The accept response carries no email, so the link has to. The prop is the
   *  fallback that keeps the designed screen viewable on its own. */
  const inviteEmail = params.get("email") ?? email ?? "";
  /** Set by the join landing: this token belongs to the product-access flow. */
  const viaJoin = params.get("via") === "join";
  const activation = mode === "activation";
  const met = REQUIREMENTS.map((r) => r.test(password));
  const allMet = met.every(Boolean);
  const matches = confirm.length > 0 && confirm === password;
  const canSubmit = allMet && matches && (!activation || consent);
  const s = strength(password);

  /** Where the success screen is heading - the console needs a live session. */
  const finish = (next: "console" | "signin", as: StaffDoor = door) => {
    setLanding(next);
    setArrivedAs(as);
    setPhase("done");
    timers.current.push(
      setTimeout(
        () => router.push(next === "console" ? CONSOLE_HOME[as] : signInAt),
        SUCCESS_HOLD_MS,
      ),
    );
  };

  const submit = async () => {
    if (!canSubmit || phase !== "form") return;
    setError("");
    setPhase("saving");

    if (!activation) {
      if (!token) {
        setPhase("form");
        setError(
          "This reset link is missing its code. Request a fresh one and we'll send it over.",
        );
        return;
      }
      try {
        await authApi.completePasswordReset({ token, password });
      } catch {
        // A rejected reset token is almost always an expired one, and that
        // screen already offers a way forward.
        router.push(`${resetAt}?expired=1`);
        return;
      }
      // Whoever was signed in here is not who the door should greet: the
      // sign-in screen bounces a live staff session straight into its console.
      clearSession();
      finish("signin");
      return;
    }

    if (!token) {
      setPhase("form");
      setError(
        "This activation link is missing its code. Ask your school admin to send a fresh invite.",
      );
      return;
    }

    /*
     * TWO ACCEPT ENDPOINTS, and the token says which.
     *
     * `POST /api/v1/admin/team/invitations/accept` redeems an ADMIN TEAM
     * invitation, keyed on `invitationToken`. `POST /api/v1/join/{token}/
     * accept` redeems a PRODUCT ACCESS join link - a different namespace, a
     * different tag in the spec, and the token in the path rather than the
     * body.
     *
     * `NewInviteModal` builds its links as `/join/{token}`, and the join
     * landing sent those here - so every teacher invited from the admin
     * console arrived at a screen that posted their join token to the
     * admin-team endpoint, which does not know it. The link could not be
     * redeemed at all.
     *
     * `?via=join` is set by the join landing and says which this is.
     */
    try {
      if (viaJoin) {
        await invitesApi.acceptJoin(token, { password });
      } else {
        await teamApi.acceptInvitation({
          invitationToken: token,
          password,
        });
      }
    } catch {
      setPhase("form");
      setError(
        "We couldn't activate your account with this link. It may have expired, and your school admin can send a new one.",
      );
      return;
    }

    /*
     * END WHATEVER SESSION THIS DEVICE WAS HOLDING.
     *
     * It belongs to somebody else - the account that just activated has never
     * had one. Left in place, every route below that ends at the sign-in door
     * was bounced by `proxy.ts` into the PREVIOUS teacher's console, because
     * a signed-in teacher has no use for their own door. On a shared staffroom
     * machine that is a new colleague landing in someone else's classes. The
     * student hand-over ends the session the same way, and for the same reason.
     */
    clearSession();

    // The account is active from here on. Accepting returns no session
    // (AcceptInvitationResponse is role/schoolId/userId), so sign in to
    // reach the console; if that hop fails it is not an activation failure
    // and must not read like one.
    //
    // With no address on the link there is nobody to sign in AS - the accept
    // response carries none - so send them to the door rather than posting a
    // login for an address we invented.
    if (!inviteEmail) {
      finish("signin");
      return;
    }
    try {
      const login = await authApi.loginPassword({ email: inviteEmail, password });
      // The role the server returned decides the console, not the route: an
      // admin invite from before the admin route existed still lands here.
      const as = doorForRole(knownRole(login.role));
      if (as === "teacher" || as === "admin") {
        finish("console", as);
        return;
      }
      // No staff console serves this role; do not carry its session anywhere.
      clearSession();
      finish("signin");
    } catch {
      finish("signin");
    }
  };

  if (phase === "done") {
    return (
      <div className="flex w-full max-w-[440px] flex-col items-center px-6 text-center">
        <span className="flex size-[72px] items-center justify-center rounded-full bg-nevo-navy motion-safe:animate-nevo-pop">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#f7f1e6" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <h2 className="mt-[26px] text-[30px] font-semibold tracking-[-0.02em] text-nevo-near-black">
          {activation ? "You're all set" : "Password updated"}
        </h2>
        <p className="mt-3 text-[16px] leading-[1.55] text-nevo-near-black/70">
          {!activation
            ? "You can now sign in with your new password."
            : landing === "console"
              ? `Your ${DOOR_LABEL[arrivedAs]} account is active.`
              : `Your ${DOOR_LABEL[arrivedAs]} account is active. Sign in to get started.`}
        </p>
        <span className="mt-[26px] flex items-center gap-2.5 text-[13.5px] text-nevo-near-black/55">
          <span
            role="status"
            aria-label="Working"
            className="size-4 rounded-full border-[2.4px] border-nevo-navy/25 border-t-nevo-navy motion-safe:animate-spin motion-safe:[animation-duration:900ms]"
          />
          {landing === "console"
            ? "Taking you to your console…"
            : "Taking you to sign in…"}
        </span>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-[440px] flex-col items-stretch px-6">
      {school && (
        <span className="text-center text-[12.5px] font-semibold tracking-[0.14em] text-nevo-violet uppercase">
          {school}
        </span>
      )}
      <h2 className="mt-3.5 text-center text-[34px] leading-[1.15] font-semibold tracking-[-0.02em] text-nevo-near-black">
        {activation ? "Create your password" : "Choose a new password"}
      </h2>
      <p className="mt-3 text-center text-[16px] leading-[1.55] text-nevo-near-black/70">
        {activation
          ? "One last thing before your dashboard. Choose a password you’ll remember."
          : "Create a new password for your Nevo account."}
      </p>

      {/* Activation only: the invite fixes the address, so it is shown and
          never editable. A reset link carries an opaque token and nothing
          resolves it to an address - naming one here would mean naming the
          wrong person's on a security screen. */}
      {inviteEmail && (
        <>
          <span className="mt-6 text-[13.5px] font-semibold text-nevo-near-black/70">
            Email
          </span>
          <div className="mt-2 flex h-[52px] w-full items-center gap-2.5 rounded-[10px] border-[1.5px] border-nevo-near-black/16 bg-nevo-near-black/5 px-4 text-[16px] text-nevo-near-black/70">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 text-nevo-near-black/45">
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            <span className="truncate">{inviteEmail}</span>
          </div>
        </>
      )}

      <PasswordField
        id="new-password"
        label="Password"
        placeholder="Create a password"
        value={password}
        onChange={setPassword}
      />

      {password.length > 0 && (
        <div className="mt-2.5 flex w-full items-center gap-2.5">
          <div className="flex flex-1 gap-1.5">
            {[1, 2, 3].map((seg) => (
              <span
                key={seg}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors duration-150",
                  s.level >= seg ? "bg-nevo-navy" : "bg-nevo-near-black/12",
                )}
              />
            ))}
          </div>
          <span className="text-[12.5px] text-nevo-near-black/60">{s.label}</span>
        </div>
      )}

      <ul className="mt-3 flex w-full flex-col gap-[7px]">
        {REQUIREMENTS.map((r, i) => (
          <li key={r.label} className="flex items-center gap-2.5 text-[13.5px] text-nevo-near-black/70">
            {met[i] ? (
              <span className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-nevo-navy text-nevo-cream">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </span>
            ) : (
              <span className="size-[18px] shrink-0 rounded-full border-[1.5px] border-nevo-near-black/20" />
            )}
            {r.label}
          </li>
        ))}
      </ul>

      <PasswordField
        id="confirm-password"
        label="Confirm password"
        placeholder="Re-enter your password"
        value={confirm}
        onChange={setConfirm}
        borderClass={
          confirm.length === 0
            ? undefined
            : matches
              ? "border-nevo-navy"
              : "border-nevo-violet"
        }
      />
      {confirm.length > 0 && (
        <p className="mt-[7px] text-[13px] text-nevo-near-black/60">
          {matches ? "Passwords match" : "Passwords don't match yet"}
        </p>
      )}

      {activation && (
        <label className="mt-6 flex w-full cursor-pointer items-start gap-3 text-[14px] leading-[1.5] text-nevo-near-black/78">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="sr-only"
          />
          <span
            aria-hidden
            className={cn(
              "mt-px flex size-[22px] shrink-0 items-center justify-center rounded-[6px] border-[1.5px] transition-colors duration-150",
              consent
                ? "border-nevo-navy bg-nevo-navy text-nevo-cream"
                : "border-nevo-near-black/25",
            )}
          >
            {consent && (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M20 6L9 17l-5-5" />
              </svg>
            )}
          </span>
          <span>
            {"I agree to Nevo's "}
            <Link
              href="/legal/privacy"
              onClick={(e) => e.stopPropagation()}
              className="cursor-pointer font-medium text-nevo-navy underline underline-offset-2"
            >
              Privacy Policy
            </Link>
            {" and "}
            <Link
              href="/legal/terms"
              onClick={(e) => e.stopPropagation()}
              className="cursor-pointer font-medium text-nevo-navy underline underline-offset-2"
            >
              Terms of Service
            </Link>
            .
          </span>
        </label>
      )}

      {!activation && (
        <p className="mt-6 text-[13.5px] leading-[1.55] text-nevo-near-black/60">
          For your security, saving a new password signs you out of Nevo on your
          other devices.
        </p>
      )}

      {error && (
        <div role="status" className="mt-4 flex w-full items-start gap-2.5 rounded-[10px] bg-nevo-violet/18 px-[15px] py-[13px]">
          <span className="mt-px shrink-0 text-nevo-navy">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8h.01M11 12h1v4h1" />
            </svg>
          </span>
          <span className="text-[14px] leading-[1.5] text-nevo-near-black">
            {error}
          </span>
        </div>
      )}

      <button
        type="button"
        onClick={() => void submit()}
        disabled={!canSubmit}
        className={cn(
          "mt-7 flex h-[54px] w-full items-center justify-center gap-2.5 rounded-[10px] text-[16px] font-semibold transition-[filter] duration-150",
          canSubmit
            ? "cursor-pointer bg-nevo-navy text-nevo-cream hover:brightness-93"
            : "cursor-not-allowed bg-nevo-navy/32 text-nevo-cream/85",
        )}
      >
        {phase === "saving" && (
          <span
            role="status"
            aria-label="Working"
            className="size-4 rounded-full border-[2.4px] border-nevo-cream/40 border-t-nevo-cream motion-safe:animate-spin motion-safe:[animation-duration:900ms]"
          />
        )}
        {phase === "saving"
          ? activation
            ? "Activating…"
            : "Saving…"
          : activation
            ? "Activate my account"
            : "Save new password"}
      </button>

      {activation && (
        <p className="mt-5 text-[13px] leading-[1.5] text-nevo-near-black/55">
          Your information is protected from the moment you sign in.
        </p>
      )}
      <p className="mt-2 text-[13px] leading-[1.5] text-nevo-near-black/55">
        Having trouble? Contact your school administrator.
      </p>
    </div>
  );
}
