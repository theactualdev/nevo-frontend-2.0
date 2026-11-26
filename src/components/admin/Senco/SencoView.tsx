"use client";

import { NevoSelect } from "@/components/shared/NevoSelect";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  classesApi,
  type AdminClass,
  type LearnerObservation,
} from "@/lib/api/classes";
import { intelligenceApi, type AttentionFlag } from "@/lib/api/intelligence";
import { escalationsApi, type Escalation } from "@/lib/api/escalations";
import { teachersApi } from "@/lib/api/teachers";
import { TeacherConcerns } from "./TeacherConcerns";
import {
  accommodationsApi,
  studentsApi,
  type AccommodationType,
  type AdminStudentRow,
} from "@/lib/api/students";
import { accommodationCopy } from "@/lib/constants/accommodations";
import { DECLARED_OBSERVATION_WINDOW_DAYS, inTheLast } from "@/lib/constants/observations";
import { ReadFailed } from "../ReadFailed";
import { YEAR_GROUPS, yearGroupLabel } from "@/lib/constants/yearGroups";
import { cn } from "@/lib/utils";
import {
  collectAdaptationWindow,
  windowStart,
} from "@/lib/adaptationWindow";
import { schoolIntelligenceApi } from "@/lib/api/schoolIntelligence";
import { NoAccess, failureKind } from "../NoAccess";
import { useLearningSupport } from "../LearningSupport/useLearningSupport";
import { GET_LEARNING_SUPPORT, UnavailableAction } from "../LearningSupport/Unavailable";
import { LEARNING_SUPPORT_REQUIRED, refusedWith } from "@/lib/api/learningSupport";
import { WriteFailed } from "../WriteFailed";
import {
  CARD,
  PRIMARY_BTN,
  PlusIcon,
  ROW_DIVIDER,
  SectionHeading,
} from "../Roster/primitives";
import { ChildAvatar } from "../Roster/ChildAvatar";
import { lookOfChild } from "@/lib/profile/rosterLook";

/**
 * D8 Learning Support and D8b Learner Profiles - the SENCo surface.
 *
 * The frame calls these "the highest-stakes screens in the layer", and the
 * register is the whole point: EVERYTHING READS IN HUMAN TERMS. No clinical
 * labels, no confidence scores, no raw signal talk, no diagnosis. What Nevo
 * noticed is described as behaviour in a moment, never as a property of a
 * child. If a change to this screen would make a sentence read like a
 * judgement about a learner, it is the wrong change.
 *
 * Nothing here has been shared with anyone. The overview says so out loud,
 * because a SENCo looking at a list of flagged children needs to know the list
 * is theirs and has not gone anywhere.
 *
 * ============================================================================
 * "ESCALATED BY A TEACHER" IS BUILT (13 Oct). D8 puts teacher escalations
 * ABOVE Nevo's own flags, and says why: "a teacher's escalation carries a
 * human concern". It is the more important half of this screen.
 *
 * It was held only by the 21 Sep counsel hold on the learning-support surface;
 * the transport (`GET /api/v1/escalations`, `.../{id}/acknowledge`) has been
 * live since 15 Sep. Olayinka deferred counsel on 12 Oct - nothing is held on
 * them any more - so the section is here. See `TeacherConcerns`.
 *
 * Still never an empty-stated section: a failed read says so, and the
 * all-clear below waits until both the concerns and the flags were read in
 * full, because "no teacher has raised a concern" is the most damaging thing
 * this screen could get wrong.
 * ============================================================================
 *
 * THE ARITHMETIC THAT JUSTIFIED THIS DEFERRAL WAS TWO-THIRDS WRONG. It read:
 * "Each needs its own per-student request, and there is no bulk route, so at
 * 247 profiles that is ~741 calls to paint a list." Of D8b's three list
 * figures only ONE costs a call per learner:
 *
 *   - ACTIVE SUPPORT still does. `GET /api/intelligence/accommodations/{id}`
 *     is the only accommodations route in the spec and takes no student list.
 *   - ADAPTATIONS THIS WEEK is ONE windowed call:
 *     `GET /api/admin/adaptation-log?dateFrom=...`, whose rows carry
 *     `studentId`. `schoolIntelligenceApi.adaptationLog` already does exactly
 *     this in AdaptationLogView.
 *   - LESSONS COMPLETED arrives per learner on the class roster read as the
 *     `completed_lessons` observation with its count - and this screen already
 *     makes one request per class.
 *
 * LESSONS COMPLETED IS BUILT, at no extra cost: the per-class fan-out was
 * switched from `studentsApi.list({classId})` to `classesApi.classStudents`,
 * which carries the same membership plus `observations`. Same number of calls.
 *
 * ADAPTATIONS THIS WEEK IS BUILT, by paging the window rather than trusting a
 * count. See `lib/adaptationWindow.ts`: `limit` caps at 100, and
 * `AdaptationEventLogResponse.total` carries NO DESCRIPTION in the deployed
 * spec, so termination is on a short page and `total` is not consulted at all.
 * A partial or failed read renders NO figures rather than a floor. And only
 * for a Learning Support holder: a learner's adaptation history is the role's
 * (SCRUM-247), so a viewer without it - or one whose role isn't known yet -
 * sees no per-child count (backlog 40).
 *
 * ACTIVE SUPPORT IS BUILT (backlog 40) from `GET /api/v1/accommodations`, one
 * read for the whole school, Learning Support-gated. REDUCED: D08b draws
 * short support names ("Audio scaffolding", "Extended pacing"), and the
 * contract carries `reading | attention | numerical`. Those words beside a
 * child's name are the label Zero-Tag forbids, so each is the same sentence
 * the profile uses, with Nevo as its subject (`accommodations.ts`). Raised.
 */

