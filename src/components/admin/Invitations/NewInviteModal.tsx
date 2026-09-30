"use client";

import { useState } from "react";
import type { AdminClass } from "@/lib/api/classes";
import {
  invitesApi,
  type Invitation,
  type InviteRole,
} from "@/lib/api/invites";
import { cn } from "@/lib/utils";
import { deliveryLine, parentConsentLine } from "./deliveryCopy";
import {
  CheckIcon,
  GHOST_BTN,
  Modal,
  PRIMARY_BTN,
  Spinner,
} from "../Roster/primitives";
import { splitName } from "./csv";

/**
 * D19's New Invite modal, in its teacher and student variants.
 *
 * WHAT THE FRAME DRAWS THAT THE API CANNOT CARRY. Three controls are absent
 * rather than decorative, each for the same reason - a field that collects
 * something we then throw away is worse than no field:
 *
 * 1. DATE OF BIRTH, with its "Students must be under 18" check. `POST
 *    /api/v1/invites` has no DOB field of any kind. Collecting a child's
 *    birth date and discarding it would be the worst version of this: it is
 *    exactly the sort of data a school is entitled to assume we kept for a
 *    reason.
 * 2. PARENT / GUARDIAN NAME as its own input. The body carries a single
 *    `parentContact` string, so the two fields the frame draws collapse into
 *    one, and it is the contact that survives - a name with no way to reach
 *    them sends nothing.
 * 3. THE DELIVERY CHOICE, "Copy link to share manually" vs "Send via email
 *    from Nevo". Nothing on the request expresses it. Rather than show a radio
 *    that changes nothing, the sent state always offers the link and reports
 *    what the backend actually did through `deliveryStatus`.
 *
 * All three are raised with backend.
 */

const LABEL =
  "mb-[7px] block text-[12.5px] font-semibold text-nevo-near-black/60";

const FIELD =
  "h-[50px] w-full rounded-[10px] border-[1.5px] border-nevo-near-black/16 bg-nevo-cream px-[15px] text-[15px] text-nevo-near-black outline-none transition-colors focus:border-nevo-navy";

const HINT = "mt-2 text-[12.5px] leading-[1.5] text-nevo-near-black/55";

type Phase = "idle" | "sending" | "sent" | "failed";

export function NewInviteModal({
  role,
  classes,
  onClose,
  onSent,
}: {
  role: InviteRole;
  classes: AdminClass[];
  onClose: () => void;
  onSent: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [classId, setClassId] = useState("");
  const [parentContact, setParentContact] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [sent, setSent] = useState<Invitation | null>(null);
  const [copied, setCopied] = useState(false);

  const isStudent = role === "student";

  // A teacher needs a way to be reached or a link to be handed; a student's
  // guardian must be reachable, because the consent request goes to them.
  const ready = isStudent
    ? name.trim().length > 0 && parentContact.trim().length > 0
    : name.trim().length > 0 || email.trim().length > 0;

  const reset = () => {
    setName("");
    setEmail("");
    setClassId("");
    setParentContact("");
    setSent(null);
    setCopied(false);
    setPhase("idle");
  };

  const send = () => {
    setPhase("sending");
    const { firstName, lastName } = splitName(name);
    invitesApi
      .create({
        role,
        firstName: firstName || null,
        lastName,
        email: email.trim() || null,
        parentContact: isStudent ? parentContact.trim() || null : null,
        classId: classId || null,
      })
      .then((invite) => {
        setSent(invite);
        setPhase("sent");
        onSent();
      })
      .catch(() => setPhase("failed"));
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

        {isStudent ? (
          <p className="mt-4 text-center text-[14.5px] leading-[1.6] text-nevo-near-black/72">
            {parentContact ? (
              /* Was: "A consent request is on its way to {parentContact}."
                 Nothing sends one, and the claim came from the contact the
                 admin had just typed. It reports `consentStatus` off the
                 create response now - which on a fresh invite is usually
                 "not sent", said plainly, with no offer to send one. */
              <>{parentConsentLine(parentContact, sent.name, sent.consentStatus)}</>
            ) : (
              "The invitation has been created."
            )}
          </p>
        ) : null}

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
      title={isStudent ? "Invite a student" : "Invite a teacher"}
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
            placeholder={isStudent ? "Chisom Eze" : "Folake Adeyemi"}
            autoComplete="off"
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor="invite-class" className={LABEL}>
            {isStudent ? "Class" : "Class assignment"}{" "}
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
            {isStudent ? "Student email" : "Email"}{" "}
            <span className="font-normal">(optional)</span>
          </label>
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={
              isStudent ? "chisom.e@school.edu.ng" : "adeyemi.f@school.edu.ng"
            }
            autoComplete="off"
            className={FIELD}
          />
          {isStudent ? (
            <p className={HINT}>
              Older students sign in with their own email; younger ones use a
              class code.
            </p>
          ) : null}
        </div>

        {!isStudent ? (
          /*
           * D24b's "Cost" for a teacher, which an admin asks about before
           * sending: "No charge". The contract says the same thing in its own
           * words - the additions quote documents that "the answer for a
           * teacher is nothing at all" - so this is a statement of the pricing,
           * not a figure computed or fetched here.
           */
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
        ) : null}

        {isStudent ? (
          <div>
            <label htmlFor="invite-parent" className={LABEL}>
              Parent / guardian email
            </label>
            <input
              id="invite-parent"
              type="email"
              value={parentContact}
              onChange={(e) => setParentContact(e.target.value)}
              placeholder="mrs.eze@email.com"
              autoComplete="off"
              className={FIELD}
            />
            <p className={HINT}>
              {/* "will receive a notice" was the same promise as the consent
                  claim above - nothing sends one, and no screen can currently
                  tell an admin a parent has been contacted. This says who the
                  contact is FOR, which is true today. */}
              Who Nevo contacts about this child&rsquo;s data, and who confirms
              consent for your school&rsquo;s own records. Required for all
              students.
            </p>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
