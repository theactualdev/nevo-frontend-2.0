"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { changeEmailFailure } from "./changeEmailOutcome";
import {
  emailConfirmationApi,
  type EmailConfirmationStatus,
} from "@/lib/api/emailConfirmation";
import { Spinner } from "../Roster/primitives";
import { StepHeading, WIZARD_PRIMARY, WIZARD_SECONDARY } from "./OnboardingWizard";

/**
 * D01 step 2 - AC-01 "Check your email" and AC-02 "Email confirmed".
 *
 * WHY IT SITS HERE, BEFORE THE DPA, IN D01'S OWN WORDS: *"Email confirm sits
 * before the DPA so acceptance is tied to a verified owner."*
 *
 * That is the whole reason this step exists, and it is not a nicety. The DPA
 * acceptance record is a compliance artefact - it names an administrator, a
 * version and a timestamp, and D12 and D22 both display it. Without this step
 * that record could name an address nobody had shown they owned.
 *
 * Nothing needs remediating from before it: there are no real schools yet, so
 * no acceptance has been collected from an unverified address. Confirmed with
 * Olayinka, 23 Sep.
 *
 * THE ADMIN IS SIGNED IN BY NOW. `SignUpStep` registers and then calls
 * `loginPassword`, so both endpoints this step needs carry their `HTTPBearer`
 * happily. That is NOT true of the expired-link screen at
 * `/auth/admin/confirm/[token]`, which is reached from an email by somebody
 * with no session - see `ConfirmEmail`, where the same resend cannot be
 * offered for exactly that reason.
 *
 * HOW AC-01 BECOMES AC-02. The link is opened somewhere else - a phone, another
 * tab - so this screen has to notice on its own. It polls. The frame draws no
 * refresh control and no countdown, and neither is invented here.
 *
 * A FAILED READ IS NOT AN UNCONFIRMED ADDRESS. The poll's catch does nothing at
 * all: it does not advance, and it does not report. Treating a dropped request
 * as "still waiting" would be the mild version; treating it as "not confirmed"
 * after somebody HAD confirmed would strand them on a screen with no way
 * forward. Silence until a read succeeds is the honest behaviour, and the step
 * is not blocking anything the person can act on anyway.
 */

/** A calm poll for a person who has gone to open their email. Not a rule. */
const POLL_MS = 5000;

/** The two statuses that mean this address is settled and the DPA may proceed. */
function isConfirmed(status: EmailConfirmationStatus | null): boolean {
  return status === "confirmed" || status === "already_confirmed";
}

/*
 * NO BACK, AND THAT IS THE FRAME'S CALL. D01 step 2 offers exactly two
 * actions - "Resend the link" and "That email isn't right - change it" - and
 * Back was only ever standing in for the second one while we believed it could
 * not be built. It went the moment the real control arrived: returning to
 * sign-up, where the fields are locked because the school already exists,
 * never did the thing the person wanted.
 */
