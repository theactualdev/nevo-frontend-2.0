"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminClass } from "@/lib/api/classes";
import { ApiError, apiErrorCode } from "@/lib/api/client";
import {
  CLASS_NOT_FOUND,
  INVITATION_ALREADY_PENDING,
  INVITATION_REISSUE_AVAILABLE,
  SUBJECT_NOT_FOUND,
  invitesApi,
  refusedInvitationId,
  type Invitation,
  type InvitedClassDraft,
} from "@/lib/api/invites";
import { classTakes, subjectsApi, type SchoolSubject } from "@/lib/api/subjects";
import { ReadFailed } from "../ReadFailed";
import { NevoSelect } from "@/components/shared/NevoSelect";
import { reissueRefusal, reissuedLine } from "./reissueCopy";
import { cn } from "@/lib/utils";
import { deliveryLine } from "./deliveryCopy";
import {
  CheckIcon,
  GHOST_BTN,
  Modal,
  PRIMARY_BTN,
  Spinner,
} from "../Roster/primitives";
/** D19's own test for an email the form can send to. */
function validEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

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

type Phase = "idle" | "sending" | "sent" | "failed" | "waiting" | "revoked";

/** One row of D19's "Classes and subjects": a class, and the subjects ticked for it. */
interface Assign {
  key: number;
  classId: string;
  /** School subject ids, as T15 takes them. */
  subjectIds: string[];
}

const blankAssign = (key: number): Assign => ({ key, classId: "", subjectIds: [] });

/** The legacy single class is recorded and not applied since T15; never sent. */
export function invitedClasses(assigns: readonly Assign[]): InvitedClassDraft[] {
  return assigns.flatMap((a) =>
    a.classId ? a.subjectIds.map((subjectId) => ({ classId: a.classId, subjectId })) : [],
  );
}

