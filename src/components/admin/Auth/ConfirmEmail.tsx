"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { NevoLockup } from "@/components/shared/NevoLockup";
import { ApiError } from "@/lib/api/client";
import {
  emailConfirmationApi,
  retryAfterSeconds,
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
 * ~~THERE IS NO RESEND BUTTON, DELIBERATELY.~~ **THERE IS ONE NOW, 24 Sep.**
 * This read: *"the only control that could send a fresh link needs a session
 * the reader does not have."* True when written - resend carried `HTTPBearer`.
 * We asked for a token-authenticated resend, backend built it, and AC-03's
 * button is now what the frame always drew.
 *
 * Kept rather than deleted because the reasoning behind the absence was sound
 * at the time: resend really did declare bearer-only, and a button that 401s
 * for everyone who sees it is worse than a sentence telling them where to go.
 * The constraint was real and then it moved.
 *
 * A LATER NOTE HERE CLAIMED MORE THAN THAT AND WAS WRONG - that `/verify` had
 * been documented as needing a bearer, and therefore that declared security
 * cannot be trusted. Backend corrected it on 24 Sep: there is no global scheme
 * to inherit, an omitted security key already means open, and the declaration
 * is generated from the dependency graph. The full correction is in
 * `lib/api/emailConfirmation.ts`.
 */

type Phase = "verifying" | "done" | "unreachable";

/**
 * "90 seconds" / "2 minutes" - a wait somebody can act on.
 *
 * Rounded UP, always. Telling a person to come back in a minute when the
 * server will refuse for another ninety seconds earns a second refusal, and
 * the second one reads as the button being broken.
 */
function waitLabel(seconds: number): string {
  if (seconds <= 60) return "a minute";
  const mins = Math.ceil(seconds / 60);
  return `${mins} minutes`;
}

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
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  /** undefined = not refused. null = refused, no wait given. */
  const [tooSoon, setTooSoon] = useState<number | null | undefined>(undefined);
  const [resendFailed, setResendFailed] = useState(false);

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

  /*
   * The token goes with it, whatever state it is in - that is the credential
   * here, and every dead-token state is a person wanting another email.
   *
   * `tooSoon` is `undefined` for "not refused", and `number | null` for
   * "refused, with or without a wait". Three states, because collapsing the
   * refusal into the generic failure is what loses the only useful fact.
   */
  const sendNewLink = () => {
    setResending(true);
    setResent(false);
    setTooSoon(undefined);
    setResendFailed(false);
    emailConfirmationApi
      .resend(token)
      .then(() => setResent(true))
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 429) {
          setTooSoon(retryAfterSeconds(err.detail));
          return;
        }
        setResendFailed(true);
      })
      .finally(() => setResending(false));
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
              * "SEND A NEW LINK" - AC-03's own button, buildable since 24 Sep.
              *
              * It was absent under a comment saying the contract could not
              * serve it: resend carried HTTPBearer, and nobody arriving from an
              * email has a session. We asked for a token-authenticated resend
              * and backend built it, with our argument sharpened - the new link
              * goes to the address ON THE ACCOUNT, never to whoever presented
              * the token, so holding a dead link buys nothing except sending
              * mail to its rightful owner.
              *
              * The token is sent whatever state it is in. Expired, superseded
              * and already-used are all people with a reason to want another
              * email, which is the whole point of the button.
              *
              * AC-03's SECOND control, "Change the email address", is still
              * absent - now for a reason rather than a gap. Backend declined to
              * token-authenticate it: repointing an address with a leaked link
              * is a tenant takeover (change it, confirm it, then reset the
              * password). `/verify` transfers nothing; changing transfers
              * everything. Two ways to serve it are with design.
              */}
            {state.status === "expired" || state.status === "pending" ? (
              <div className="mt-6 flex w-full max-w-[360px] flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={sendNewLink}
                  disabled={resending}
                  className="h-[48px] w-full cursor-pointer rounded-[10px] bg-nevo-navy px-5 text-[15px] font-semibold text-nevo-cream transition-[filter] hover:brightness-110 disabled:cursor-default disabled:opacity-60"
                >
                  {resending ? "Sending…" : "Send a new link"}
                </button>

                {resent ? (
                  <p className="m-0 text-[13.5px] font-semibold text-nevo-navy">
                    Sent. Check your email in a minute or two.
                  </p>
                ) : null}

                {/*
                  * 429 IS DRAWN, NOT JUST CAUGHT. One email every two minutes
                  * per account, and that budget is SHARED with the in-console
                  * resend - so somebody who just asked from the other screen
                  * lands here on a refusal. "That didn't work" would send them
                  * pressing the button into the same wall; the wait is the only
                  * useful thing we know.
                  *
                  * `retryAfterSeconds` is nullable, so the copy works without a
                  * number rather than printing a null.
                  */}
                {tooSoon !== undefined ? (
                  <p className="m-0 max-w-[340px] text-[13.5px] leading-[1.5] text-nevo-navy">
                    {tooSoon === null
                      ? "A link went out very recently. Give it a couple of minutes, then try again."
                      : `A link went out very recently. Try again in ${waitLabel(tooSoon)}.`}
                  </p>
                ) : null}

                {resendFailed ? (
                  <p className="m-0 max-w-[340px] text-[13.5px] leading-[1.5] text-nevo-navy">
                    We couldn&rsquo;t send that just now. Nothing has changed
                    &ndash; try again in a moment.
                  </p>
                ) : null}

                {/*
                  * AC-03's "Change the email address", served as OPTION (A) -
                  * agreed with backend on 24 Sep.
                  *
                  * A sentence, not a third button. The address change needs a
                  * session, so every route to it goes through sign-in; a
                  * button here would just be the "Sign in" button above it
                  * wearing a different label.
                  *
                  * The alternative backend offered was token + password in one
                  * request, and it was declined for a reason worth keeping: a
                  * password prompt on a page reached from an email link is the
                  * shape of every phishing page a school has been trained to
                  * distrust. It would work, and it would teach the wrong
                  * reflex.
                  *
                  * Signing in works even with the wrong address on the
                  * account - they know what they typed, and they know their
                  * password.
                  */}
                <p className="m-0 max-w-[340px] text-[13.5px] leading-[1.55] text-nevo-near-black/55">
                  Wrong address? Sign in and you can change it there.
                </p>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