export function ConfirmEmailStep({
  schoolName,
  email,
  onDone,
}: {
  schoolName: string;
  email: string;
  onDone: () => void;
}) {
  const [status, setStatus] = useState<EmailConfirmationStatus | null>(null);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [resendFailed, setResendFailed] = useState(false);
  const [changing, setChanging] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);
  /** The address in play - the prop until a change lands, then the new one. */
  const [current, setCurrent] = useState(email);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const read = useCallback(() => {
    emailConfirmationApi
      .read()
      .then((s) => setStatus(s.status))
      // Deliberately empty. See the header: a failed read says nothing about
      // whether the address is confirmed, so it must not move this screen.
      .catch(() => {});
  }, []);

  useEffect(() => {
    read();
    timer.current = setInterval(read, POLL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [read]);

  // Stop polling the moment there is nothing left to learn.
  useEffect(() => {
    if (isConfirmed(status) && timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, [status]);

  /*
   * The two 409s mean opposite things and must not share a sentence.
   *
   * `email_already_confirmed` - somebody confirmed in the other tab while this
   * form was open. That is not a failure, it is the thing they were waiting
   * for, so the poll is nudged rather than an error shown.
   *
   * `email_already_in_use` - a real collision, and the one case where the
   * person has to choose a different address.
   */
  const saveEmail = () => {
    const next = draft.trim();
    if (!next) return;
    setSaving(true);
    setChangeError(null);
    emailConfirmationApi
      .changeEmail(next)
      .then((s) => {
        setCurrent(s.email ?? next);
        setStatus(s.status);
        setChanging(false);
        setResent(true);
      })
      .catch((err: unknown) => {
        const failure = changeEmailFailure(err);
        if (failure.confirmedElsewhere) {
          // Confirmed elsewhere. Let the poll land it rather than say "no".
          read();
          setChanging(false);
          return;
        }
        setChangeError(failure.message);
      })
      .finally(() => setSaving(false));
  };

  const resend = () => {
    setResending(true);
    setResent(false);
    setResendFailed(false);
    emailConfirmationApi
      .resend()
      .then(() => setResent(true))
      .catch(() => setResendFailed(true))
      .finally(() => setResending(false));
  };

  if (isConfirmed(status)) {
    return (
      <>
        <StepHeading
          title="Email confirmed"
          sub="Your address is confirmed. Next, please read and agree to the data processing agreement on behalf of your school."
        />
        <button type="button" onClick={onDone} className={WIZARD_PRIMARY}>
          Continue to the agreement
        </button>
      </>
    );
  }

  return (
    <>
      <StepHeading
        title="Check your email"
        sub={`${schoolName || "Your school"} has been created. We've sent a confirmation link to:`}
      />
      <p className="m-0 text-[15.5px] font-semibold break-all text-nevo-near-black">
        {current}
      </p>
      <p className="mt-2.5 text-[14.5px] leading-[1.55] text-nevo-near-black/68">
        Open it to confirm this address and carry on. It can take a minute to
        arrive.
      </p>

      {resent ? (
        <p className="mt-4 text-[13.5px] font-semibold text-nevo-navy">
          Sent. It may take a minute to arrive.
        </p>
      ) : null}
      {resendFailed ? (
        <p className="mt-4 text-[13.5px] leading-[1.5] text-nevo-navy">
          We couldn&rsquo;t send that just now. Your first link is still valid
          &ndash; try again in a moment.
        </p>
      ) : null}

      <div className="mt-6 flex flex-col gap-2">
        <button
          type="button"
          onClick={resend}
          disabled={resending}
          className={WIZARD_PRIMARY}
        >
          {resending ? <Spinner /> : "Resend the link"}
        </button>
        {/*
          * "THAT EMAIL ISN'T RIGHT - CHANGE IT", D01's own second action.
          *
          * ~~The contract cannot serve this.~~ **It always could.**
          * `PATCH /api/v1/admin/email` was deployed the whole time and this
          * file said, in as many words, that nothing anywhere writes an
          * administrator's address. We searched paths for
          * `confirm|activate|verify` - the words in our own question - and the
          * route matches none of them. Third time that shape has cost
          * something here.
          *
          * BEARER-AUTHENTICATED, WHICH IS FINE HERE AND NOT ON AC-03. The
          * wizard has a session; the emailed-link screen does not, and backend
          * declined to token-authenticate a change because repointing an
          * address from a leaked link is a tenant takeover.
          *
          * The response IS the new state, so the step re-renders from it
          * rather than guessing: a successful change supersedes every
          * outstanding link and sends a fresh one.
          */}
        {changing ? (
          <div className="mt-1 flex flex-col gap-2">
            <label className="text-[13px] font-medium text-nevo-near-black/62">
              The right address
              <input
                type="email"
                autoComplete="email"
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setChangeError(null);
                }}
                placeholder="you@yourschool.edu.ng"
                className="mt-2 w-full rounded-[10px] border border-nevo-near-black/12 bg-nevo-cream-elevated px-4 py-3.5 text-[15.5px] text-nevo-near-black outline-none transition-colors focus:border-nevo-navy"
              />
            </label>
            {changeError ? (
              <p className="m-0 text-[13.5px] leading-[1.5] text-nevo-navy">
                {changeError}
              </p>
            ) : null}
            <button
              type="button"
              onClick={saveEmail}
              disabled={saving || !draft.trim()}
              className={WIZARD_PRIMARY}
            >
              {saving ? <Spinner /> : "Use this address"}
            </button>
            <button
              type="button"
              onClick={() => {
                setChanging(false);
                setChangeError(null);
              }}
              className={WIZARD_SECONDARY}
            >
              Keep {current}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setChanging(true);
              setDraft("");
            }}
            className={WIZARD_SECONDARY}
          >
            That email isn&rsquo;t right &ndash; change it
          </button>
        )}
      </div>
    </>
  );
}
