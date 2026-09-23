"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

export function ConfirmEmailStep({
  schoolName,
  email,
  onBack,
  onDone,
}: {
  schoolName: string;
  email: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const [status, setStatus] = useState<EmailConfirmationStatus | null>(null);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [resendFailed, setResendFailed] = useState(false);
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
        {email}
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
          * D01 DRAWS A SECOND ACTION HERE THAT THE CONTRACT CANNOT SERVE:
          * "That email isn't right - change it". Nothing in the deployed
          * document writes an administrator's address - not on this flow, not
          * in Settings, not anywhere. The same control is drawn on D01b's
          * AC-03 and is absent there for the same reason.
          *
          * So Back is offered instead, which is honest about what it does: it
          * returns to sign-up, where the fields are locked because the school
          * already exists. That is not the same thing and is not pretending to
          * be.
          * TODO(api): a way to change the address before it is confirmed. It
          * is the one field a proprietor is most likely to mistype, and today
          * a typo makes the account unreachable.
          */}
        <button type="button" onClick={onBack} className={WIZARD_SECONDARY}>
          Back
        </button>
      </div>
    </>
  );
}
