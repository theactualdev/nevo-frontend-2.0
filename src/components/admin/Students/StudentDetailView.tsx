"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { classesApi, type AdminClass } from "@/lib/api/classes";
import {
  studentsApi,
  type AdminStudentDetail,
  type ParentLink,
} from "@/lib/api/students";
import { yearGroupLabel } from "@/lib/constants/yearGroups";
import { cn } from "@/lib/utils";
import { ReadFailed } from "../ReadFailed";
import {
  ConsentPill,
  consentDetailLine,
  mayRequestConsent,
} from "./ConsentPill";
import {
  consentRequestLine,
  useConsentRequests,
} from "./useConsentRequests";
import { erasable, statusLabel, studentStatus, wasHere } from "./status";
import {
  Avatar,
  CARD,
  GHOST_BTN,
  Modal,
  PausedNote,
  PRIMARY_BTN,
  ROW_DIVIDER,
  Spinner,
  TEXT_ACTION,
} from "../Roster/primitives";
import { useSetupGate } from "@/hooks";
import { AddGuardianForm } from "./AddGuardianForm";
import { EraseRecordModal } from "./EraseRecordModal";
import { IssuePinSheet } from "./IssuePinSheet";
import { MoveStudentSheet } from "./MoveStudentSheet";
import { NoAccess, failureKind } from "../NoAccess";
import { WriteFailed } from "../WriteFailed";

/**
 * D7b Student detail - the admin-scoped record for one student.
 *
 * The spec's test for this page is a good one: A SENCO SHOULD BE ABLE TO SHOW
 * IT TO A PARENT WITHOUT EMBARRASSMENT. It holds enrolment, class, guardians
 * and the two administrative actions, and it holds no learning detail at all.
 * The boundary line at the foot of the enrolment card says so in plain words
 * and stays visible rather than hiding in a tooltip - it is a trust feature.
 *
 * REMOVAL IS TWO STEPS IN TWO SITTINGS. Deactivation is the only action
 * available on an active student; erasing appears only once they are already
 * deactivated, and is gated on the typed name. Nothing goes from live to
 * erased in a single pass.
 *
 * TODO(api): BUILT, and this marker outlived it. `StudentDetailResponse.consent` is a
 * REQUIRED `{status, actorId, actorName, timestamp, channel}` - all four
 * things it says are missing - and the card is rendered in this very file
 * (the `Consent` section, with `ConsentPill` and `consentDetailLine`).
 * Formerly: "the CONSENT card is not built." `GET /api/v1/students/{id}`
 * carries no consent state, no giver, no date and no channel, and
 * `parent-links` carries `accountCreated`, which answers a different
 * question. The card is a record a school may have to stand behind, so it is
 * absent rather than assembled from the nearest-looking fields. This also
 * removes the header's consent pill and the "View record" link.
 *
 * TODO(api): three enrolment fields the frame draws have no source - the
 * ENROLLED date, the "Added by" line (hand-enrolled vs roster sync), and the
 * per-guardian relationship, "Primary contact" flag and last-active line.
 */

type Phase = "loading" | "ready" | "failed" | "denied";

