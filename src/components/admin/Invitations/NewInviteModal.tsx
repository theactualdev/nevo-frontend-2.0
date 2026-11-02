"use client";

import { useState } from "react";
import type { AdminClass } from "@/lib/api/classes";
import { ApiError, apiErrorCode } from "@/lib/api/client";
import {
  INVITATION_ALREADY_PENDING,
  invitesApi,
  type Invitation,
} from "@/lib/api/invites";
import { cn } from "@/lib/utils";
import { deliveryLine } from "./deliveryCopy";
import {
  CheckIcon,
  GHOST_BTN,
  Modal,
  PRIMARY_BTN,
  Spinner,
} from "../Roster/primitives";
import { splitName } from "./csv";

/**
 * D19's New Invite modal, for a teacher - the only person a school invites.
 *
 * THERE IS NO STUDENT VARIANT (Lydia's L2, 14 Oct; SCRUM-215 on the backend).
 * A child gets no invitation, link or email: they sign in with the school code
 * and their Student ID, and are added on Students. The student form - its
 * student email, parent contact and date-of-birth question - went with it,
 * rather than staying behind as a form nothing opens.
 *
 * WHAT THE FRAME DRAWS THAT THE API CANNOT CARRY: THE DELIVERY CHOICE, "Copy
 * link to share manually" vs "Send via email from Nevo". Nothing on the
 * request expresses it, and a field that collects something we then throw
 * away is worse than no field. Rather than show a radio that changes nothing,
 * the sent state always offers the link and reports what the backend actually
 * did through `deliveryStatus`. Raised with backend.
 */

const LABEL =
  "mb-[7px] block text-[12.5px] font-semibold text-nevo-near-black/60";

const FIELD =
  "h-[50px] w-full rounded-[10px] border-[1.5px] border-nevo-near-black/16 bg-nevo-cream px-[15px] text-[15px] text-nevo-near-black outline-none transition-colors focus:border-nevo-navy";

const HINT = "mt-2 text-[12.5px] leading-[1.5] text-nevo-near-black/55";

type Phase = "idle" | "sending" | "sent" | "failed" | "waiting";

