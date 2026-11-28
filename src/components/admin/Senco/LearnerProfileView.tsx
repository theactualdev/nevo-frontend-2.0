"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useStillHere } from "@/hooks/useStillHere";
import {
  classesApi,
  type AdminClass,
  type LearnerObservation,
} from "@/lib/api/classes";
import {
  DECLARED_OBSERVATION_WINDOW_DAYS,
  OBSERVATION_COPY,
  observationCountWithin,
} from "@/lib/constants/observations";
import {
  conversationEvidenceApi,
  studentsApi,
  type Accommodations,
  type AdminStudentDetail,
  type ConceptLevels,
  type ConversationEvidence,
  type StudentAdaptation,
} from "@/lib/api/students";
import { helpSeekingLine } from "@/hooks/useStudentProfile";
import { helpTopics, helpTopicsLead } from "./helpTopics";
import { yearGroupLabel } from "@/lib/constants/yearGroups";
import { cn } from "@/lib/utils";
import { accommodationCopy } from "@/lib/constants/accommodations";
import { HISTORY_WEEKS } from "@/lib/api/accommodationHistory";
import { changeRows, useAccommodationHistory, weekBars } from "./useAccommodationHistory";
import {
  CARD,
  GHOST_BTN,
  PRIMARY_BTN,
  ROW_DIVIDER,
} from "../Roster/primitives";
import { NoAccess, failureKind } from "../NoAccess";
import { BackLink } from "../BackLink";
import { withBack, type Back } from "../back";
import { ApiError, apiErrorCode } from "@/lib/api/client";
import { LEARNING_SUPPORT_REQUIRED } from "@/lib/api/learningSupport";
import { useLearningSupport } from "../LearningSupport/useLearningSupport";
import { NEEDS_LEARNING_SUPPORT, UnavailableAction } from "../LearningSupport/Unavailable";
import { SafeguardingRecord } from "../Safeguarding/SafeguardingRecord";
import { ChildAvatar } from "../Roster/ChildAvatar";
import { MasteryByLevel } from "@/components/teacher/Student/MasteryByLevel";
import type { AvatarLook } from "@/lib/profile/avatarLook";
import { lookOfChild } from "@/lib/profile/rosterLook";

/**
 * D8b Learner Profile - the SENCo's plain-language view of one learner.
 *
 * "Everything reads in human terms: no clinical labels, no confidence scores,
 * no raw signal talk." That sentence governs every decision on this screen,
 * and two of them are worth spelling out:
 *
 * 1. CONCEPT MASTERY IS A STATE PER CURRICULUM LEVEL, NEVER A NUMBER (the By
 *    Level design, "Nevo Mastery By Level", 928cf30; S21's read, live 27
 *    Nov). The dual-track bars it replaced were a numbered bar in everything
 *    but the number; a percentage beside a child's name is a confidence
 *    score, which this screen explicitly does not show. The same shared
 *    component as the teacher's profile (C08), so the two cannot drift.
 *
 * 2. ACCOMMODATIONS ARE A RECORD OF WHAT NEVO IS DOING, NOT A LABEL ABOUT THE
 *    CHILD. The frame is emphatic and the copy says so on screen. `source` and
 *    `persistedAsLabel` are typed and unrendered; a `true` on the latter would
 *    contradict what D22 Compliance promises school-wide, and would be a bug
 *    to report rather than a thing to display.
 *
 * Zero-Tag holds throughout: engine parameters are never rendered here, the
 * same as on every teacher surface.
 *
 * TODO(api): "Export Profile as PDF" has no endpoint - there is no PDF route
 * on any intelligence or student read - so the action is absent rather than a
 * button that fails. The IEP exporter is the supported way to get something
 * shareable out of this data, and this screen links to it.
 *
 * ENGAGEMENT PATTERNS HAS A SOURCE, AND THIS SAID IT HAD NONE. It read
 * "D8b's ENGAGEMENT PATTERNS section has no dedicated source". There is no
 * per-STUDENT route, which is what made that easy to believe, but
 * `ClassStudentResponse.observations` on `GET /api/v1/classes/{id}/students`
 * is `{pattern, count}` over a closed five-value enum (completed_lessons,
 * revisited_content, steadier_pace, tried_another_format, no_recent_pattern).
 * It is typed as `LearnerObservation` in `lib/api/classes.ts` and ClassDetail
 * already reads it. This screen resolves the learner's class below, so the row
 * is one `classesApi.classStudents(cls.id)` away.
 *
 * BUILT NOW, from that call. The five patterns are phrased once, in
 * `lib/constants/observations.ts`, where the Zero-Tag reasoning for each
 * sits beside it - these say what HAPPENED and must never harden into a trait.
 *
 * `frontendSignals` stays as the fallback, because it is a different thing: a
 * list of signal NAMES off the accommodations read, which is all this section
 * had before. It shows when the roster read gives us nothing, and it is
 * labelled as the weaker source rather than mixed in with the observations as
 * though they were the same kind of statement.
 */