export function StudentDetailView({ studentId }: { studentId: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [student, setStudent] = useState<AdminStudentDetail | null>(null);
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [guardians, setGuardians] = useState<ParentLink[]>([]);
  const [guardiansFailed, setGuardiansFailed] = useState(false);
  const { stateFor: consentStateFor, send: sendConsent } = useConsentRequests();
  const [moving, setMoving] = useState(false);
  /** D24 / D01b: every change to a student pauses while setup is unfinished. */
  const { writesPaused } = useSetupGate();
  const [issuingPin, setIssuingPin] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [working, setWorking] = useState(false);
  /** The deactivate was refused. Hold the dialog and say so. */
  const [deactivateFailed, setDeactivateFailed] = useState(false);
  /** A restore was refused - said, not swallowed. */
  const [restoreFailed, setRestoreFailed] = useState(false);
  /** The add-a-guardian form is open. */
  const [addingGuardian, setAddingGuardian] = useState(false);
  /** What the request just sent to a new guardian said about delivery. */
  const [guardianAdded, setGuardianAdded] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([studentsApi.get(studentId), classesApi.list(true)])
      .then(([s, cls]) => {
        setStudent(s);
        setClasses(cls);
        setPhase("ready");
        // Guardians are their own card and their own failure - a roster record
        // is still worth showing when the parent list does not answer. And a
        // FAILED read is not a child with no guardian on record: this screen
        // exists to be shown to a parent, and the card below states real
        // absences in almost the same shape.
        setGuardiansFailed(false);
        studentsApi
          .parentLinks(studentId)
          .then((links) => {
            setGuardians(links);
            setGuardiansFailed(false);
          })
          .catch(() => {
            setGuardians([]);
            setGuardiansFailed(true);
          });
      })
      .catch((err: unknown) => setPhase(failureKind(err)));
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  if (phase === "loading") {
    return (
      <Wrapper>
        <div className={cn(CARD, "h-[420px] animate-pulse")} />
      </Wrapper>
    );
  }

  if (phase === "denied") {
    return (
      <Wrapper>
        <NoAccess what="this student" />
      </Wrapper>
    );
  }

  if (phase === "failed" || !student) {
    return (
      <Wrapper>
        <div className={cn(CARD, "px-[26px] py-7")}>
          <h3 className="text-[17px] font-semibold text-nevo-near-black">
            We couldn&rsquo;t load this student
          </h3>
          <p className="mt-2 max-w-[52ch] text-sm leading-[1.55] text-nevo-near-black/62">
            Nothing has changed - this is only about showing you the record. Try
            again in a moment.
          </p>
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={() => {
                setPhase("loading");
                load();
              }}
              className={PRIMARY_BTN}
            >
              Try again
            </button>
            <Link href="/admin/students" className={GHOST_BTN}>
              Back to students
            </Link>
          </div>
        </div>
      </Wrapper>
    );
  }

  const name =
    [student.firstName, student.lastName].filter(Boolean).join(" ").trim() ||
    student.loginIdentifier ||
    "This student";
  const firstName = student.firstName ?? name.split(" ")[0];
  const consentState = consentStateFor(studentId);
  const consentLine = consentRequestLine(consentState, firstName);
  /*
   * THREE states, not two. `UserStatus` is `active | invited | deactivated`,
   * and this read `!== "active"` - so an INVITED child, who has never signed
   * in, was shown the deactivated screen: described in the past tense, and
   * offered the deactivated-only actions, which include the permanent
   * `DELETE /api/v1/students/{id}`.
   */
  const status = studentStatus(student.status);
  const deactivated = status === "deactivated";
  const invited = status === "invited";
  const canErase = erasable(student);
  const currentClass = classes.find((c) => student.classIds.includes(c.id)) ?? null;

  return (
    <Wrapper>
      <Link
        href="/admin/students"
        className="text-[13.5px] font-semibold text-nevo-navy hover:opacity-75"
      >
        &larr; All students
      </Link>

      <div className="mt-3 flex items-center gap-4">
        <Avatar name={name} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="m-0 text-[26px] font-semibold tracking-[-0.018em] text-nevo-near-black max-lg:text-[22px]">
              {name}
            </h2>
            {deactivated ? (
              <span className="inline-flex items-center rounded-full bg-nevo-near-black/[0.07] px-[11px] py-1 text-[11.5px] font-semibold text-nevo-near-black/60">
                Deactivated
              </span>
            ) : null}
            {/* The consent state at the top, where the frame puts it. It was
                readable only by scrolling to the card further down - on the
                record whose header is the one thing an admin reads before
                deciding anything about this child. */}
            {student.consent ? <ConsentPill consent={student.consent} /> : null}
          </div>
          <div className="mt-[3px] truncate text-[14.5px] text-nevo-near-black/62">
            {currentClass
              ? `${wasHere(student.status) ? "Was in " : ""}${currentClass.name}`
              : "No class"}
          </div>
        </div>
      </div>

      <SectionLabel>Enrolment</SectionLabel>
      <div className={cn(CARD, "mt-2.5 px-6 py-[22px]")}>
        <dl className="m-0 grid grid-cols-2 gap-x-10 gap-y-[22px] max-lg:grid-cols-1">
          <Field
            label="Class"
            value={
              currentClass
                ? [
                    currentClass.name,
                    currentClass.subjects.length > 0
                      ? currentClass.subjects.join(", ")
                      : yearGroupLabel(currentClass.yearGroup),
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "Not in a class"
            }
          />
          <Field label="Username" value={student.loginIdentifier ?? "Not set"} />
          <Field
            label="Status"
            value={
              <span className="inline-flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-2 flex-none rounded-full",
                    deactivated ? "bg-nevo-near-black/35" : "bg-nevo-navy",
                  )}
                />
                {statusLabel(student.status)}
              </span>
            }
          />
          <Field label="Age band" value={student.ageBand ?? "Not set"} />
        </dl>

        <div className="mt-[22px] border-t border-nevo-near-black/8 pt-4">
          <p className="m-0 flex items-start gap-2 text-[13px] leading-[1.55] text-nevo-near-black/60">
            <LockGlyph />
            <span>
              How {firstName} {wasHere(student.status) ? "was" : "is"} getting on
              isn&rsquo;t shown here. That belongs to their teachers, and to
              Learning Support where a teacher has shared it.
            </span>
          </p>
        </div>
      </div>

      {/* D07b's consent card. The actor and date are the point: SCRUM-40 wants
          "Mrs. Eze withdrew consent on 14 July" rather than a bare state, and a
          withdrawal must be legible as a withdrawal rather than as an absence. */}
      <SectionLabel>Consent</SectionLabel>
      <div className={cn(CARD, "mt-2.5 px-6 py-[22px]")}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            {/* NAMING A CHILD AS BLOCKED IS THE WORST PLACE TO GET THIS
                WRONG, and this said "{name} can't begin lessons yet" for every
                state but `confirmed`. Per SCRUM-80 only a withdrawal stops a
                child; the rest describe the school's record, not the learner.
                See `withoutRecordedConsent`. */}
            <p className="m-0 text-[15px] font-semibold text-nevo-near-black">
              {student.consent?.status === "confirmed"
                ? `Consent is recorded for ${firstName}`
                : student.consent?.status === "withdrawn"
                  ? `A parent has withdrawn consent for ${firstName}`
                  : `No consent is recorded for ${firstName} yet`}
            </p>
            {student.consent?.status === "withdrawn" ? (
              /*
               * WHAT WITHDRAWN ACTUALLY MEANS, which this card never said.
               *
               * It named the fact and stopped. Since 15 September the backend
               * enforces withdrawal on the four processing endpoints with a
               * 403 `consent_withdrawn`, so the child genuinely cannot start a
               * lesson - and this is the screen an admin opens when a parent
               * rings to ask why. Saying only "a parent has withdrawn consent"
               * leaves them with no answer and no route.
               *
               * It states the three things the reader needs: that access is
               * paused, that nothing of the child's is lost, and that only the
               * parent can lift it - because SCRUM-80 makes withdrawal the
               * parent's decision and nothing in this console may override it.
               */
              <p className="m-0 mt-1.5 max-w-[62ch] text-[13.5px] leading-[1.55] text-nevo-near-black/70">
                {firstName}&rsquo;s lessons are paused while this stands, and
                everything they have done is kept. Only the parent who
                withdrew can restore it &ndash; there is nothing to change
                here.
              </p>
            ) : null}
            {student.consent ? (
              (() => {
                const line = consentDetailLine(student.consent);
                return line ? (
                  <p className="m-0 mt-1.5 text-[13.5px] leading-[1.55] text-nevo-near-black/62">
                    {line}
                  </p>
                ) : (
                  <p className="m-0 mt-1.5 text-[13.5px] leading-[1.55] text-nevo-near-black/62">
                    Nevo does not hold a confirmation from a parent yet.
                  </p>
                );
              })()
            ) : null}
          </div>
          <ConsentPill consent={student.consent} />
        </div>

        {/*
          * D07b's card action, and the reason this whole surface existed on
          * paper only: `consentsApi.requestParentConsent` was typed with no
          * caller anywhere, so nothing in Nevo could send a family the link -
          * and the finished parent console had no way to be reached.
          *
          * Offered only where consent is not already confirmed. The frame's
          * own words for the two cases, and it never claims delivery it has
          * not been told about - the receipt's `deliveryStatus` decides.
          */}
        {mayRequestConsent(student.consent) ? (
          <div className="mt-4 border-t border-nevo-near-black/8 pt-4">
            <button
              type="button"
              onClick={() => sendConsent(student.id)}
              disabled={consentState.kind === "sending"}
              className="cursor-pointer text-[13.5px] font-semibold text-nevo-navy transition-opacity hover:opacity-75 disabled:cursor-wait disabled:opacity-55"
            >
              {consentState.kind === "sending"
                ? "Sending…"
                : student.consent?.status === "pending"
                  ? "Send a gentle reminder"
                  : "Send the consent request"}
            </button>
            {consentLine ? (
              <p
                role="status"
                className="m-0 mt-2 max-w-[54ch] text-[13.5px] leading-[1.55] text-nevo-near-black/62"
              >
                {consentLine}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <SectionLabel>Parent / guardian accounts</SectionLabel>
      {guardianAdded ? (
        <p
          role="status"
          className="m-0 mt-2 max-w-[60ch] text-[13.5px] leading-[1.55] text-nevo-navy"
        >
          {guardianAdded}
        </p>
      ) : null}
      <div className={cn(CARD, "mt-2.5")}>
        {guardiansFailed ? (
          <ReadFailed
            className="px-6 py-[22px]"
            what={`${firstName}’s guardians`}
            onRetry={load}
          />
        ) : guardians.length === 0 ? (
          /*
           * WAS A DEAD END: "No guardian on the record. A parent account is
           * created automatically once a guardian confirms consent." - with
           * nothing to press. Consent is a gate, so a child with nobody on
           * record could never start. See `AddGuardianForm`.
           */
          <div className="px-6 py-[22px]">
            <p className="m-0 text-[15px] font-semibold text-nevo-near-black">
              No guardian on the record
            </p>
            <p className="m-0 mt-1.5 max-w-[56ch] text-[13.5px] leading-[1.55] text-nevo-near-black/62">
              {firstName} can&rsquo;t start until a parent or guardian gives
              permission. Add one and we&rsquo;ll send them the request.
            </p>
            {addingGuardian ? (
              <div className="mt-4">
                <AddGuardianForm
                  studentId={student.id}
                  studentFirstName={firstName}
                  onCancel={() => setAddingGuardian(false)}
                  onAdded={(receipt, name) => {
                    setAddingGuardian(false);
                    setGuardianAdded(
                      consentRequestLine(
                        { kind: "done", parentName: name, delivery: receipt.deliveryStatus },
                        firstName,
                      ),
                    );
                    load();
                  }}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingGuardian(true)}
                disabled={writesPaused}
                className={cn(TEXT_ACTION, "mt-3")}
              >
                Add a parent or guardian
              </button>
            )}
          </div>
        ) : (
          guardians.map((g, i) => (
            <div
              key={g.id}
              className={cn(
                "flex items-center gap-3.5 px-6 py-[18px]",
                i < guardians.length - 1 && ROW_DIVIDER,
              )}
            >
              <Avatar name={g.parentName} size={44} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-semibold text-nevo-near-black">
                  {g.parentName}
                </div>
                <div className="truncate text-[13.5px] text-nevo-near-black/62">
                  {g.parentContact}
                </div>
              </div>
              <span
                className={cn(
                  "inline-flex flex-none items-center gap-2 rounded-full px-3 py-1 text-[12.5px] font-semibold",
                  g.accountCreated
                    ? "bg-nevo-navy/12 text-nevo-navy"
                    : "bg-nevo-near-black/[0.07] text-nevo-near-black/60",
                )}
              >
                {g.accountCreated ? (
                  <span aria-hidden="true" className="size-[7px] rounded-full bg-nevo-navy" />
                ) : null}
                {g.accountCreated ? "Account active" : "No account yet"}
              </span>
            </div>
          ))
        )}
      </div>

      {/* THE ACTIONS FOOT. Deactivate is the only action on an active student;
          erase only appears once they are already deactivated. */}
      <div className="mt-8 border-t border-nevo-near-black/10 pt-5">
        <PausedNote className="mb-4" />
        {deactivated ? (
          <>
            <button
              type="button"
              disabled={working || writesPaused}
              onClick={() => {
                setWorking(true);
                setRestoreFailed(false);
                studentsApi
                  .restore(student.id)
                  .then(load)
                  // Was `.catch(() => undefined)`: a refused restore left the
                  // page byte-identical, so it read as a dead button. The
                  // class page's restore was fixed the same way.
                  .catch(() => setRestoreFailed(true))
                  .finally(() => setWorking(false));
              }}
              className={TEXT_ACTION}
            >
              Restore this student
            </button>
            {restoreFailed ? (
              <WriteFailed className="mt-2" what={`restore ${firstName}`} />
            ) : null}
            <p className="mt-1.5 max-w-[520px] text-[13px] leading-[1.5] text-nevo-near-black/55">
              They pick up exactly where they left off, in the same class unless
              you move them.
            </p>

            {/* The erase modal's only safeguard is typing the student's name
                back, and that name falls back to the constant "This student"
                on a record with no name and no login identifier. A fence that
                is the same string for every child in the school is not a
                fence, so a record we cannot name is not erasable from here. */}
            {canErase ? (
              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => setErasing(true)}
                  disabled={writesPaused}
                  className={TEXT_ACTION}
                >
                  Erase this record permanently
                </button>
                <p className="mt-1.5 max-w-[520px] text-[13px] leading-[1.5] text-nevo-near-black/55">
                  Only possible now they&rsquo;re deactivated. This one
                  can&rsquo;t be undone.
                </p>
              </div>
            ) : (
              <div className="mt-6">
                <p className="max-w-[520px] text-[13px] leading-[1.5] text-nevo-near-black/55">
                  This record can&rsquo;t be erased here: it has no name or
                  login on it, so there is nothing to confirm against.
                </p>
              </div>
            )}
          </>
        ) : invited ? (
          /* An invited child has nothing to deactivate and nothing to erase -
             they have never been here. Saying so beats offering an action
             that does not apply to them. */
          <p className="max-w-[520px] text-[13px] leading-[1.5] text-nevo-near-black/55">
            {firstName} hasn&rsquo;t joined yet, so there&rsquo;s nothing to
            deactivate. Their invitation is still open.
          </p>
        ) : (
          <div className="flex flex-wrap gap-8">
            <div>
              <button
                type="button"
                onClick={() => setMoving(true)}
                disabled={writesPaused}
                className={TEXT_ACTION}
              >
                Move to another class
              </button>
              <p className="mt-1.5 max-w-[420px] text-[13px] leading-[1.5] text-nevo-near-black/55">
                Nothing about their learning changes.
              </p>
            </div>
            {/*
              * THE OTHER END OF "ASK YOUR TEACHER". The child's Forgot-PIN
              * screen is informational by design and sends them to an adult;
              * until now no adult in any console had a control to press, and
              * `pin_reset_requested` notifications arrived nowhere. Active
              * students only: an invited child has not joined, and a
              * deactivated one cannot sign in whatever PIN they hold.
              */}
            <div>
              <button
                type="button"
                onClick={() => setIssuingPin(true)}
                disabled={writesPaused}
                className={TEXT_ACTION}
              >
                Give {firstName} a new PIN
              </button>
              <p className="mt-1.5 max-w-[420px] text-[13px] leading-[1.5] text-nevo-near-black/55">
                For when they can&rsquo;t get in. You hand it over in person.
              </p>
            </div>
            <div>
              <button
                type="button"
                onClick={() => setConfirmDeactivate(true)}
                disabled={writesPaused}
                className={TEXT_ACTION}
              >
                Remove {firstName} from the school
              </button>
              <p className="mt-1.5 max-w-[420px] text-[13px] leading-[1.5] text-nevo-near-black/55">
                Everything they have built is kept, and you can bring them back.
              </p>
            </div>
          </div>
        )}
      </div>

      {moving ? (
        <MoveStudentSheet
          studentId={student.id}
          studentName={name}
          currentClass={currentClass}
          classes={classes}
          onClose={() => setMoving(false)}
          onMoved={() => {
            setMoving(false);
            load();
          }}
        />
      ) : null}

      {/*
        * NO `load()` ON CLOSE, unlike the sheets around it. A new PIN changes
        * nothing this screen renders, and a reload here would replace the
        * record underneath an admin who is still copying the number down.
        */}
      {issuingPin ? (
        <IssuePinSheet
          studentId={student.id}
          studentName={name}
          onClose={() => setIssuingPin(false)}
        />
      ) : null}

      {confirmDeactivate ? (
        <Modal
          busy={working}
          title={`Remove ${firstName} from the school`}
          subtitle={name}
          onClose={() => {
            setConfirmDeactivate(false);
            setDeactivateFailed(false);
          }}
          footer={
            working ? (
              <div className="flex flex-1 items-center justify-center gap-2.5 py-3">
                <Spinner />
                <span className="text-sm text-nevo-near-black/60">Deactivating…</span>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setWorking(true);
                    setDeactivateFailed(false);
                    studentsApi
                      .deactivate(student.id)
                      .then(() => {
                        setConfirmDeactivate(false);
                        // The one exit that did not clear this. A later read
                        // showing the student still active reopens the dialog,
                        // and a stale banner would then say the removal failed
                        // about one that succeeded.
                        setDeactivateFailed(false);
                        load();
                      })
                      // Swallowed entirely. The dialog returned to rest under
                      // the words "their seat frees up", having freed nothing.
                      .catch(() => setDeactivateFailed(true))
                      .finally(() => setWorking(false));
                  }}
                  className={cn(PRIMARY_BTN, "flex-1 justify-center")}
                >
                  Deactivate {firstName}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmDeactivate(false);
                    setDeactivateFailed(false);
                  }}
                  className={GHOST_BTN}
                >
                  Keep them active
                </button>
              </>
            )
          }
        >
          <p className="m-0 text-[14.5px] leading-[1.6] text-nevo-near-black/72">
            {firstName} will stop having access, and their seat frees up.
            Everything they have built is kept, and you can bring them back
            whenever you need to.
          </p>
          {deactivateFailed ? (
            <WriteFailed
              className="mt-4"
              what={`remove ${firstName} from the school`}
            />
          ) : null}
        </Modal>
      ) : null}

      {erasing ? (
        <EraseRecordModal
          studentId={student.id}
          studentName={name}
          onClose={() => setErasing(false)}
          /* THE ERASURE SAID NOTHING. Permanently deleting a child's record
             returned to the roster in silence, so the one irreversible action
             on this screen was also the only one that never confirmed it had
             happened. The roster reads this and renders a single plain line. */
          onErased={() =>
            router.push(
              `/admin/students?erased=${encodeURIComponent(firstName)}`,
            )
          }
        />
      ) : null}
    </Wrapper>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[780px]">{children}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-0 mt-7 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-nevo-near-black/45">
      {children}
    </h3>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.03em] text-nevo-near-black/42">
        {label}
      </dt>
      <dd className="m-0 mt-1 text-[15px] font-medium text-nevo-near-black">{value}</dd>
    </div>
  );
}

function LockGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="mt-[3px] flex-none text-nevo-violet/90"
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
