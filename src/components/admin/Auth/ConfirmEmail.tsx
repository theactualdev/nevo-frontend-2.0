"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { NevoLockup } from "@/components/shared/NevoLockup";
import {
  emailConfirmationApi,
  type EmailConfirmationState,
  type EmailConfirmationStatus,
} from "@/lib/api/emailConfirmation";

/**
 * SCRUM-151 - where an administrator's confirmation link lands.
 *
 * NO DESIGN FRAME EXISTS FOR THIS SCREEN. The route was settled with backend
 * (`/auth/admin/confirm/[token]`) and the contract is complete, so the wiring
 * and the state machine are built to the contract; the WORDING below is
 * provisional and design may replace it without touching anything else. The
 * headings are ours and the body is the server's - see `message`.
 *
 * FIVE OUTCOMES, NOT TWO. `EmailConfirmationStatus` is a closed five-member
 * enum and the contract is explicit that three of them are separate screens:
 * *"a link that has run out, a link already used, and a link that never
 * existed."* Collapsing them into "something went wrong" is the thing the enum
 * exists to prevent, and it is what a single try/catch would have produced.
 *
 * A FAILED REQUEST IS NOT AN INVALID LINK. This is the recurring defect in
 * this codebase and it is especially sharp here, because the failure and the
 * verdict look identical to a caller that only has try/catch: a 500, a dropped
 * connection or an offline laptop would all render "this link doesn't work" -
 * telling an administrator their link is dead when nothing of the kind is
 * known. `phase` holds them apart.
 *
 * THERE IS NO RESEND BUTTON, DELIBERATELY. `POST /email-confirmation/resend`
 * carries `HTTPBearer`, and somebody opening a confirmation link is by
 * definition not signed in. The only control that could send a fresh link
 * needs a session the reader does not have, so the expired screen sends them
 * to sign in - where a resend can actually happen - rather than offering a
 * button that would 401.
 */

type Phase = "verifying" | "done" | "unreachable";

/** Our structure, the server's explanation. */
const HEADING: Record<EmailConfirmationStatus, string> = {
  confirmed: "Your email address is confirmed",
  already_confirmed: "This address was already confirmed",
  expired: "This link has run out",
  invalid: "This link doesn’t work",
  pending: "This address still needs confirming",
};

/**
 * Whether signing in is the next step.
 *
 * All five say yes today, and the map is here rather than inlined as `true`
 * because that is a claim about each state and not a property of the screen -
 * if design ever rules that an invalid link should offer nothing (the way
 * `ConsoleSessionExpired` gives a paused account no button), this is the one
 * line that changes.
 */
const OFFERS_SIGN_IN: Record<EmailConfirmationStatus, boolean> = {
  confirmed: true,
  already_confirmed: true,
  expired: true,
  invalid: true,
  pending: true,
};

export function ConfirmEmail({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>("verifying");
  const [state, setState] = useState<EmailConfirmationState | null>(null);

  /*
   * The request alone. No synchronous setState, because this runs from an
   * effect and the house rule (react-hooks/set-state-in-effect) forbids it -
   * the same correction `IepExporterView` and `PermissionContext` carry.
   * "verifying" is the INITIAL state, so the first run needs no set; the retry
   * below sets it from an event handler, where it is allowed.
   */
  const run = useCallback(() => {
    emailConfirmationApi
      .verify(token)
      .then((s) => {
        setState(s);
        setPhase("done");
      })
      .catch(() => {
        // Deliberately NOT `status: "invalid"`. We do not know that.
        setState(null);
        setPhase("unreachable");
      });
  }, [token]);

  useEffect(() => {
    run();
  }, [run]);

  const retry = () => {
    setPhase("verifying");
    run();
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-nevo-cream text-nevo-near-black">
      <div className="absolute top-9 left-11">
        <NevoLockup priority />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-10 text-center">
        {phase === "verifying" ? (
          <p className="text-[17px] text-nevo-near-black/62">
            Checking your link&hellip;
          </p>
        ) : phase === "unreachable" ? (
          <>
            <h1 className="text-[30px] font-semibold tracking-[-0.015em] text-nevo-near-black">
              We couldn&rsquo;t check your link
            </h1>
            <p className="mt-[13px] max-w-[420px] text-[17px] leading-[1.55] text-nevo-near-black/70">
              Nothing has changed, and your link may still be fine. Try again in
              a moment.
            </p>
            <button
              type="button"
              onClick={retry}
              className="mt-7 h-[52px] cursor-pointer rounded-[10px] bg-nevo-navy px-6 text-[15px] font-semibold text-nevo-cream transition-[filter] hover:brightness-110 active:brightness-93"
            >
              Try again
            </button>
          </>
        ) : state ? (
          <>
            <h1 className="text-[30px] font-semibold tracking-[-0.015em] text-nevo-near-black">
              {HEADING[state.status]}
            </h1>
            <p className="mt-[13px] max-w-[420px] text-[17px] leading-[1.55] text-nevo-near-black/70">
              {state.message}
            </p>
            {/*
              * The address, when the server named one. `email` is nullable
              * because an invalid token identifies nobody, so this is absent
              * rather than a blank line under the heading.
              */}
            {state.email ? (
              <p className="mt-2.5 text-[14.5px] text-nevo-near-black/55">
                {state.email}
              </p>
            ) : null}
            {OFFERS_SIGN_IN[state.status] ? (
              <Link
                href="/auth/admin"
                className="mt-7 flex h-[52px] cursor-pointer items-center rounded-[10px] bg-nevo-navy px-6 text-[15px] font-semibold text-nevo-cream transition-[filter] hover:brightness-110 active:brightness-93"
              >
                Sign in
              </Link>
            ) : null}
            {/*
              * Where a fresh link actually comes from. Resend needs a session,
              * so this is a sentence rather than a button - see the header.
              */}
            {state.status === "expired" || state.status === "pending" ? (
              <p className="mt-4 max-w-[360px] text-[13.5px] leading-[1.55] text-nevo-near-black/50">
                Sign in and we can send you a new link.
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