export function NewInviteModal({
  classes,
  onClose,
  onSent,
}: {
  classes: AdminClass[];
  onClose: () => void;
  onSent: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [classId, setClassId] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [sent, setSent] = useState<Invitation | null>(null);
  const [copied, setCopied] = useState(false);

  // A teacher needs a way to be reached or a link to be handed.
  const ready = name.trim().length > 0 || email.trim().length > 0;

  const reset = () => {
    setName("");
    setEmail("");
    setClassId("");
    setSent(null);
    setCopied(false);
    setPhase("idle");
  };

  const send = () => {
    setPhase("sending");
    const { firstName, lastName } = splitName(name);
    invitesApi
      .create({
        role: "teacher",
        firstName: firstName || null,
        lastName,
        email: email.trim() || null,
        classId: classId || null,
      })
      .then((invite) => {
        setSent(invite);
        setPhase("sent");
        onSent();
      })
      .catch((err: unknown) => {
        // Not a fault, and trying again would be refused the same way: this
        // teacher's invitation is already in the list (ed123cb).
        setPhase(
          err instanceof ApiError &&
            err.status === 409 &&
            apiErrorCode(err.detail) === INVITATION_ALREADY_PENDING
            ? "waiting"
            : "failed",
        );
      });
  };

  const joinLink = sent?.token
    ? `${typeof window === "undefined" ? "" : window.location.origin}/join/${sent.token}`
    : null;

  // ---------------------------------------------------------------- SENT ---
  if (phase === "sent" && sent) {
    return (
      <Modal
        title="Invite sent"
        subtitle={sent.name ?? sent.email ?? null}
        onClose={() => {
          reset();
          onClose();
        }}
        footer={
          <>
            <button
              type="button"
              onClick={reset}
              className={cn(GHOST_BTN, "flex-1")}
            >
              Send another
            </button>
            <button
              type="button"
              onClick={() => {
                reset();
                onClose();
              }}
              className={cn(PRIMARY_BTN, "flex-1 justify-center")}
            >
              Done
            </button>
          </>
        }
      >
        <div className="flex justify-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-nevo-navy text-nevo-cream motion-safe:animate-nevo-pop">
            <CheckIcon size={22} />
          </span>
        </div>

        {joinLink ? (
          <div className="mt-5">
            <span className={LABEL}>Their join link</span>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-[10px] bg-nevo-cream-elevated px-4 py-3 font-mono text-[13px] text-nevo-near-black">
                {joinLink}
              </code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard
                    ?.writeText(joinLink)
                    .then(() => setCopied(true))
                    .catch(() => setCopied(false));
                }}
                className={cn(GHOST_BTN, "flex-none px-4 py-2.5")}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className={HINT}>
              {/* Reporting what happened, not what was requested - and in the
                  admin's language. This used to interpolate the enum raw, so a
                  school with no mail configured read
                  "Delivery: email_not_configured." */}
              {deliveryLine(sent.deliveryStatus)}
            </p>
          </div>
        ) : null}
      </Modal>
    );
  }

  // ------------------------------------------------------------ WAITING ---
  // Lydia's words, 31 Oct (Q11b).
  if (phase === "waiting") {
    return (
      <Modal
        title="This person already has an invitation waiting."
        onClose={onClose}
        footer={
          <>
            <button
              type="button"
              onClick={() => setPhase("idle")}
              className={cn(GHOST_BTN, "flex-1")}
            >
              Go back
            </button>
            <button
              type="button"
              onClick={() => {
                reset();
                onClose();
              }}
              className={cn(PRIMARY_BTN, "flex-1 justify-center")}
            >
              Done
            </button>
          </>
        }
      >
        <p className="m-0 text-[14.5px] leading-[1.6] text-nevo-near-black/72">
          Resend it instead.
        </p>
      </Modal>
    );
  }

  // ------------------------------------------------------------- FAILED ---
  if (phase === "failed") {
    return (
      <Modal
        title="Something went wrong. We&rsquo;re on it."
        onClose={onClose}
        footer={
          <>
            <button
              type="button"
              onClick={() => setPhase("idle")}
              className={cn(GHOST_BTN, "flex-1")}
            >
              Go back
            </button>
            <button
              type="button"
              onClick={send}
              className={cn(PRIMARY_BTN, "flex-1 justify-center")}
            >
              Try again
            </button>
          </>
        }
      >
        <p className="m-0 text-[14.5px] leading-[1.6] text-nevo-near-black/72">
          Your progress is saved - nothing you entered is lost. Please give it
          another try.
        </p>
      </Modal>
    );
  }

  // --------------------------------------------------------------- FORM ---
  return (
    <Modal
      busy={phase === "sending"}
      title="Invite a teacher"
      subtitle="You'll get a link to join your school on Nevo, to send on or share"
      onClose={onClose}
      footer={
        phase === "sending" ? (
          <div className="flex flex-1 items-center justify-center gap-2.5 py-3">
            <Spinner />
            <span className="text-sm text-nevo-near-black/60">Sending…</span>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={onClose}
              className={cn(GHOST_BTN, "flex-1")}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={send}
              disabled={!ready}
              className={cn(PRIMARY_BTN, "flex-1 justify-center")}
            >
              Send invite
            </button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-5">
        <div>
          <label htmlFor="invite-name" className={LABEL}>
            Name
          </label>
          <input
            id="invite-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Folake Adeyemi"
            autoComplete="off"
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor="invite-class" className={LABEL}>
            Class assignment{" "}
            <span className="font-normal">(optional)</span>
          </label>
          <select
            id="invite-class"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className={cn(FIELD, "cursor-pointer")}
          >
            <option value="">No class yet</option>
            {classes
              .filter((c) => !c.archivedAt)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </div>

        <div>
          <label htmlFor="invite-email" className={LABEL}>
            Email{" "}
            <span className="font-normal">(optional)</span>
          </label>
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="adeyemi.f@school.edu.ng"
            autoComplete="off"
            className={FIELD}
          />
        </div>

        {/*
         * D24b's "Cost" for a teacher, which an admin asks about before
         * sending: "No charge". The contract says the same thing in its own
         * words - the additions quote documents that "the answer for a
         * teacher is nothing at all" - so this is a statement of the pricing,
         * not a figure computed or fetched here.
         */}
        <div>
          <span className={LABEL}>Cost</span>
          <div className="rounded-[10px] bg-nevo-navy/[0.06] px-4 py-3">
            <span className="flex items-center gap-2 text-[14.5px] font-semibold text-nevo-navy">
              <CheckIcon />
              No charge
            </span>
            <p className="m-0 mt-1 text-[13px] leading-[1.5] text-nevo-near-black/62">
              Teacher accounts are always free. Only students count towards
              your bill.
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