type Phase = "loading" | "ready" | "failed" | "denied";
type View = "attention" | "profiles";

/**
 * Lessons finished, off the roster observations, or null when we were not told.
 *
 * `observations` is OPTIONAL on `ClassStudentResponse` and `count` is optional
 * and nullable on each entry, so three separate things mean "no figure": no
 * observations array, no `completed_lessons` entry, and an entry whose count is
 * null. All three return null and none of them is a zero.
 */
function completedLessons(
  observations: LearnerObservation[] | undefined,
): number | null {
  const hit = observations?.find((o) => o.pattern === "completed_lessons");
  return typeof hit?.count === "number" ? hit.count : null;
}

const SEARCH_BAR =
  "flex h-[42px] w-full max-w-[320px] flex-1 items-center gap-[9px] rounded-[10px] border-[1.5px] border-nevo-near-black/10 bg-nevo-cream-elevated px-[15px] text-[14.5px] text-nevo-near-black outline-none transition-colors placeholder:text-nevo-near-black/50 focus-within:border-nevo-navy";

const FILTER_PILL =
  "flex h-[42px] cursor-pointer items-center gap-[7px] rounded-[10px] border-[1.5px] border-nevo-near-black/16 px-[14px] text-[13.5px] font-medium text-nevo-near-black/72 transition-colors hover:bg-nevo-navy/[0.06]";

