"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { NevoLockup } from "@/components/shared/NevoLockup";
import { ApiError } from "@/lib/api/client";
import { getSession } from "@/lib/auth/session";
import { schoolApi } from "@/lib/api/school";
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
   * DRAWN NOW: D01b AC-03b (design 1397ec4, Lydia's item 25), "Link not
   * valid - not expired, not used". See `invalidBody` for what it says.
   */
  invalid: "This link doesn’t look right",
  pending: "This address still needs confirming",
};

/**
 * D01b's bodies, which say more than the server's `message` can.
 *
 * The frame names the link's lifetime and the address the link went to. The
 * server's `message` is one sentence with no knowledge of either, so where the
 * frame has written copy it wins, and `message` is the fallback for the two
 * states D01b does not draw.
 *
 * 48 HOURS, NOT THE FRAME'S 24 (SCRUM-151). The backend's
 * `CONFIRMATION_LIFETIME` is 48 hours, the confirmation email itself says "The
 * link works for 48 hours", and Teslim asked for this screen to say 48 too. An
 * admin told 24 would give up on a link that still works.
 *
 * `email` is nullable - an invalid token identifies nobody - so the address
 * clause is composed only when there is one, never as "sent to null".
 */
function bodyFor(status: EmailConfirmationStatus, email: string | null): string | null {
  if (status === "expired") {
    return email
      ? `Confirmation links last 48 hours. We can send a fresh one to ${email}.`
      : "Confirmation links last 48 hours. We can send a fresh one.";
  }
  if (status === "already_confirmed") {
    return "You’ve confirmed this address already – perhaps on another device, or by clicking the link twice. Nothing more to do here; just sign in and carry on.";
  }
  return null;
}

/**
 * AC-03b's body, reduced to what is true (5 Nov check, raised to design).
 *
 * The frame: "It may have been copied only part-way, or it's from an older
 * email. Nothing's wrong with your account - we can send {school} a fresh link
 * to {email}." Two parts don't hold:
 *  - "or it's from an older email": an older link comes back `expired`, with
 *    its address - that's AC-03, not this.
 *  - the address and school: an invalid token identifies nobody (`email` is
 *    null), so they can only be known when the person is SIGNED IN and their
 *    own confirmation is still pending. Signed out - the usual way someone
 *    opens an emailed link - there's nothing to name and nothing a button
 *    could do without a session. Signed out, it says to sign in (Lydia, below).
 */
function invalidBody(own: OwnConfirmation | null, signedOut: boolean): string | null {
  /*
   * LYDIA, 7 Nov (her 8 in the copy pass, and 13d): this screen is "This link
   * doesn't look right" - the expired screen keeps its own words - with Send a
   * new link when signed in and Sign in when signed out.
   *
   * SIGNED IN AND WAITING: the heading and Send a new link, "nothing else on
   * it". The admin is the school; there's no one else to send them to.
   *
   * SIGNED OUT: her SCRUM-321 line, "Sign in to your account to continue." -
   * no address, no school, Sign in the only control, because the screen has
   * none of them.
   */
  if (own) return null;
  if (signedOut) return "Sign in to your account to continue.";
  return "It may have been copied only part-way.";
}

/**
 * The signed-in admin's own confirmation, read only after an invalid link and
 * only while it is still waiting - the one case where AC-03b's address,
 * school and two buttons are true.
 */
interface OwnConfirmation {
  email: string;
  school: string | null;
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
  /** Signed in, still unconfirmed, after an invalid link - see `invalidBody`. */
  const [own, setOwn] = useState<OwnConfirmation | null>(null);
  /**
   * Known to have no session, after an invalid link: no session at all, or
   * the server refusing the one there is (401). A read that fails any other
   * way proves nothing, so it keeps the frame's part-way line.
   */
  const [signedOut, setSignedOut] = useState(false);

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
        /*
         * AC-03c (design 928cf30, Job 14): an expired link opened SIGNED OUT
         * names nobody and offers only Sign in - "an expired link is a URL
         * anyone can hold". Once signed in, AC-03 is what they see.
         */
        if (s.status === "expired") {
          if (!getSession()) setSignedOut(true);
          return;
        }
        // AC-03b's signed-in case: the link names nobody, but a session does.
        if (s.status !== "invalid") return;
        if (!getSession()) {
          setSignedOut(true);
          return;
        }
        Promise.all([emailConfirmationApi.read(), schoolApi.get().catch(() => null)])
          .then(([mine, school]) => {
            if ((mine.status === "pending" || mine.status === "expired") && mine.email) {
              setOwn({ email: mine.email, school: school?.name?.trim() || null });
            }
          })
          .catch((err: unknown) => {
            // The session has ended: signed out after all.
            if (err instanceof ApiError && err.status === 401) setSignedOut(true);
          });
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
      // An invalid token identifies nobody, so the signed-in resend asks for
      // the session's own address instead.
      .resend(state?.status === "invalid" ? undefined : token)
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
            {(() => {
              /*
               * AC-03c in LYDIA'S WORDS (9 Nov, item 22): "This link has
               * expired. Sign in and you can send a fresh one from the banner
               * at the top of your console." The frame's "we will send" stays
               * out - signing in sends nothing; the console's paused banner
               * has "Resend link". "Confirmation links last 48 hours." sits
               * between, where the frame puts its lifetime sentence, with
               * Lydia's 48 for the frame's 24 (copy pass, 7 Nov).
               */
              const body =
                state.status === "invalid"
                  ? invalidBody(own, signedOut)
                  : state.status === "expired" && signedOut
                    ? "Confirmation links last 48 hours. Sign in and you can send a fresh one from the banner at the top of your console."
                    : (bodyFor(state.status, state.email) ?? state.message);
              return body ? (
                <p className="mt-[13px] max-w-[420px] text-[17px] leading-[1.55] text-nevo-near-black/70">
                  {body}
                </p>
              ) : null;
            })()}
            {/*
              * The address on its own line, only where the body has not
              * already named it. `email` is nullable - an invalid token
              * identifies nobody - so this is absent rather than blank.
              */}
            {state.email && state.status !== "invalid" && !bodyFor(state.status, state.email) ? (
              <p className="mt-2.5 text-[14.5px] text-nevo-near-black/55">
                {state.email}
              </p>
            ) : null}
            {/* Signed in and waiting after an invalid link, Send a new link is
                the only control (Lydia, 13d) - they're signed in already. */}
            {OFFERS_SIGN_IN[state.status] && !(state.status === "invalid" && own) ? (
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
            {(state.status === "expired" && !signedOut) ||
            state.status === "pending" ||
            (state.status === "invalid" && own) ? (
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
                  *
                  * "THERE" IS THE AC-05 BANNER'S Change email, since 28 Sep.
                  * Before that this sentence pointed at nothing: the only
                  * caller of the address change was the setup wizard, which a
                  * signed-in admin never sees again.
                  */}
                {state.status === "invalid" && own ? null : (
                  <p className="m-0 max-w-[340px] text-[13.5px] leading-[1.55] text-nevo-near-black/55">
                    Wrong address? Sign in and you can change it there.
                  </p>
                )}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