type Phase = "loading" | "ready" | "failed" | "denied";

/** Readable names for the accommodation and signal enums. */
function humanise(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * What a section shows when its OWN read did not answer.
 *
 * The wording matters: it has to say the absence is unknown rather than
 * established, because the sections around it state real absences in almost
 * the same shape, and a SENCo reading this is deciding what goes into an IEP.
 */
function ReadFailed({
  firstName,
  what,
  onRetry,
  denied = false,
  needsLearningSupport = false,
}: {
  firstName: string;
  what: string;
  onRetry: () => void;
  /**
   * Refused for want of Learning Support (SCRUM-247), so the way to it is
   * named: the role is given on a person's record, not by "whoever manages
   * permissions" in general, and never by the person themselves.
   */
  needsLearningSupport?: boolean;
  /**
   * The read was REFUSED (403), not lost. No retry: a refused scope is not
   * granted by asking again, and "we couldn't read" blamed the system for a
   * permission decision - the rule #685 applied to the rest of the console.
   */
  denied?: boolean;
}) {
  if (denied) {
    return (
      <p className="m-0 text-sm leading-[1.55] text-nevo-near-black/62">
        You don&rsquo;t have access to {firstName}&rsquo;s {what}.{" "}
        {needsLearningSupport
          ? NEEDS_LEARNING_SUPPORT
          : "Whoever manages permissions for your school can change that."}
      </p>
    );
  }
  return (
    <div className="m-0 text-sm text-nevo-near-black/62">
      <p className="m-0">
        We couldn&rsquo;t read {firstName}&rsquo;s {what}{" "}just now, so
        there&rsquo;s nothing to show here yet &ndash; this is not a record that
        it&rsquo;s empty.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2.5 cursor-pointer text-[13.5px] font-semibold text-nevo-navy"
      >
        Try again
      </button>
    </div>
  );
}

export function LearnerProfileView({
  studentId,
  back = null,
}: {
  studentId: string;
  /** Where the admin came from - see `back.ts`. */
  back?: Back | null;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [student, setStudent] = useState<AdminStudentDetail | null>(null);
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [accommodations, setAccommodations] = useState<Accommodations | null>(
    null,
  );
  const [mastery, setMastery] = useState<ConceptLevels[]>([]);
  /*
   * A 403 or a 404 on the mastery read (Hub, 28 Nov): no retry would land -
   * the viewer may not read it, or the child is out of reach - so the
   * section is ABSENT, with no line. Only a read that failed says so.
   */
  const [masteryAbsent, setMasteryAbsent] = useState(false);
  const [adaptations, setAdaptations] = useState<StudentAdaptation[]>([]);
  /*
   * IN FLIGHT IS NOT THE SAME AS ANSWERED. The roster read starts only once
   * the learner's class is known, so this is its own three-state rather than
   * an array that is empty for both "not asked yet" and "nothing to report".
   */
  const [observations, setObservations] = useState<LearnerObservation[] | null>(
    null,
  );
  /** The child's look, from the same class roster read (see `ChildAvatar`). */
  const [look, setLook] = useState<AvatarLook | null>(null);
  /*
   * "refused" is the server's 403 (`class_students_forbidden`, S14, 25 Nov):
   * this viewer may not read class rosters at all - an admin with neither
   * roster nor SENCO access nor a Learning Support grant. No retry can change
   * that, so it is not said as a failure; see `noticedLeftOut`.
   */
  const [observationsPhase, setObservationsPhase] = useState<
    "idle" | "ready" | "failed" | "refused"
  >("idle");
  /*
   * A read that FAILED is not a child with nothing on their record.
   *
   * These three used to end `.catch(() => undefined)`, leaving state at its
   * initial empty value - so a 500 rendered as four signed statements that
   * Nevo is adjusting nothing, has noticed nothing, has no concepts with
   * practice behind them, and has never adapted a lesson. On the screen a
   * SENCo reads while drafting an IEP, directly above copy calling it "the
   * accommodation record for the IEP".
   *
   * The comment that used to sit here said each section owns its own failure.
   * It does now.
   */
  const [failed, setFailed] = useState({
    accommodations: false,
    mastery: false,
    adaptations: false,
  });
  /** Which of those failures were refusals (403) rather than lost reads. */
  const [denied, setDenied] = useState({
    accommodations: false,
    mastery: false,
    adaptations: false,
  });
  /** The adaptation history was refused for want of Learning Support. */
  const [roleRefused, setRoleRefused] = useState(false);
  /*
   * D08b's HELP-SEEKING (backlog 41), aggregate only - the 30 Aug ruling:
   * how often, never what, and nothing below the server's own minimum.
   */
  const [help, setHelp] = useState<ConversationEvidence | null>(null);
  const [helpPhase, setHelpPhase] = useState<"loading" | "ready" | "failed" | "denied">("loading");
  /*
   * SCRUM-247: without Learning Support, the adaptation history and the
   * progress report exporter show as UNAVAILABLE - present, switched off, and
   * saying why - rather than missing. Known before either is opened.
   */
  const { holders: ls } = useLearningSupport();
  const lacksRole = ls?.viewerHoldsIt === false;
  /** D08b's "What changed, and when" (backlog 42) - its own read, its own failure. */
  const { state: history, retry: retryHistory } = useAccommodationHistory(studentId, lacksRole);

  const mounted = useStillHere(); // A read that answers after this has gone sets nothing (check 21).

  const load = useCallback(() => {
    Promise.all([studentsApi.get(studentId), classesApi.list(true)])
      .then(([s, c]) => {
        if (!mounted.current) return;
        setStudent(s);
        setClasses(c);
        setPhase("ready");
        // A profile is still worth showing when one of the three intelligence
        // reads does not answer - but that section says so rather than
        // reporting an absence it has not established.
        setFailed({
          accommodations: false,
          mastery: false,
          adaptations: false,
        });
        setDenied({
          accommodations: false,
          mastery: false,
          adaptations: false,
        });
        setRoleRefused(false);
        setMasteryAbsent(false);
        const fail = (section: keyof typeof failed) => (err: unknown) => {
          if (!mounted.current) return;
          setFailed((f) => ({ ...f, [section]: true }));
          if (failureKind(err) === "denied") setDenied((d) => ({ ...d, [section]: true }));
          if (err instanceof ApiError && apiErrorCode(err.detail) === LEARNING_SUPPORT_REQUIRED) {
            setRoleRefused(true);
          }
        };
        studentsApi
          .accommodations(studentId)
          .then((a) => {
            if (mounted.current) setAccommodations(a);
          })
          .catch(fail("accommodations"));
        // S21's By Level read (GET /students/{id}/mastery), the teacher's
        // profile's own function: a state per level per concept, no number.
        studentsApi
          .masteryByLevel(studentId)
          .then((r) => {
            if (mounted.current) setMastery(Array.isArray(r?.concepts) ? r.concepts : []);
          })
          .catch((err: unknown) => {
            if (!mounted.current) return;
            if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
              setMasteryAbsent(true);
              return;
            }
            fail("mastery")(err);
          });
        studentsApi
          .adaptations(studentId)
          .then((a) => {
            if (mounted.current) setAdaptations(a);
          })
          .catch(fail("adaptations"));
        // A fortnight: D08b's period, and the ratified line's.
        setHelpPhase("loading");
        conversationEvidenceApi
          .forStudent(studentId, 14)
          .then((ev) => {
            if (!mounted.current) return;
            setHelp(ev);
            setHelpPhase("ready");
          })
          .catch((err: unknown) => {
            if (mounted.current) setHelpPhase(failureKind(err) === "denied" ? "denied" : "failed");
          });
      })
      .catch((err: unknown) => {
        if (mounted.current) setPhase(failureKind(err));
      });
  }, [studentId, mounted]);

  useEffect(() => {
    load();
  }, [load]);

  /*
   * The observations live on the CLASS roster, not on any per-student route,
   * so this cannot join the fan-out above: it has to wait until the learner
   * and the class list have both arrived and the class is known.
   *
   * A learner with no class is not a failure and not an empty result - it is a
   * question we cannot ask. `observationsPhase` stays "idle" and the section
   * falls back rather than reporting that Nevo has noticed nothing.
   */
  const rosterClassId = student
    ? (classes.find((c) => student.classIds.includes(c.id))?.id ?? null)
    : null;

  useEffect(() => {
    if (!rosterClassId) return;
    let live = true;
    classesApi
      .classStudents(rosterClassId)
      .then((rows) => {
        if (!live) return;
        const mine = rows.find((r) => r.studentId === studentId);
        setObservations(mine?.observations ?? []);
        setLook(mine ? lookOfChild(mine) : null);
        setObservationsPhase("ready");
      })
      .catch((err: unknown) => {
        if (live) setObservationsPhase(failureKind(err) === "denied" ? "refused" : "failed");
      });
    return () => {
      live = false;
    };
  }, [rosterClassId, studentId]);

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
        <NoAccess what="this learner’s profile" />
      </Wrapper>
    );
  }

  if (phase === "failed" || !student) {
    return (
      <Wrapper>
        <div className={cn(CARD, "px-[26px] py-7")}>
          <h3 className="text-[17px] font-semibold text-nevo-near-black">
            We couldn&rsquo;t load this profile
          </h3>
          <p className="mt-2 max-w-[52ch] text-sm leading-[1.55] text-nevo-near-black/62">
            Nothing has changed - this is only about showing it to you. Try
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
            <Link href="/admin/senco" className={GHOST_BTN}>
              Back to profiles
            </Link>
          </div>
        </div>
      </Wrapper>
    );
  }

  const name =
    [student.firstName, student.lastName].filter(Boolean).join(" ").trim() ||
    student.loginIdentifier ||
    "This learner";
  const firstName = student.firstName ?? name.split(" ")[0];
  const cls = classes.find((c) => student.classIds.includes(c.id));
  /*
   * Derived, not stored: setting a "loading" phase inside the effect that
   * starts the fetch is a synchronous setState in an effect. A learner in a
   * class whose roster read has not answered yet is exactly `idle`.
   */
  const observationsLoading =
    Boolean(rosterClassId) && observationsPhase === "idle";
  const active = accommodations?.activeAccommodations ?? [];
  const signals = accommodations?.frontendSignals ?? [];
  /*
   * REFUSED, AND NOTHING ELSE TO SAY: the section is left out (Hub, 25 Nov).
   * "Nothing consistent enough to describe yet" would answer a question this
   * viewer was never allowed to ask, and "couldn't read the class roster just
   * now" offers a wait that ends nowhere. The accommodation record's signals,
   * or its own failure, still draw the section as before.
   */
  const noticedLeftOut =
    observationsPhase === "refused" && !failed.accommodations && signals.length === 0;

  return (
    <Wrapper>
      <BackLink back={back} fallback={{ href: "/admin/senco", label: "Learning Support" }} />

      <div className="mt-3 flex items-center gap-4">
        <ChildAvatar look={look} size={56} />
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-[26px] font-semibold tracking-[-0.018em] text-nevo-near-black">
            {name}
          </h2>
          <div className="mt-[3px] truncate text-[14.5px] text-nevo-near-black/62">
            {cls
              ? [cls.name, yearGroupLabel(cls.yearGroup)]
                  .filter(Boolean)
                  .join(" · ")
              : "No class"}
          </div>
        </div>
      </div>

      {/* D08b (96cd4b4): a Learning Support holder's dated safeguarding
          line, when there is one - above the profile's own sections. */}
      <SafeguardingRecord studentId={studentId} firstName={firstName} holders={ls} />

      <SectionLabel>Current accommodations</SectionLabel>
      <div className={cn(CARD, "mt-2.5 px-6 py-[22px]")}>
        {failed.accommodations ? (
          <ReadFailed
            firstName={firstName}
            what="accommodations"
            onRetry={load}
            denied={denied.accommodations}
          />
        ) : active.length === 0 ? (
          <p className="m-0 text-sm text-nevo-near-black/62">
            Nevo isn&rsquo;t adjusting anything for {firstName} at the moment.
          </p>
        ) : (
          /*
           * SENTENCES, NOT CATEGORY PILLS. These rendered as "Reading",
           * "Attention", "Numerical" beside a named child - the exact shape
           * Zero-Tag forbids. A category noun next to a learner's name is a
           * label about the learner however neutral the word looks alone:
           * "Attention" beside Amara Okafor reads as a finding about Amara.
           *
           * The subject of every sentence is Nevo. See
           * `lib/constants/accommodations.ts`, which carries the reasoning per
           * value, the same way `observations.ts` does for the roster patterns
           * on this same screen.
           */
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {active.map((a) => {
              const copy = accommodationCopy(a);
              // A value the enum gains later is skipped rather than shown as
              // its raw key - a bare enum word is the thing being fixed here.
              if (!copy) return null;
              return (
                <li
                  key={a}
                  className="flex items-start gap-2.5 text-sm leading-[1.55] text-nevo-near-black/78"
                >
                  <span
                    aria-hidden="true"
                    className="mt-[7px] size-[6px] flex-none rounded-full bg-nevo-violet"
                  />
                  {copy}
                </li>
              );
            })}
          </ul>
        )}
        <p className="m-0 mt-4 border-t border-nevo-near-black/8 pt-3.5 text-[13px] leading-[1.55] text-nevo-near-black/60">
          What Nevo is currently doing for this learner. This is the
          accommodation record for the IEP, not a learning-style label.
        </p>
      </div>

      {/*
        * HELP-SEEKING (D08b SC-01, backlog 41). The line is C08's, ratified
        * 30 Aug with design's words of 31 Aug - "Asked Nevo for help 14 times
        * this fortnight, mostly about …" - with the frame's name in front.
        * Aggregate only: never what was asked, never a question, never a time.
        *
        * WITHHELD MEANS ABSENT. Below the server's minimum it says
        * `withheld_below_minimum`, and the section is not drawn at all - not
        * "not enough yet", which would itself say something.
        *
        * D08b's RANKED TOPICS, since the server floors each topic (S10, 25
        * Nov) - see `helpTopics`. Two or more, and the line ends in the
        * frame's "most often about these topics." over the list, with its
        * "A topic appears only once {name} has asked about it enough times to
        * be worth showing." One topic is already named by the line, so no
        * list. Names only: the frame's count and bar beside each are not
        * drawn, so nothing reads as a score.
        */}
      {helpPhase === "failed" || helpPhase === "denied" ? (
        <>
          <SectionLabel>Help-seeking</SectionLabel>
          <div data-help-seeking className={cn(CARD, "mt-2.5 px-6 py-[22px]")}>
            <ReadFailed
              firstName={firstName}
              what="help-seeking"
              onRetry={load}
              denied={helpPhase === "denied"}
            />
          </div>
        </>
      ) : helpPhase === "ready" && helpSeekingLine(help) ? (
        <>
          <SectionLabel>Help-seeking</SectionLabel>
          <div data-help-seeking className={cn(CARD, "mt-2.5 px-6 py-[22px]")}>
            {(() => {
              const topics = helpTopics(help);
              const listed = topics.length > 1;
              const line = listed ? helpTopicsLead(help) : helpSeekingLine(help);
              return (
                <>
                  <p className="m-0 text-[15px] leading-[1.55] text-nevo-near-black">
                    {`${firstName} ${line.charAt(0).toLowerCase()}${line.slice(1)}`}
                  </p>
                  {listed ? (
                    <ol data-help-topics className="m-0 mt-4 flex list-none flex-col gap-[11px] p-0">
                      {topics.map((t) => (
                        <li key={t} className="text-[14px] leading-[1.45] text-nevo-near-black">
                          {t}
                        </li>
                      ))}
                    </ol>
                  ) : null}
                  <p className="m-0 mt-4 border-t border-nevo-near-black/8 pt-3.5 text-[13px] leading-[1.55] text-nevo-near-black/60">
                    {listed
                      ? `A topic appears only once ${firstName} has asked about it enough times to be worth showing. `
                      : ""}
                    {`What ${firstName} and Nevo said to each other is never shown here.`}
                  </p>
                </>
              );
            })()}
          </div>
        </>
      ) : null}

      {noticedLeftOut ? null : (
        <>
          <SectionLabel>What Nevo has noticed</SectionLabel>
          <div className={cn(CARD, "mt-2.5 px-6 py-[22px]")}>
            {observationsLoading ? (
              <div className="h-[72px] animate-pulse rounded-[10px] bg-nevo-navy/[0.05]" />
            ) : observationsPhase === "ready" &&
              observations &&
              observations.length > 0 ? (
              <ul className="m-0 flex list-none flex-col gap-4 p-0">
                {observations.map((o) => {
                  const copy = OBSERVATION_COPY[o.pattern];
                  // A pattern the enum gained since this shipped is skipped rather
                  // than rendered as its raw key - `revisited_content` on a SENCo
                  // screen reads as a judgement nobody wrote.
                  if (!copy) return null;
                  // The count only with a declared window - none yet (S22).
                  const times = observationCountWithin(
                    o.pattern,
                    o.count,
                    DECLARED_OBSERVATION_WINDOW_DAYS,
                  );
                  return (
                    <li key={o.pattern} className="flex items-start gap-2.5">
                      <span
                        aria-hidden="true"
                        className="mt-[7px] size-[6px] flex-none rounded-full bg-nevo-violet"
                      />
                      <span className="flex min-w-0 flex-col">
                        <span className="text-[12.5px] font-semibold tracking-[0.05em] text-nevo-near-black/55 uppercase">
                          {copy.title}
                        </span>
                        <span className="mt-1 text-sm leading-[1.55] text-nevo-near-black/78">
                          {copy.body(firstName)}
                        </span>
                        {times && (
                          <span className="mt-1 text-[13px] text-nevo-near-black/50">
                            {times}
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : failed.accommodations && observationsPhase !== "ready" ? (
              <ReadFailed
                firstName={firstName}
                what="signals"
                onRetry={load}
                denied={denied.accommodations}
              />
            ) : signals.length > 0 ? (
              <>
                {/* The weaker source, and labelled as one. These are signal NAMES
                    off the accommodations read, not the roster's observations. */}
                <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                  {signals.map((s) => (
                    <li
                      key={s}
                      className="flex items-start gap-2.5 text-sm leading-[1.55] text-nevo-near-black/78"
                    >
                      <span
                        aria-hidden="true"
                        className="mt-[7px] size-[6px] flex-none rounded-full bg-nevo-violet"
                      />
                      {humanise(s)}
                    </li>
                  ))}
                </ul>
                <p className="m-0 mt-3 text-[13px] text-nevo-near-black/50">
                  These are the signals on {firstName}&rsquo;s accommodation record.
                </p>
              </>
            ) : (
              <p className="m-0 text-sm text-nevo-near-black/62">
                {observationsPhase === "failed"
                  ? `We couldn't read ${firstName}'s class roster just now, so what Nevo has noticed isn't here. Nothing about their record has changed.`
                  : `Nothing consistent enough to describe yet. This fills in as ${firstName} works through more lessons.`}
              </p>
            )}
          </div>
        </>
      )}

      {/*
        * CONCEPT MASTERY, BY LEVEL (the By Level design; S21). Each concept is
        * the shared MasteryByLevel: a state per curriculum level in the
        * frame's words - a level with nothing observed as "Not checked yet"
        * (Lydia, 28 Nov, L99) - reading beside them, no flag and no number.
        *
        * The label drops the frame's "· dual-track" and the frame's lead line
        * ("Two tracks per concept…") is gone: both describe the bars this
        * replaces, so they would be untrue over it. D08b has no other line of
        * its own, so it has none (Hub, 28 Nov; with Lydia in L99).
        *
        * WITH NO CONCEPTS, NO SECTION - as C08 draws it (Hub, 28 Nov). Its
        * old line, "No concepts have enough practice behind them yet.", was
        * in neither frame (the 1 Sep D8 build) and described the probability
        * threshold the bars had: under S21 a concept appears on any evidence
        * at all. Only a read that failed draws the section empty, to say so.
        */}
      {masteryAbsent || (!failed.mastery && mastery.length === 0) ? null : (
        <>
          <SectionLabel>Concept mastery</SectionLabel>
          <div className={cn(CARD, "mt-2.5")}>
            {failed.mastery ? (
              <div className="px-6 py-6">
                <ReadFailed firstName={firstName} what="concept record" onRetry={load} />
              </div>
            ) : (
              mastery.map((c, i) => (
                <div
                  key={c.conceptId}
                  data-concept
                  className={cn("px-6 py-4", i < mastery.length - 1 && ROW_DIVIDER)}
                >
                  <MasteryByLevel
                    concept={c.conceptName}
                    levels={c.levels ?? {}}
                    reading={c.reading ?? null}
                  />
                </div>
              ))
            )}
          </div>
        </>
      )}

      <SectionLabel>Recent adaptations</SectionLabel>
      <div className={cn(CARD, "mt-2.5")}>
        {failed.adaptations || lacksRole ? (
          <div className="px-6 py-6">
            <ReadFailed
              firstName={firstName}
              what="adaptation history"
              onRetry={load}
              denied={denied.adaptations || lacksRole}
              needsLearningSupport={lacksRole || roleRefused}
            />
          </div>
        ) : adaptations.length === 0 ? (
          <p className="m-0 px-6 py-6 text-sm text-nevo-near-black/62">
            Nevo hasn&rsquo;t needed to adjust a lesson for {firstName} yet.
          </p>
        ) : (
          adaptations.slice(0, 8).map((a, i) => (
            <div
              key={a.id}
              className={cn(
                "px-6 py-4",
                i < Math.min(adaptations.length, 8) - 1 && ROW_DIVIDER,
              )}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[14.5px] font-semibold text-nevo-near-black">
                  {a.lessonTitle}
                </span>
                <span className="flex-none text-xs text-nevo-near-black/50">
                  {new Date(a.timestamp).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </div>
              <p className="m-0 mt-1.5 text-sm leading-[1.55] text-nevo-near-black/78">
                {a.adaptation}
              </p>
              {/* A withheld adaptation is as much a part of the record as an
                  applied one - the IEP should show what Nevo considered. */}
              {a.suppressed ? (
                <p className="m-0 mt-1 text-[12.5px] text-nevo-near-black/55">
                  Considered and held back this time.
                </p>
              ) : null}
            </div>
          ))
        )}
      </div>

      {/*
        * WHAT CHANGED, AND WHEN (D08b SC-04, admin backlog 42), from
        * `GET /students/{id}/accommodation-history`. Below the current state,
        * as the frame places it: a dated list, never a line over time.
        *
        * NEVER THE SERIES. The same response carries cognitiveLoadThreshold
        * and processingSpeed over time with a confidence on each point -
        * engine parameters about a child (Zero-Tag, 30 Aug). They are not
        * even typed (`accommodationHistory.ts`).
        *
        * BUILT REDUCED, and raised (24 Nov):
        * - D08b's "and what prompted each" is not said, and no row has a
        *   reason: `promptedBy` is an internal signal code, not a cause.
        * - Each change is the backend's own two words, Started / Stopped,
        *   beside the console's Zero-Tag sentence for what Nevo does - the
        *   frame's past-tense phrases ("Larger text applied") name specific
        *   adaptations the contract does not carry.
        * - Each bar sits in its own week of the window; a week the server
        *   left out (it sends no zeros) is an empty slot, never a 0. S15 asks
        *   for every week with explicit zeros (`weekBars`).
        * - The empty line is the Hub's interim words until Lydia's (L82),
        *   in the backend's own two action words. It is said only when the
        *   server sent no change at all - never when it sent changes this
        *   console has no words for, which would be untrue.
        */}
      <SectionLabel>What changed, and when</SectionLabel>
      <p className="m-0 mt-2.5 max-w-[580px] text-[13px] leading-[1.6] text-nevo-near-black/60">
        {`A dated record of what Nevo did for ${firstName}. Not a rising line: a list of changes.`}
      </p>
      {lacksRole || history.phase === "failed" ? (
        <div data-what-changed className={cn(CARD, "mt-3.5 px-6 py-6")}>
          <ReadFailed
            firstName={firstName}
            what="record of changes"
            onRetry={retryHistory}
            denied={lacksRole || (history.phase === "failed" && history.denied)}
            needsLearningSupport={
              lacksRole || (history.phase === "failed" && history.needsLearningSupport)
            }
          />
        </div>
      ) : history.phase === "loading" ? (
        <div
          data-what-changed
          aria-busy="true"
          className="mt-3.5 h-[150px] animate-pulse rounded-[12px] bg-nevo-cream-elevated"
        />
      ) : (
        <div data-what-changed>
          {(() => {
            const bars = weekBars(history.history, history.readAt);
            return bars.some((b) => b.count !== null) ? (
              <div className="mt-3.5 rounded-[12px] bg-nevo-cream-elevated px-[22px] py-5">
                <div className="text-[12px] font-bold uppercase tracking-[0.06em] text-nevo-navy">
                  Adaptations per week
                </div>
                <ol className="m-0 mt-4 flex list-none items-end gap-4 p-0">
                  {bars.map((b) => (
                    <li
                      key={b.key}
                      data-week={b.key}
                      className="flex min-w-0 flex-1 flex-col items-center gap-2"
                    >
                      {/* A week the server did not send: its slot, its date,
                          and nothing else - no bar, no 0. */}
                      {b.count === null ? null : (
                        <>
                          <span className="text-[12px] font-semibold text-nevo-navy">
                            {b.count}
                            <span className="sr-only">{` in the week of ${b.label}`}</span>
                          </span>
                          <span
                            aria-hidden="true"
                            className="block w-full rounded-t-[6px] bg-nevo-violet"
                            style={{ height: `${b.height}px` }}
                          />
                        </>
                      )}
                      {/* Two lines' height whether the date wraps or not, so
                          every bar stands on the same baseline (review, 25 Nov:
                          a wrapped "31 Aug" sat its bar 17px lower at 768). */}
                      <span
                        aria-hidden="true"
                        className="flex h-[28px] items-start justify-center text-center text-[11px] leading-[1.25] text-nevo-near-black/55"
                      >
                        {b.label}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null;
          })()}
          {(() => {
            const rows = changeRows(history.history);
            return rows.length > 0 ? (
              <ol className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0">
                {rows.map((r) => (
                  <li
                    key={r.key}
                    className="grid grid-cols-[80px_1fr] items-baseline gap-4 rounded-[8px] bg-nevo-cream-elevated px-4 py-[13px] max-sm:grid-cols-[64px_1fr] max-sm:gap-3"
                  >
                    <span className="text-[12px] text-nevo-near-black/55">{r.date}</span>
                    <span className="text-[13px] leading-[1.55] text-nevo-near-black">
                      {/* One string each, so a text reader keeps "Started:" whole. */}
                      <strong className="font-semibold">{`${r.verb}:`}</strong> {r.what}
                    </span>
                  </li>
                ))}
              </ol>
            ) : history.history.changes.length === 0 ? (
              <p className={cn(CARD, "m-0 mt-3 px-6 py-5 text-sm text-nevo-near-black/62")}>
                {`Nevo hasn’t started or stopped any support for ${firstName} in the last ${HISTORY_WEEKS} weeks.`}
              </p>
            ) : null;
          })()}
        </div>
      )}

      <div className="mt-8 border-t border-nevo-near-black/10 pt-5">
        {lacksRole ? (
          <UnavailableAction label="Create a progress report" what="Progress reports" />
        ) : (
        <>
        <Link
          // Back on the exporter returns to this profile.
          href={withBack(`/admin/senco/export?student=${encodeURIComponent(studentId)}`, {
            href: back ? withBack(`/admin/senco/${studentId}`, back) : `/admin/senco/${studentId}`,
            label: name,
          })}
          className={PRIMARY_BTN}
        >
          Create a progress report
        </Link>
        <p className="mt-2 max-w-[52ch] text-[13px] leading-[1.5] text-nevo-near-black/55">
          A progress report turns this into plain prose you can review and share
          with {firstName}&rsquo;s guardian.
        </p>
        </>
        )}
      </div>
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