function relativeDay(iso: string, now: number): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const days = Math.round((now - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(then).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function SencoView() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [view, setView] = useState<View>("attention");
  /** SCRUM-247: without Learning Support the exporter is unavailable, not missing. */
  const { holders: ls } = useLearningSupport();
  /*
   * Marking a flag as seen needs it too (13 Oct): only a holder can say
   * learning support saw it. Known up front from the holders read, or learned
   * from a refusal itself when that read did not answer - a refused "Mark as
   * seen", or the Active support read refused for the role.
   */
  const [roleRefused, setRoleRefused] = useState(false);
  const lacksRole = ls?.viewerHoldsIt === false || roleRefused;
  const [flags, setFlags] = useState<AttentionFlag[]>([]);
  /** Teachers' concerns: null until read, and a failed read is its own state. */
  const [concerns, setConcerns] = useState<Escalation[] | null>(null);
  /** Whether `concerns` is every open one, so a count and "none" are true. */
  const [concernsRead, setConcernsRead] = useState(false);
  const [concernsFailed, setConcernsFailed] = useState(false);
  /** Who raised each concern, by teacher id; empty when the list can't be read. */
  const [teacherNames, setTeacherNames] = useState<Record<string, string>>({});
  /**
   * Whether `flags` is every flag, or only the pages we managed to read.
   * False means neither the count nor the all-clear may be stated.
   */
  const [flagsComplete, setFlagsComplete] = useState(false);
  const [students, setStudents] = useState<AdminStudentRow[]>([]);
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [classOf, setClassOf] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [classId, setClassId] = useState("");
  const [year, setYear] = useState("");
  const [now, setNow] = useState(0);
  /** A "mark as seen" the server refused. Nothing moved; say why. */
  const [ackFailed, setAckFailed] = useState(false);
  /** The flag currently being marked, so the row can say it is in flight. */
  const [acking, setAcking] = useState<string | null>(null);
  /**
   * How each class's own roster read went. THREE STATES: the previous fix had
   * only "failed", and `undefined` doubled as both "fine" and "still in the
   * air" - so selecting a class before its request landed printed "No profiles
   * match", the same false absence, in a different window.
   *
   * "refused" is the server's 403 (`class_students_forbidden`, S14, 25 Nov):
   * an admin with neither roster nor SENCO access nor a Learning Support
   * grant. It is about the VIEWER, not the class - the route never asks which
   * class an admin wants - so no retry can succeed, and nothing that rides on
   * this read (class line, lessons finished, the class and year filters) is
   * drawn for them.
   */
  const [classRead, setClassRead] = useState<
    Record<string, "pending" | "ok" | "failed" | "refused">
  >({});
  /*
   * Lessons finished, per learner, from the SAME per-class read that builds
   * `classOf`. It is keyed by student rather than by class so a row can ask for
   * its own figure without knowing which request carried it.
   *
   * A learner ABSENT from this map has no figure - and the row renders nothing
   * rather than a dash or a zero. "0 lessons" and "we have not read your class
   * yet" are different statements, and on a SENCo screen the second must never
   * be printed as the first.
   */
  const [lessonsDone, setLessonsDone] = useState<Record<string, number>>({});
  /*
   * Adaptations in the last seven days, per learner. NULL until the window has
   * been read in full - which is not the same as an empty object, and the
   * difference is the whole point: an empty tally after a COMPLETE read means
   * nobody had an adaptation, and null means we do not know.
   *
   * `collectAdaptationWindow` returns `complete: false` for a partial or failed
   * read, and that lands here as null. A count built from the pages we managed
   * to get is a floor, and a floor beside a child's name reads as a finding.
   */
  const [adaptationsWeek, setAdaptationsWeek] = useState<Record<
    string,
    number
  > | null>(null);
  /*
   * ACTIVE SUPPORT per learner (backlog 40), and how its read went - its own
   * state, so each outcome draws what it draws on purpose (Hub, 26 Nov):
   *  - "ok": a line on each learner Nevo adjusts something for;
   *  - "failed": said once above the list, because a learner with no line
   *    would otherwise look the same as one Nevo adjusts nothing for;
   *  - "refused": the server's 403. For this read that is the role
   *    (`learning_support_role_required`, backend 608b880): what Nevo adjusts
   *    for a named child is Learning Support's to see. The nothing-state - no
   *    line on any row, no failure line, no retry that could not succeed -
   *    and, as a refused "Mark as seen" does, it tells the screen the role is
   *    missing when the holders read did not answer.
   * It used to be one boolean, and a refusal drew nothing only because any
   * 403 cleared it (its test sent a code the server never sends).
   */
  const [support, setSupport] = useState<Record<string, AccommodationType[]> | null>(null);
  const [supportRead, setSupportRead] = useState<"pending" | "ok" | "failed" | "refused">(
    "pending",
  );
  const readSupport = useCallback(() => {
    // The failure line clears when a read answers, not when one starts.
    accommodationsApi
      .listActive()
      .then((rows) => {
        setSupport(Object.fromEntries(rows.map((r) => [r.studentId, r.active])));
        setSupportRead("ok");
      })
      .catch((err: unknown) => {
        setSupport(null);
        if (refusedWith(err, LEARNING_SUPPORT_REQUIRED)) setRoleRefused(true);
        setSupportRead(failureKind(err) === "denied" ? "refused" : "failed");
      });
  }, []);
  /*
   * ADAPTATIONS THIS WEEK, unread: said above the list, as Active support's
   * failure is (Hub, 26 Nov) - a row with no figure must not read as a quiet
   * week. A refusal is the viewer's scope, which no retry changes, so it draws
   * nothing; and the cap (more of the week than we page) is not a failure
   * either, so it stays the silent nothing `collectAdaptationWindow` returns.
   */
  const [adaptationsFailed, setAdaptationsFailed] = useState(false);
  const readAdaptations = useCallback(() => {
    // Its own read, its own failure. This pages the whole week's log, so it is
    // the slowest thing on the screen and must never hold the profiles behind
    // it - the list renders, and the figures appear when they are trustworthy.
    // The failure line clears when a read answers, not when one starts.
    const from = windowStart(Date.now());
    collectAdaptationWindow((offset) =>
      schoolIntelligenceApi
        .adaptationLog({ dateFrom: from, limit: 100, offset })
        .then((log) => ({ events: log.events, total: log.total })),
    )
      .then((w) => {
        setAdaptationsWeek(w.complete ? w.perLearner : null);
        setAdaptationsFailed("error" in w && failureKind(w.error) !== "denied");
      })
      .catch((err: unknown) => {
        setAdaptationsWeek(null);
        setAdaptationsFailed(failureKind(err) !== "denied");
      });
  }, []);

  const loadConcerns = useCallback(() => {
    escalationsApi
      .allOpen()
      .then(({ open, complete }) => {
        setConcerns(open);
        setConcernsRead(complete);
        setConcernsFailed(false);
      })
      .catch(() => {
        setConcerns(null);
        setConcernsFailed(true);
      });
    teachersApi
      .list()
      .then((ts) => setTeacherNames(Object.fromEntries(ts.map((t) => [t.id, t.name]))))
      .catch(() => setTeacherNames({}));
  }, []);

  const load = useCallback(() => {
    // Their own read, their own failure: a concern list that didn't answer
    // must not hold Nevo's flags or the profiles behind it.
    loadConcerns();
    readSupport();
    readAdaptations();

    /*
     * EVERY FLAG, NOT THE FIRST FIFTY. This read `getFlags({ limit: 50 })` and
     * dropped acknowledged rows on the client - so at a school with fifty
     * seen flags ahead of the open ones, the open ones never arrived, and
     * the card below said "Nothing needs your attention right now" to a
     * SENCo with children waiting. `allFlags` pages to a short page and says
     * whether it got there.
     *
     * OPEN FLAGS ONLY (Teslim 9c35c95, 27 Oct). A flag whose evidence stopped
     * holding closes, and a fresh one replaces it if the evidence changes -
     * so reading closed ones listed the same child twice, and kept a closed
     * flag "to look at" that the server's own count no longer has.
     */
    Promise.all([
      intelligenceApi.allFlags(10, { openOnly: true }),
      studentsApi.list(),
      classesApi.list(),
    ])
      .then(([f, s, c]) => {
        setFlags(f.flags);
        setFlagsComplete(f.complete);
        setStudents(s);
        setClasses(c);
        setNow(Date.now());
        setPhase("ready");
        /*
         * One request per class, and each can fail on its own. A class whose
         * roster did not answer contributes NO entries to `classOf`, so
         * filtering to it matched nobody and the screen said "No profiles
         * match. Try a different name or filter." - which reads as a fact
         * about the school's records. A SENCo checking who she holds profiles
         * for before a review meeting concluded Nevo held none.
         */
        setClassRead(
          Object.fromEntries(c.map((k) => [k.id, "pending" as const])),
        );
        /*
         * READS THE CLASS ROSTER, NOT THE STUDENT LIST. This used to call
         * `studentsApi.list({ classId })`, whose `StudentSummaryResponse`
         * carries no `observations` - so D8b's "lessons completed" figure was
         * deferred as needing a request per learner when the request the screen
         * ALREADY MAKES could carry it. `GET /api/v1/classes/{id}/students`
         * returns the same membership plus `observations`, at the same cost.
         */
        c.forEach((klass) => {
          classesApi
            .classStudents(klass.id)
            .then((inClass) => {
              setClassOf((prev) => {
                const next = { ...prev };
                inClass.forEach((st) => {
                  next[st.studentId] = klass.id;
                });
                return next;
              });
              setLessonsDone((prev) => {
                const next = { ...prev };
                inClass.forEach((st) => {
                  const done = completedLessons(st.observations);
                  if (done !== null) next[st.studentId] = done;
                });
                return next;
              });
              setClassRead((prev) => ({ ...prev, [klass.id]: "ok" }));
            })
            .catch((err: unknown) =>
              setClassRead((prev) => ({
                ...prev,
                [klass.id]: failureKind(err) === "denied" ? "refused" : "failed",
              })),
            );
        });
      })
      .catch((err: unknown) => setPhase(failureKind(err)));
  }, [loadConcerns, readSupport, readAdaptations]);

  useEffect(() => {
    load();
  }, [load]);

  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);

  const openFlags = useMemo(
    () => flags.filter((f) => !f.acknowledged),
    [flags],
  );
  const openConcerns = useMemo(
    () => (concerns ?? []).filter((e) => !e.acknowledged),
    [concerns],
  );
  /** Every concern was read, so a count is a total and "none" is true. */
  const concernsComplete = concerns !== null && concernsRead;
  const concernsClear = concernsComplete && openConcerns.length === 0;
  /*
   * WHOSE LISTS THESE ARE (Hub, 26 Nov). The server answers a viewer without
   * Learning Support with less than the school's lists, and says nothing in
   * either response about having narrowed them (backend 608b880):
   *  - flags narrow to the classes they teach, when they also teach;
   *  - teachers' concerns narrow to the ones sent to them or about their own
   *    classes.
   * So "Nothing needs your attention right now" and a flag or concern TOTAL -
   * claims about the school - are made only to a holder, whose lists are not
   * narrowed. Anyone else, or anyone whose role isn't known yet, gets what was
   * read as a floor, and no all-clear.
   */
  const listsAreTheSchools = ls?.viewerHoldsIt === true;

  /** The year groups this school's classes actually use, in enum order. */
  const years = useMemo(() => {
    const seen = new Set(
      classes.map((c) => c.yearGroup).filter((y): y is string => Boolean(y)),
    );
    return YEAR_GROUPS.filter((y) => seen.has(y));
  }, [classes]);

  /*
   * The server refused this viewer the class rosters (see `classRead`). A
   * class or year filter can then only ever answer "No profiles match" - an
   * absence the school's records never stated - so neither is offered, and a
   * choice made before the refusal landed stops applying.
   */
  const rosterRefused = useMemo(
    () => Object.values(classRead).includes("refused"),
    [classRead],
  );

  const profiles = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return students
      .filter((s) => (classId && !rosterRefused ? classOf[s.id] === classId : true))
      .filter((s) => {
        if (!year || rosterRefused) return true;
        // A learner whose class we have not resolved is not evidence of any
        // year group, so a year filter leaves them out rather than guessing.
        const c = classById.get(classOf[s.id] ?? "");
        return c?.yearGroup === year;
      })
      .filter((s) => (needle ? s.name.toLowerCase().includes(needle) : true));
  }, [students, search, classId, year, classOf, classById, rosterRefused]);

  /*
   * PESSIMISTIC, AND DELIBERATELY SO.
   *
   * This used to flip the flag first and roll it back on failure. That is the
   * usual optimistic trade, and it is the wrong one HERE, because the flag
   * disappearing is not a cosmetic state - it is what makes the card below
   * render "Nothing needs your attention right now". Clearing the last open
   * flag therefore stated the SENCo's whole queue was empty before the POST had
   * returned, and on a failure the row came back with the reassurance already
   * read. A screen whose job is to say what needs looking at must not say
   * "nothing" on the strength of a write nobody has confirmed.
   *
   * #301 added the words for the failure but left this ordering, which is the
   * half that produces the false claim.
   *
   * The rollback is gone with it: there is nothing to roll back if nothing
   * moved, and the old rollback called `setAckFailed` from inside a `setFlags`
   * updater - a side effect in a function React is free to run twice.
   */
  const acknowledge = (flagId: string) => {
    // A BACKSTOP, not the guard that does the work: every row's button is
    // disabled while one is in flight, which is what the test can actually
    // reach and what stops two acknowledgements racing each other's
    // `setFlags`. This line only matters if that `disabled` is ever dropped.
    if (acking) return;
    setAcking(flagId);
    setAckFailed(false);
    intelligenceApi
      .acknowledgeFlag(flagId)
      .then(() =>
        setFlags((prev) =>
          prev.map((f) => (f.id === flagId ? { ...f, acknowledged: true } : f)),
        ),
      )
      .catch((err: unknown) => {
        if (refusedWith(err, LEARNING_SUPPORT_REQUIRED)) setRoleRefused(true);
        else setAckFailed(true);
      })
      .finally(() => setAcking(null));
  };

  /** Pessimistic, as flags are: the card leaves only once the server agrees. */
  const acknowledgeConcern = (id: string) => {
    if (acking) return;
    setAcking(id);
    setAckFailed(false);
    escalationsApi
      .acknowledge(id)
      .then(() =>
        setConcerns((prev) =>
          (prev ?? []).map((e) => (e.id === id ? { ...e, acknowledged: true } : e)),
        ),
      )
      .catch((err: unknown) => {
        if (refusedWith(err, LEARNING_SUPPORT_REQUIRED)) setRoleRefused(true);
        else setAckFailed(true);
      })
      .finally(() => setAcking(null));
  };

  const describeClass = (studentId: string) => {
    const c = classOf[studentId] ? classById.get(classOf[studentId]) : undefined;
    if (!c) return null;
    return [c.name, yearGroupLabel(c.yearGroup)].filter(Boolean).join(" · ");
  };

  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[880px]">
        <div className="flex items-start justify-between gap-6">
          <div className="max-w-[54ch]">
            <h2 className="m-0 text-[28px] font-semibold tracking-[-0.018em] text-nevo-near-black">
              {view === "attention" ? "Learning Support" : "Learner profiles"}
            </h2>
            <p className="mt-1.5 text-[14.5px] leading-[1.6] text-nevo-near-black/62">
              {view === "attention"
                ? "Students a teacher has escalated, and patterns Nevo has flagged. You decide what happens next - nothing here has been shared with anyone."
                : `${students.length} ${students.length === 1 ? "profile" : "profiles"}, in plain language.`}
            </p>
          </div>
          {lacksRole ? (
            <UnavailableAction
              align="end"
              label={
                <>
                  <PlusIcon />
                  Progress report
                </>
              }
              what="Progress reports"
            />
          ) : (
            <Link href="/admin/senco/export" className={PRIMARY_BTN}>
              <PlusIcon />
              Progress report
            </Link>
          )}
        </div>

        <div
          role="tablist"
          aria-label="Learning support"
          className="mt-7 flex gap-1 border-b border-nevo-near-black/10"
        >
          {(
            [
              ["attention", "Needs attention"],
              ["profiles", "Learner profiles"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={view === key}
              onClick={() => setView(key)}
              className={cn(
                "-mb-px cursor-pointer border-b-2 px-4 pb-3 pt-2 text-[14.5px] font-semibold transition-colors",
                view === key
                  ? "border-nevo-navy text-nevo-navy"
                  : "border-transparent text-nevo-near-black/55 hover:text-nevo-near-black/80",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {phase === "loading" ? (
          <div className={cn(CARD, "mt-6 h-[320px] animate-pulse")} />
        ) : null}

        {phase === "denied" ? (
          <NoAccess what="learning support" />
        ) : phase === "failed" ? (
          <div className={cn(CARD, "mt-6 px-[26px] py-7")}>
            <h3 className="text-[17px] font-semibold text-nevo-near-black">
              We couldn&rsquo;t load Learning Support
            </h3>
            <p className="mt-2 max-w-[52ch] text-sm leading-[1.55] text-nevo-near-black/62">
              Nothing has been missed - this is only about showing it to you.
              Try again in a moment.
            </p>
            <button
              type="button"
              onClick={() => {
                setPhase("loading");
                load();
              }}
              className={cn(PRIMARY_BTN, "mt-5")}
            >
              Try again
            </button>
          </div>
        ) : null}

        {/* ------------------------------------------------ NEEDS ATTENTION */}
        {phase === "ready" && view === "attention" && ackFailed ? (
          <WriteFailed className="mt-6" what="record that as seen" />
        ) : null}

        {phase === "ready" && view === "attention" ? (
          <>
          {lacksRole ? (
            <p
              id="ack-needs-learning-support"
              className="mt-6 max-w-[62ch] text-[13px] leading-[1.55] text-nevo-near-black/62"
            >
              {`Marking a concern or a flag as seen, and starting a progress report, need Learning Support. ${GET_LEARNING_SUPPORT}`}
            </p>
          ) : null}
          <TeacherConcerns
            open={openConcerns}
            complete={concernsComplete && listsAreTheSchools}
            failed={concernsFailed}
            studentName={(e) => byId.get(e.studentId)?.name ?? e.studentFirstName?.trim() ?? "A student"}
            describeClass={describeClass}
            teacherName={(id) => teacherNames[id] ?? null}
            when={(iso) => relativeDay(iso, now)}
            lacksRole={lacksRole}
            acking={acking}
            onAcknowledge={acknowledgeConcern}
            onRetry={loadConcerns}
          />
          {openFlags.length === 0 && !flagsComplete ? (
            /*
             * Nothing open among what we read, but we did not read it all.
             * "Nothing needs your attention" would be a claim about pages we
             * never saw.
             */
            <div className={cn(CARD, "mt-6 px-[26px] py-7")}>
              <h3 className="m-0 text-[17px] font-semibold text-nevo-near-black">
                We couldn&rsquo;t read every flag just now
              </h3>
              <p className="mt-2 max-w-[56ch] text-sm leading-[1.55] text-nevo-near-black/62">
                So we can&rsquo;t tell you nothing needs a look. Try again in a
                moment.
              </p>
            </div>
          ) : openFlags.length === 0 ? (
            // The all-clear waits for the concerns too: open ones are shown
            // above, and a failed or partial read is never "nothing". Nor is
            // a narrowed one (`listsAreTheSchools`).
            !concernsClear || !listsAreTheSchools ? null : (
            <div className={cn(CARD, "mt-6 px-6 py-14 text-center")}>
              {/* The frame's mark, which every sibling admin empty state has
                  and this one did not - so the calmest screen in the console
                  was also the barest, on the tab a SENCo opens hoping to find
                  exactly this. */}
              <Image
                src="/illustrations/empty-admin-outcomes.png"
                alt=""
                width={320}
                height={200}
                className="mx-auto mb-3 h-[180px] w-auto object-contain"
              />
              <h3 className="m-0 text-xl font-semibold text-nevo-near-black">
                Nothing needs your attention right now
              </h3>
              <p className="mx-auto mt-2.5 max-w-[48ch] text-[15px] leading-[1.6] text-nevo-near-black/64">
                When a teacher escalates a student, or Nevo notices a pattern
                worth a look, it&rsquo;ll appear here. You can still create a
                progress report for any student at any time.
              </p>
              {lacksRole ? (
                <UnavailableAction
                  className="mt-6 items-center text-center"
                  label="Create a progress report"
                  what="Progress reports"
                />
              ) : (
                <Link href="/admin/senco/export" className={cn(PRIMARY_BTN, "mx-auto mt-6")}>
                  Create a progress report
                </Link>
              )}
            </div>
            )
          ) : (
            <>
              <div className="mt-7 flex items-center justify-between gap-4">
                <SectionHeading>Flagged by Nevo</SectionHeading>
                <span className="text-[13px] text-nevo-near-black/50">
                  {/* A floor is never shown as a total - and a narrowed
                      list is a floor (`listsAreTheSchools`). */}
                  {flagsComplete && listsAreTheSchools
                    ? `${openFlags.length} to look at`
                    : `At least ${openFlags.length} to look at`}
                </span>
              </div>

              <div className={cn(CARD, "mt-3.5")}>
                {openFlags.map((f, i) => {
                  const student = byId.get(f.studentId);
                  const name = student?.name ?? "A student";
                  const cls = describeClass(f.studentId);
                  return (
                    <div
                      key={f.id}
                      className={cn(
                        "flex items-start gap-3.5 px-[22px] py-[18px]",
                        i < openFlags.length - 1 && ROW_DIVIDER,
                      )}
                    >
                      <ChildAvatar look={student ? lookOfChild(student) : null} size={38} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="text-[15px] font-semibold text-nevo-near-black">
                            {name}
                          </span>
                          {cls ? (
                            <span className="text-[13px] text-nevo-near-black/58">
                              {cls}
                            </span>
                          ) : null}
                        </div>
                        {/* Zero-Tag: behaviour in the moment, never a label. */}
                        <p className="m-0 mt-1.5 text-sm leading-[1.55] text-nevo-near-black/78">
                          {f.description}
                        </p>
                        <p className="m-0 mt-1.5 text-xs text-nevo-near-black/50">
                          Noticed {relativeDay(f.generatedAt, now)}
                        </p>
                      </div>
                      <div className="flex flex-none flex-col items-end gap-2">
                        <Link
                          href={`/admin/senco/${f.studentId}`}
                          className="cursor-pointer text-[13px] font-semibold text-nevo-navy hover:opacity-75"
                        >
                          Open profile
                        </Link>
                        <button
                          type="button"
                          onClick={() => acknowledge(f.id)}
                          disabled={acking !== null || lacksRole}
                          aria-describedby={lacksRole ? "ack-needs-learning-support" : undefined}
                          className="cursor-pointer text-[13px] font-semibold text-nevo-near-black/55 transition-opacity hover:text-nevo-near-black/80 disabled:cursor-wait disabled:opacity-50"
                        >
                          {acking === f.id ? "Marking…" : "Mark as seen"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          </>
        ) : null}

        {/* ------------------------------------------------ LEARNER PROFILES */}
        {phase === "ready" && view === "profiles" ? (
          <>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <label className={SEARCH_BAR}>
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="flex-none text-nevo-near-black/50"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4-4" />
                </svg>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search learners"
                  aria-label="Search learners"
                  className="min-w-0 flex-1 border-none bg-transparent outline-none"
                />
              </label>
              {/* Not offered when the rosters were refused (`rosterRefused`). */}
              {rosterRefused ? null : (
                <NevoSelect
                  aria-label="Filter by class"
                  value={classId}
                  onValueChange={setClassId}
                  options={[
                    { value: "", label: "All classes" },
                    ...classes.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                  triggerClassName={FILTER_PILL}
                />
              )}
              {/* A YEAR GROUP IS HOW A SENCo THINKS ABOUT THIS LIST, and the
                  screen offered only search and class. The options are the
                  year groups this school's own classes actually use, in the
                  enum's order - never the full canonical seventeen, which
                  would offer a SENCo levels their school does not run. */}
              {years.length > 1 && !rosterRefused ? (
                <NevoSelect
                  aria-label="Filter by year group"
                  value={year}
                  onValueChange={setYear}
                  options={[
                    { value: "", label: "All year groups" },
                    ...years.map((y) => ({ value: y, label: yearGroupLabel(y) ?? y })),
                  ]}
                  triggerClassName={FILTER_PILL}
                />
              ) : null}
            </div>

            {/* ACTIVE SUPPORT unread: said once, above the rows, so a learner
                with no line isn't read as one Nevo adjusts nothing for. A
                refusal says nothing here (`supportRead`). */}
            {supportRead === "failed" ? (
              <ReadFailed
                className="mt-4"
                what="what Nevo is adjusting for each learner"
                onRetry={readSupport}
              />
            ) : null}
            {/* ADAPTATIONS THIS WEEK unread, likewise - to a holder only, the
                one viewer shown the figure (SCRUM-247). "The adaptation log"
                is the name D21 and its no-access line already use. */}
            {adaptationsFailed && ls?.viewerHoldsIt === true ? (
              <ReadFailed
                className="mt-4"
                what="the adaptation log"
                onRetry={readAdaptations}
              />
            ) : null}

            <div className={cn(CARD, "mt-4")}>
              {profiles.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  {/* With the rosters refused no class filter applies, so
                      only the search can have emptied the list. */}
                  {classId && !rosterRefused && classRead[classId] === "failed" ? (
                    <p className="m-0 text-sm text-nevo-near-black/62">
                      We couldn&rsquo;t read that class&rsquo;s roster just now,
                      so there&rsquo;s nothing to show here yet &ndash; this is
                      not a record that the class has no profiles.
                    </p>
                  ) : classId && !rosterRefused && classRead[classId] !== "ok" ? (
                    /* Still in the air. Not an answer, so not a claim. */
                    <p className="m-0 text-sm text-nevo-near-black/62">
                      Still reading that class&rsquo;s roster&hellip;
                    </p>
                  ) : (
                    <p className="m-0 text-sm text-nevo-near-black/62">
                      No profiles match. Try a different name or filter.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setClassId("");
                      setYear("");
                    }}
                    className="mt-3 cursor-pointer text-sm font-semibold text-nevo-navy hover:opacity-75"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                profiles.map((s, i) => (
                  <Link
                    key={s.id}
                    href={`/admin/senco/${s.id}`}
                    className={cn(
                      "flex items-center gap-3.5 px-[22px] py-4 transition-colors hover:bg-nevo-navy/[0.03]",
                      i < profiles.length - 1 && ROW_DIVIDER,
                    )}
                  >
                    <ChildAvatar look={lookOfChild(s)} size={38} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[15px] font-semibold text-nevo-near-black">
                          {s.name}
                        </span>
                        {/* THE DOT THE FRAME DRAWS, from flags already in this
                            component's own state. Without it the two halves of
                            this screen do not join up: a SENCo reading the
                            profiles list had no way to see which of these
                            learners are the ones the Learning Support tab is
                            about, short of switching tabs and back.

                            It marks an OPEN flag only - acknowledged ones are
                            handled, and a permanent mark on a learner whose
                            flag was dealt with weeks ago is the kind of
                            lingering label this console does not keep. */}
                        {openFlags.some((f) => f.studentId === s.id) ? (
                          <span
                            aria-label="Has an open support flag"
                            className="size-2 flex-none rounded-full bg-nevo-violet"
                          />
                        ) : null}
                      </div>
                      {describeClass(s.id) ? (
                        <div className="truncate text-[13px] text-nevo-near-black/58">
                          {describeClass(s.id)}
                        </div>
                      ) : null}
                      {/* ACTIVE SUPPORT, as the profile says it: what Nevo
                          does, never a word about the child. Only from a
                          read that answered; an enum value this console
                          hasn't been taught is skipped, never shown raw. */}
                      {supportRead === "ok" && support && (support[s.id] ?? []).some((a) => accommodationCopy(a)) ? (
                        <ul data-active-support className="m-0 mt-1 list-none p-0 text-[13px] leading-[1.5] text-nevo-near-black/66">
                          {(support[s.id] ?? []).map((a) =>
                            accommodationCopy(a) ? <li key={a}>{accommodationCopy(a)}</li> : null,
                          )}
                        </ul>
                      ) : null}
                    </div>
                    {/* ABSENT, NOT ZERO. A learner whose class roster has not
                        answered - or failed - is simply not in `lessonsDone`,
                        and gets no figure at all. Rendering "0" or a dash here
                        would attribute the silence to the child.

                        AND NEVER WITHOUT ITS WINDOW (S22, Hub 25 Nov): the
                        server counts the last 30 days and the contract does
                        not say so, so "12 lessons finished" read as a total.
                        Left out until a window is declared, then said with it. */}
                    {typeof lessonsDone[s.id] === "number" && inTheLast(DECLARED_OBSERVATION_WINDOW_DAYS) ? (
                      <span className="flex-none text-[13px] text-nevo-near-black/55">
                        {`${lessonsDone[s.id]} ${lessonsDone[s.id] === 1 ? "lesson" : "lessons"} finished ${inTheLast(DECLARED_OBSERVATION_WINDOW_DAYS)}`}
                      </span>
                    ) : null}
                    {/* Only once the WHOLE week has been read. A zero here is
                        a real zero - nobody adapted anything for this learner
                        in seven days - which is why the partial case renders
                        nothing at all rather than a low number. */}
                    {/* And only for a Learning Support holder (SCRUM-247): a
                        learner's adaptation history is the role's. Unknown
                        role, no figure. */}
                    {adaptationsWeek && ls?.viewerHoldsIt === true ? (
                      <span className="flex-none text-[13px] text-nevo-near-black/55">
                        {`${adaptationsWeek[s.id] ?? 0} this week`}
                      </span>
                    ) : null}
                    <span className="flex-none text-[13px] font-semibold text-nevo-navy">
                      View profile
                    </span>
                  </Link>
                ))
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
