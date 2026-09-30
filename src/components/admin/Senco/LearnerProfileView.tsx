"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  classesApi,
  type AdminClass,
  type LearnerObservation,
} from "@/lib/api/classes";
import {
  OBSERVATION_COPY,
  observationCount,
} from "@/lib/constants/observations";
import {
  studentsApi,
  type Accommodations,
  type AdminStudentDetail,
  type ConceptMasteryRow,
  type StudentAdaptation,
} from "@/lib/api/students";
import { yearGroupLabel } from "@/lib/constants/yearGroups";
import { cn } from "@/lib/utils";
import { accommodationCopy } from "@/lib/constants/accommodations";
import {
  Avatar,
  CARD,
  GHOST_BTN,
  PRIMARY_BTN,
  ROW_DIVIDER,
} from "../Roster/primitives";
import { NoAccess, failureKind } from "../NoAccess";

/**
 * D8b Learner Profile - the SENCo's plain-language view of one learner.
 *
 * "Everything reads in human terms: no clinical labels, no confidence scores,
 * no raw signal talk." That sentence governs every decision on this screen,
 * and two of them are worth spelling out:
 *
 * 1. THE DUAL-TRACK MASTERY BARS CARRY NO NUMBERS. The comparison is the whole
 *    point of the section - understanding against the reading level the
 *    material demands, so that a gap points at the text rather than the
 *    concept - but a percentage beside a child's name is a confidence score,
 *    which this screen explicitly does not show. Two bars and a plain sentence
 *    say the same thing without inviting anyone to quote a figure at a parent.
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
}: {
  firstName: string;
  what: string;
  onRetry: () => void;
}) {
  return (
    <div className="m-0 text-sm text-nevo-near-black/62">
      <p className="m-0">
        We couldn&rsquo;t read {firstName}&rsquo;s {what} just now, so
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

export function LearnerProfileView({ studentId }: { studentId: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [student, setStudent] = useState<AdminStudentDetail | null>(null);
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [accommodations, setAccommodations] = useState<Accommodations | null>(
    null,
  );
  const [mastery, setMastery] = useState<ConceptMasteryRow[]>([]);
  const [adaptations, setAdaptations] = useState<StudentAdaptation[]>([]);
  /*
   * IN FLIGHT IS NOT THE SAME AS ANSWERED. The roster read starts only once
   * the learner's class is known, so this is its own three-state rather than
   * an array that is empty for both "not asked yet" and "nothing to report".
   */
  const [observations, setObservations] = useState<LearnerObservation[] | null>(
    null,
  );
  const [observationsPhase, setObservationsPhase] = useState<
    "idle" | "ready" | "failed"
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

  const load = useCallback(() => {
    Promise.all([studentsApi.get(studentId), classesApi.list(true)])
      .then(([s, c]) => {
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
        studentsApi
          .accommodations(studentId)
          .then(setAccommodations)
          .catch(() => setFailed((f) => ({ ...f, accommodations: true })));
        studentsApi
          .mastery(studentId)
          .then(setMastery)
          .catch(() => setFailed((f) => ({ ...f, mastery: true })));
        studentsApi
          .adaptations(studentId)
          .then(setAdaptations)
          .catch(() => setFailed((f) => ({ ...f, adaptations: true })));
      })
      .catch((err: unknown) => setPhase(failureKind(err)));
  }, [studentId]);

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
        setObservationsPhase("ready");
      })
      .catch(() => {
        if (live) setObservationsPhase("failed");
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

  return (
    <Wrapper>
      <Link
        href="/admin/senco"
        className="text-[13.5px] font-semibold text-nevo-navy hover:opacity-75"
      >
        &larr; Back to profiles
      </Link>

      <div className="mt-3 flex items-center gap-4">
        <Avatar name={name} size={56} />
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

      <SectionLabel>Current accommodations</SectionLabel>
      <div className={cn(CARD, "mt-2.5 px-6 py-[22px]")}>
        {failed.accommodations ? (
          <ReadFailed
            firstName={firstName}
            what="accommodations"
            onRetry={load}
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
              const times = observationCount(o.pattern, o.count);
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
          <ReadFailed firstName={firstName} what="signals" onRetry={load} />
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

      <SectionLabel>Concept mastery · dual-track</SectionLabel>
      <div className={cn(CARD, "mt-2.5")}>
        <p className="m-0 px-6 pb-4 pt-[22px] text-[13px] leading-[1.6] text-nevo-near-black/60">
          Two tracks per concept: how well {firstName} understands it, and the
          reading level the material demands. When the two part company, the
          barrier is the text, not the concept - the distinction this profile
          exists to draw.
        </p>
        {failed.mastery ? (
          <div className="border-t border-nevo-near-black/8 px-6 py-6">
            <ReadFailed
              firstName={firstName}
              what="concept record"
              onRetry={load}
            />
          </div>
        ) : mastery.length === 0 ? (
          <p className="m-0 border-t border-nevo-near-black/8 px-6 py-6 text-sm text-nevo-near-black/62">
            No concepts have enough practice behind them yet.
          </p>
        ) : (
          mastery.slice(0, 10).map((row, i) => {
            // Bars, never numbers - see the note at the top of this file.
            const concept = Math.max(
              0,
              Math.min(1, row.masteryProbabilityConcept),
            );
            const reading = Math.max(
              0,
              Math.min(1, row.masteryProbabilityReading),
            );
            const gap = concept - reading;
            const textIsTheBarrier = gap > 0.15;
            return (
              <div
                key={row.conceptId}
                className={cn(
                  "px-6 py-4",
                  i < Math.min(mastery.length, 10) - 1 && ROW_DIVIDER,
                )}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[14.5px] font-semibold text-nevo-near-black">
                    {row.conceptName}
                  </span>
                  {textIsTheBarrier ? (
                    <span className="flex-none text-[12.5px] font-semibold text-nevo-navy">
                      Reading is the barrier here
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-col gap-2">
                  <Track
                    label="Understands the idea"
                    value={concept}
                    tone="navy"
                  />
                  <Track
                    label="Handles the reading"
                    value={reading}
                    tone="violet"
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      <SectionLabel>Recent adaptations</SectionLabel>
      <div className={cn(CARD, "mt-2.5")}>
        {failed.adaptations ? (
          <div className="px-6 py-6">
            <ReadFailed
              firstName={firstName}
              what="adaptation history"
              onRetry={load}
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

      <div className="mt-8 border-t border-nevo-near-black/10 pt-5">
        <Link
          href={`/admin/senco/export?student=${encodeURIComponent(studentId)}`}
          className={PRIMARY_BTN}
        >
          Create a progress report
        </Link>
        <p className="mt-2 max-w-[52ch] text-[13px] leading-[1.5] text-nevo-near-black/55">
          A progress report turns this into plain prose you can review and share
          with {firstName}&rsquo;s guardian.
        </p>
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

/**
 * One track of the dual-track bar. No number, by design - the label says what
 * it is and the length says how far along, which is all a SENCo needs to see
 * the two diverge.
 */
function Track({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "navy" | "violet";
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-[150px] flex-none text-[12.5px] text-nevo-near-black/62">
        {label}
      </span>
      <span
        aria-hidden="true"
        className="h-2 flex-1 overflow-hidden rounded-full bg-nevo-near-black/[0.08]"
      >
        <span
          className={cn(
            "block h-full rounded-full",
            tone === "navy" ? "bg-nevo-navy" : "bg-nevo-violet",
          )}
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </span>
    </div>
  );
}
