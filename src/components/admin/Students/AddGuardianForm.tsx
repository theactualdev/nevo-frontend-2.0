"use client";

import { useState } from "react";
import { useSetupGate } from "@/hooks";
import { ApiError, apiErrorMessage } from "@/lib/api/client";
import { consentsApi, type ParentConsentRequestReceipt } from "@/lib/api/consents";
import { cn } from "@/lib/utils";
import { PRIMARY_BTN } from "../Roster/primitives";
import { isEmail } from "./useConsentRequests";

/**
 * Put a parent or guardian on a student's record, and send them the consent
 * request, in one step.
 *
 * WHY THIS EXISTS NOW. Consent is a gate: a child's learning begins when a
 * parent gives permission, and nothing starts before then. A student with
 * nobody on record therefore could never start - and the student page said
 * "No guardian on the record" with nothing to do about it. Every older
 * student without one, and every student added mid-term, was stuck.
 *
 * There is no endpoint that writes a guardian directly. The consent request
 * route takes a name and contact and creates the guardian link as it sends
 * (its receipt carries `parentLinkId`), so adding a guardian IS sending the
 * request, and the button says so. See `consentsApi.addGuardian`.
 *
 * NAME AND EMAIL TOGETHER, which is how design said the parent fields come
 * back. Email only: a phone number is no longer something Nevo sends to
 * (SCRUM-162).
 */
export function AddGuardianForm({
  studentId,
  studentFirstName,
  onAdded,
  onCancel,
}: {
  studentId: string;
  studentFirstName: string;
  onAdded: (receipt: ParentConsentRequestReceipt, guardianName: string) => void;
  onCancel?: () => void;
}) {
  const { writesPaused, note } = useSetupGate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameOk = name.trim().length >= 2;
  const emailOk = isEmail(email);
  const ready = nameOk && emailOk && !sending && !writesPaused;

  const submit = () => {
    if (!ready) return;
    setSending(true);
    setError(null);
    const guardian = { name: name.trim(), email: email.trim() };
    consentsApi
      .addGuardian(studentId, guardian)
      .then((receipt) => onAdded(receipt, guardian.name))
      .catch((err: unknown) =>
        setError(
          (err instanceof ApiError ? apiErrorMessage(err.detail) : null) ??
            "That didn’t go through, so nobody was added and nothing was sent. Try again in a moment.",
        ),
      )
      .finally(() => setSending(false));
  };

  const input =
    "mt-1.5 w-full rounded-[10px] border border-nevo-near-black/12 bg-nevo-cream px-3.5 py-2.5 text-[14.5px] text-nevo-near-black outline-none transition-colors focus:border-nevo-navy";

  return (
    <div className="flex max-w-[440px] flex-col gap-3">
      <label className="text-[13px] font-medium text-nevo-near-black/62">
        Parent or guardian&rsquo;s name
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          autoComplete="off"
          className={input}
        />
      </label>
      <label className="text-[13px] font-medium text-nevo-near-black/62">
        Their email
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
          autoComplete="off"
          placeholder="parent@example.com"
          className={input}
        />
      </label>
      {email.trim() && !emailOk ? (
        <p className="m-0 text-[13px] text-nevo-near-black/60">
          That doesn&rsquo;t look like an email address yet.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="m-0 text-[13.5px] leading-[1.5] text-nevo-navy">
          {error}
        </p>
      ) : null}
      {writesPaused && note ? (
        <p className="m-0 text-[13px] text-nevo-near-black/55">{note}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={submit} disabled={!ready} className={cn(PRIMARY_BTN)}>
          {sending ? "Sending…" : "Add and send the consent request"}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer text-sm font-semibold text-nevo-near-black/60 transition-opacity hover:opacity-75"
          >
            Cancel
          </button>
        ) : null}
      </div>
      <p className="m-0 text-[12.5px] leading-[1.5] text-nevo-near-black/50">
        {studentFirstName}&rsquo;s learning begins as soon as they give
        permission.
      </p>
    </div>
  );
}
