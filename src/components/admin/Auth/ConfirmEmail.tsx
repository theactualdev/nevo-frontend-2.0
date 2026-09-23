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
 * ~~NO DESIGN FRAME EXISTS FOR THIS SCREEN.~~ **IT DID, AND WE DID NOT LOOK.**
 * `admin/D01b Email Confirmation & Access` landed in the design repo on 20 Sep
 * and this was built on 22 Sep with invented copy, under a comment asserting
 * there was nothing to build to. The frame was two days old and one `git pull`
 * away. **Pull the design repo before deciding a frame does not exist** - that
 * absence is a claim like any other and it decayed the same way every other
 * claim in this repo decays.
 *
 * The copy below is now D01b's own, AC-03 and AC-04 verbatim. The state machine
 * survived the diff unchanged, which is the part that was built to the contract.
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
/** D01b's own words. AC-04 and AC-03 respectively; the rest have no frame. */
const HEADING: Record<EmailConfirmationStatus, string> = {
  confirmed: "Your email address is confirmed",
  already_confirmed: "This email is already confirmed",
  expired: "This link has expired",
  /*
   * NOT DRAWN. D01b draws expired and already-confirmed and stops, because a
   * token that never existed is not a state a designer reaches by walking the
   * happy path. It is still a state the contract returns, so it keeps our own
   * wording rather than borrowing a neighbour's and saying the wrong thing.
   */
  invalid: "This link doesn’t work",
  pending: "This address still needs confirming",
};

/**
 * D01b's bodies, which say more than the server's `message` can.
 *
 * The frame names the 24-hour lifetime and the address the link went to. The
 * server's `message` is one sentence with no knowledge of either, so where the
 * frame has written copy it wins, and `message` is the fallback for the two
 * states D01b does not draw.
 *
 * `email` is nullable - an invalid token identifies nobody - so the address
 * clause is composed only when there is one, never as "sent to null".
 */
function bodyFor(status: EmailConfirmationStatus, email: string | null): string | null {
  if (status === "expired") {
    return email
      ? `Confirmation links last 24 hours. We can send a fresh one to ${email}.`
      : "Confirmation links last 24 hours. We can send a fresh one.";
  }
  if (status === "already_confirmed") {
    return "You’ve confirmed this address already – perhaps on another device, or by clicking the link twice. Nothing more to do here; just sign in and carry on.";
  }
  return null;
}

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
            {/*
              * The frame's body where it wrote one, the server's otherwise.
              * D01b names the 24-hour lifetime and the address; `message` knows
              * neither, so on the two states design drew, design wins.
              */}
            <p className="mt-[13px] max-w-[420px] text-[17px] leading-[1.55] text-nevo-near-black/70">
              {bodyFor(state.status, state.email) ?? state.message}
            </p>
            {/*
              * The address on its own line, only where the body has not
              * already named it. `email` is nullable - an invalid token
              * identifies nobody - so this is absent rather than blank.
              */}
            {state.email && !bodyFor(state.status, state.email) ? (
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
              * D01b AC-03 DRAWS TWO BUTTONS HERE THAT THE CONTRACT CANNOT
              * SERVE: "Send a new link" and "Change the email address".
              *
              * `POST /admin/email-confirmation/resend` carries HTTPBearer, and
              * nothing at all writes an address change. Somebody arriving from
              * an expired link is not signed in, so both controls would 401 -
              * a button that refuses everyone is worse than a sentence that
              * tells them where to go.
              *
              * So the sentence stands and the buttons are ABSENT rather than
              * drawn-and-broken. Raised rather than synthesised: this is a
              * contract/design disagreement, not a copy decision.
              * TODO(api): a token-authenticated resend, so AC-03 can be built
              * as drawn. The token already proves which account it is.
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