export function NewInviteModal({
  classes,
  onClose,
  onSent,
}: {
  classes: AdminClass[];
  onClose: () => void;
  onSent: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [assigns, setAssigns] = useState<Assign[]>([blankAssign(0)]);
  const [nextKey, setNextKey] = useState(1);
  /** The school's subjects, to turn a class's subject names into ids. Null while unread. */
  const [schoolSubjects, setSchoolSubjects] = useState<SchoolSubject[] | null>(null);
  const [subjectsFailed, setSubjectsFailed] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [sent, setSent] = useState<Invitation | null>(null);
  const [copied, setCopied] = useState(false);
  /** The revoked invitation the server pointed at, to reissue instead (ed123cb). */
  const [revokedId, setRevokedId] = useState<string | null>(null);
  const [reissuing, setReissuing] = useState(false);
  const [reissueFailed, setReissueFailed] = useState<string | null>(null);
  /** Whether `sent` came back from a reissue rather than a new invitation. */
  const [reissued, setReissued] = useState(false);

  const fetchSubjects = useCallback(() => {
    subjectsApi
      .list()
      .then((rows) => setSchoolSubjects(Array.isArray(rows) ? rows : []))
      .catch(() => setSubjectsFailed(true));
  }, []);
  useEffect(() => {
    fetchSubjects();
  }, [fetchSubjects]);

  /*
   * D19'S FORM (backlog 16; T15, live 21 Nov; Lydia 19 Nov L25): a first and
   * a last name as two fields, an email, and "Classes and subjects" - each
   * class with the subjects the teacher takes to it, "Add another class", and
   * "Remove this class". `POST /invites` carries them as `classes: [{classId,
   * subjectId}]`, and the server attaches every one when the teacher accepts.
   * The subject is required per class (SCRUM-194), so a class with none ticked
   * is one of the "N things still to fill in", and Send waits for none. No
   * "(optional)" anywhere (SCRUM-207).
   *
   * WITHOUT D19's "Other" ("{name} will be added to {class}"), as Lydia ruled
   * (L54, 25 Nov: "Drop it until the subject is added on the class itself").
   * The invitation names a SCHOOL subject id, so Other would first have to add
   * a new subject to the class - a write nobody sending an invite expects.
   */
  const openRows = assigns.filter((a) => !a.classId || a.subjectIds.length === 0).length;
  const missing =
    (firstName.trim() ? 0 : 1) +
    (lastName.trim() ? 0 : 1) +
    (validEmail(email) ? 0 : 1) +
    openRows;
  const ready = missing === 0;

  const liveClasses = classes.filter((c) => !c.archivedAt);
  /** The school subjects a class offers, matched by any spelling of their name. */
  const offeredBy = (classId: string): SchoolSubject[] => {
    const klass = liveClasses.find((c) => c.id === classId);
    if (!klass || !schoolSubjects) return [];
    return schoolSubjects.filter((s) => classTakes(klass.subjects, s));
  };
  const setAssign = (key: number, change: Partial<Assign>) =>
    setAssigns((rows) => rows.map((a) => (a.key === key ? { ...a, ...change } : a)));
  const addAssign = () => {
    setAssigns((rows) => [...rows, blankAssign(nextKey)]);
    setNextKey((k) => k + 1);
  };

  const reset = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setAssigns([blankAssign(nextKey)]);
    setNextKey((k) => k + 1);
    setSent(null);
    setCopied(false);
    setRevokedId(null);
    setReissueFailed(null);
    setReissued(false);
    setPhase("idle");
  };

  const send = () => {
    if (!ready) return;
    setPhase("sending");
    invitesApi
      .create({
        role: "teacher",
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        classes: invitedClasses(assigns),
      })
      .then((invite) => {
        setSent(invite);
        setPhase("sent");
        onSent();
      })
      .catch((err: unknown) => {
        // Not faults, and trying again would be refused the same way
        // (ed123cb): this teacher's invitation is already in the list, or it
        // was revoked and the way back is reissuing that one.
        const code =
          err instanceof ApiError && err.status === 409 ? apiErrorCode(err.detail) : null;
        const pointedAt = refusedInvitationId(err);
        /*
         * A class or subject that has gone since the form was filled (T15's
         * 404s, each naming its id). Trying again would be refused the same
         * way, so the choice that went is taken out of the form, the subjects
         * are read again, and the admin is back on the form with it counted
         * as still to fill in. The server's message is never shown.
         */
        const gone =
          err instanceof ApiError && err.status === 404 ? apiErrorCode(err.detail) : null;
        const goneId =
          err instanceof ApiError && err.detail && typeof err.detail === "object"
            ? ((err.detail as { detail?: Record<string, unknown> }).detail ??
                (err.detail as Record<string, unknown>))
            : null;
        if (gone === CLASS_NOT_FOUND && typeof goneId?.classId === "string") {
          const id = goneId.classId;
          setAssigns((rows) => rows.map((a) => (a.classId === id ? { ...a, classId: "", subjectIds: [] } : a)));
          setPhase("idle");
          return;
        }
        if (gone === SUBJECT_NOT_FOUND && typeof goneId?.subjectId === "string") {
          const id = goneId.subjectId;
          setAssigns((rows) => rows.map((a) => ({ ...a, subjectIds: a.subjectIds.filter((s) => s !== id) })));
          fetchSubjects();
          setPhase("idle");
          return;
        }
        if (code === INVITATION_ALREADY_PENDING) {
          setPhase("waiting");
        } else if (code === INVITATION_REISSUE_AVAILABLE && pointedAt) {
          setRevokedId(pointedAt);
          setReissueFailed(null);
          setPhase("revoked");
        } else {
          setPhase("failed");
        }
      });
  };

  /** Reissue the revoked invitation the server pointed at (Lydia, 2 Nov, 14). */
  const reissue = () => {
    if (!revokedId || reissuing) return;
    setReissuing(true);
    setReissueFailed(null);
    invitesApi
      .reissue(revokedId)
      .then((invite) => {
        setSent(invite);
        setReissued(true);
        setPhase("sent");
        onSent();
      })
      .catch((err: unknown) => {
        setReissueFailed(
          reissueRefusal(err) ?? "That didn't reissue. We're on it - try again in a moment.",
        );
      })
      .finally(() => setReissuing(false));
  };

  const joinLink = sent?.token
    ? `${typeof window === "undefined" ? "" : window.location.origin}/join/${sent.token}`
    : null;

  // ---------------------------------------------------------------- SENT ---
  if (phase === "sent" && sent) {
    return (
      <Modal
        title={reissued ? reissuedLine(sent.email ?? sent.name ?? "them") : "Invite sent"}
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

  // ------------------------------------------------------------ REVOKED ---
  // Lydia's words, 2 Nov (14), with Reissue invitation offered here.
  if (phase === "revoked") {
    return (
      <Modal
        title="This teacher&rsquo;s invitation was revoked."
        onClose={onClose}
        footer={
          <>
            <button
              type="button"
              onClick={() => setPhase("idle")}
              disabled={reissuing}
              className={cn(GHOST_BTN, "flex-1")}
            >
              Go back
            </button>
            <button
              type="button"
              onClick={reissue}
              disabled={reissuing}
              className={cn(PRIMARY_BTN, "flex-1 justify-center")}
            >
              {reissuing ? "Reissuing…" : "Reissue invitation"}
            </button>
          </>
        }
      >
        <p className="m-0 text-[14.5px] leading-[1.6] text-nevo-near-black/72">
          Reissue it instead.
        </p>
        {reissueFailed ? (
          <p role="status" className="m-0 mt-3 text-[14px] leading-[1.5] text-nevo-navy">
            {reissueFailed}
          </p>
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
          <div className="flex w-full flex-col gap-2.5">
            {missing > 0 ? (
              <p
                data-missing
                className="m-0 text-[13px] leading-[1.5] text-nevo-near-black/58"
              >
                {`${missing} ${missing === 1 ? "thing" : "things"} still to fill in`}
              </p>
            ) : null}
            <div className="flex gap-3">
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
            </div>
          </div>
        )
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="invite-first-name" className={LABEL}>
              First name
            </label>
            <input
              id="invite-first-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Folake"
              autoComplete="off"
              className={FIELD}
            />
          </div>
          <div>
            <label htmlFor="invite-last-name" className={LABEL}>
              Last name
            </label>
            <input
              id="invite-last-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Adeyemi"
              autoComplete="off"
              className={FIELD}
            />
          </div>
        </div>

        <div>
          <label htmlFor="invite-email" className={LABEL}>
            Email
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

        {/* D19's "Classes and subjects" (T15). */}
        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className={LABEL}>Classes and subjects</legend>
          {subjectsFailed ? (
            <ReadFailed
              className="mb-3"
              what="your school's subject list"
              onRetry={() => {
                setSubjectsFailed(false);
                fetchSubjects();
              }}
            />
          ) : null}
          <div className="flex flex-col gap-3">
            {assigns.map((a) => {
              const klass = liveClasses.find((c) => c.id === a.classId) ?? null;
              const usedElsewhere = new Set(
                assigns.filter((o) => o.key !== a.key).map((o) => o.classId).filter(Boolean),
              );
              const offered = a.classId ? offeredBy(a.classId) : [];
              return (
                <div
                  key={a.key}
                  data-assign
                  className="rounded-[10px] border border-nevo-near-black/12 px-3.5 py-3"
                >
                  <label htmlFor={`invite-class-${a.key}`} className="sr-only">
                    Class
                  </label>
                  {/* The house dropdown, never a native select: the
                      admin console's guard (noNativeSelect.test.ts). */}
                  <NevoSelect
                    id={`invite-class-${a.key}`}
                    value={a.classId}
                    onValueChange={(v) => setAssign(a.key, { classId: v, subjectIds: [] })}
                    placeholder="Select a class"
                    options={liveClasses
                      .filter((c) => c.id === a.classId || !usedElsewhere.has(c.id))
                      .map((c) => ({ value: c.id, label: c.name }))}
                    triggerClassName={cn(FIELD, "h-[44px]")}
                  />
                  {klass ? (
                    <div role="group" aria-label={`Subjects ${klass.name} offers`} className="mt-2.5">
                      <p className="m-0 text-[12px] text-nevo-near-black/60">
                        {`Subjects ${klass.name} offers. Tick the ones they take.`}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {offered.map((s) => {
                          const on = a.subjectIds.includes(s.id);
                          return (
                            <button
                              key={s.id}
                              type="button"
                              role="checkbox"
                              aria-checked={on}
                              onClick={() =>
                                setAssign(a.key, {
                                  subjectIds: on
                                    ? a.subjectIds.filter((id) => id !== s.id)
                                    : [...a.subjectIds, s.id],
                                })
                              }
                              className={cn(
                                "inline-flex cursor-pointer items-center gap-2 rounded-[9px] border-[1.5px] px-3 py-[7px] text-[13.5px] font-medium transition-colors",
                                on
                                  ? "border-nevo-navy bg-nevo-navy/[0.06] text-nevo-navy"
                                  : "border-nevo-near-black/16 text-nevo-near-black hover:bg-nevo-near-black/[0.03]",
                              )}
                            >
                              <span
                                aria-hidden
                                className={cn(
                                  "flex size-[18px] flex-none items-center justify-center rounded-[5px]",
                                  on ? "bg-nevo-navy text-nevo-cream" : "border-[1.5px] border-nevo-near-black/28",
                                )}
                              >
                                {on ? <CheckIcon size={11} /> : null}
                              </span>
                              {s.displayName}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                  {assigns.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => setAssigns((rows) => rows.filter((o) => o.key !== a.key))}
                      className="mt-2.5 cursor-pointer text-[12.5px] font-semibold text-nevo-navy hover:underline"
                    >
                      Remove this class
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={addAssign}
            className="mt-3 inline-flex cursor-pointer items-center gap-1.5 text-[13.5px] font-semibold text-nevo-navy hover:underline"
          >
            <span aria-hidden>+</span>
            Add another class
          </button>
        </fieldset>

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
