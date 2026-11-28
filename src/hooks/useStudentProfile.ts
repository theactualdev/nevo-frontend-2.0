"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  conversationEvidenceApi,
  type ConversationEvidence,
  studentsApi,
  type Accommodations,
  type ConceptLevels,
  type MasteryLevel,
  type MasteryLevelState,
  type ReadingDemand,
  type LessonProgress,
  type Recommendation,
  type StudentAdaptation,
  type StudentProfileResponse,
} from "@/lib/api/students";
import { getToken } from "@/lib/auth/session";
import { useHasSession } from "./useHasSession";
import { useHoldsLearningSupport } from "./useLearningSupport";
import { LEARNING_SUPPORT_REQUIRED, refusedWith } from "@/lib/api/learningSupport";

/**
 * One student, as their teacher can see them.
 *
 * Four reads. Only the first decides whether the page exists: identity is the
 * page, and mastery, recommendations and concept names are enrichment that a
 * profile reads perfectly well without. So a failure in any of those three
 * leaves its section absent rather than failing the screen.
 *
 * `missing` separates "no such student" from "could not load them", because
 * telling a teacher a child is gone when the network blinked is the worse
 * error - the same rule the lesson route follows.
 *
 * The learner profile is fetched but NOT surfaced: see `students.ts`. Its
 * `status` is the one part that is safe and useful, since "not observed yet"
 * is exactly what the frame's early state says.
 */

/**
 * One concept as the By Level design draws it (S21, live 27 Nov): a state per
 * curriculum level, with reading beside them. The bars, and the 0-100 this
 * used to turn the engine's probabilities into for them, are gone - S21 sends
 * no probability, and nothing here makes one.
 */
export interface MasteryConcept {
  conceptId: string;
  name: string;
  /**
   * Only the levels the engine observed something at, exactly as sent. An
   * absent level is NOT `not` - nothing is filled in here.
   */
  levels: Partial<Record<MasteryLevel, MasteryLevelState>>;
  /** Null when nothing is observed. */
  reading: ReadingDemand | null;
}

/**
 * C08's help-seeking line, or "" when there is nothing that may be said.
 *
 * The RULING (Olayinka, 30 Aug; design confirmed the wording 31 Aug): this is
 * aggregate only, never per-question, and nothing appears below the server's
 * own minimum. `privacy: "withheld_below_minimum"` is that decision arriving
 * from the server, and it is honoured as-is rather than second-guessed with a
 * local count - if it withholds, the line is absent entirely, not replaced by
 * a "not enough yet" placeholder.
 *
 * "mostly about X" is dropped on a tie or an empty map, because "mostly"
 * would then be a claim the data does not support.
 */
export function helpSeekingLine(
  ev: {
    interactionCount: number;
    periodDays: number;
    categories: Record<string, number>;
    /** The server's own words for each category key (12 Oct). */
    categoryLabels?: Record<string, string>;
    privacy: string;
  } | null,
): string {
  if (!ev || ev.privacy !== "aggregate_only" || ev.interactionCount < 1) {
    return "";
  }
  const period =
    ev.periodDays === 7
      ? "this week"
      : ev.periodDays === 14
        ? "this fortnight"
        : ev.periodDays === 30 || ev.periodDays === 31
          ? "this month"
          : `in the last ${ev.periodDays} days`;
  const times = `${ev.interactionCount} ${ev.interactionCount === 1 ? "time" : "times"}`;
  const ranked = Object.entries(ev.categories ?? {}).sort((a, b) => b[1] - a[1]);
  const clear = ranked.length > 0 && (ranked.length === 1 || ranked[0][1] > ranked[1][1]);
  /*
   * A CODE IS NOT A TOPIC (T142). The categories are an untyped map, and the
   * one vocabulary on the contract near them is Ask Nevo's own tokens -
   * `lesson_help`, `class_planning` - so this could tell a teacher a child
   * asked "mostly about lesson_help". A key with an underscore is a code, and
   * the line stops before it rather than printing it or guessing its words.
   * The words for each are a backend/design ask.
   */
  /*
   * THE SERVER NAMES THEM NOW (12 Oct): `categoryLabels` carries a phrase for
   * each key - "Lesson help", "Class planning". Lower-cased to sit inside the
   * sentence. A key it has no phrase for still stops the line before it.
   */
  const top = clear ? ranked[0][0] : null;
  const label = top ? ev.categoryLabels?.[top]?.trim() : undefined;
  const topic = label
    ? label.charAt(0).toLowerCase() + label.slice(1)
    : top && !top.includes("_")
      ? top
      : null;
  const tail = topic ? `, mostly about ${topic}` : "";
  return `Asked Nevo for help ${times} ${period}${tail}.`;
}

/** Where one background read stands. */
export type ReadState = "loading" | "ready" | "failed";

/**
 * The mastery read's refusals are their own states (Hub, 28 Nov): a 403
 * (`staff_role_required`) is "refused" and a 404 (a child outside the
 * viewer's reach) "missing" - neither one a read that a retry could land, so
 * neither draws the failure line that offers one.
 */
export type MasteryReadState = ReadState | "refused" | "missing";

/** The reads that fill a profile in, each allowed to fail on its own. */
export interface ProfileReads {
  learnerProfile: ReadState;
  mastery: MasteryReadState;
  recommendations: ReadState;
  adaptations: ReadState;
  accommodations: ReadState;
}

export interface StudentProfileState {
  /**
   * The viewer holds Learning Support (C20). Only then is adaptation history
   * read and the profile's learning support section drawn. Optional, so a
   * state built by hand - a test, the fixture - is "does not hold it".
   */
  learningSupport?: boolean;
  profile: StudentProfileResponse | null;
  concepts: MasteryConcept[];
  /** C08's aggregate help-seeking line; "" when it may not be shown. */
  helpSeeking: string;
  recommendations: Recommendation[];
  /** What Nevo adjusted, newest first, suppressed ones excluded. */
  adaptations: StudentAdaptation[];
  /** Lessons worked through, newest first. */
  sessions: LessonProgress[];
  /** What Nevo is offering, and why. Null when the read failed. */
  accommodations: Accommodations | null;
  /** `observed` once Nevo has watched enough to adapt. */
  observed: boolean;
  /**
   * WHERE EACH ENRICHMENT READ STANDS. Every one of them was swallowed, so
   * "not back yet" and "failed" both read as "nothing there" - and a child
   * with weeks of history was told, while the reads were in flight or after
   * they failed, that Nevo was "still getting to know" them, with "No profile
   * yet" under their name. Optional so a fixture state needs none: absent
   * means every read is in.
   */
  reads?: ProfileReads;
  loading: boolean;
  missing: boolean;
  failed: boolean;
}

/** Where a mastery read that did not answer leaves the section. */
function masteryNotRead(err: unknown): MasteryReadState {
  if (err instanceof ApiError && err.status === 403) return "refused";
  if (err instanceof ApiError && err.status === 404) return "missing";
  return "failed";
}

export function useStudentProfile(studentId: string): StudentProfileState {
  const [profile, setProfile] = useState<StudentProfileResponse | null>(null);
  const [mastery, setMastery] = useState<ConceptLevels[]>([]);
  const [evidence, setEvidence] = useState<ConversationEvidence | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [adaptations, setAdaptations] = useState<StudentAdaptation[]>([]);
  // Never filled on the live path - see the note where the progress read was.
  const [sessions] = useState<LessonProgress[]>([]);
  const [accommodations, setAccommodations] = useState<Accommodations | null>(
    null,
  );
  const [observed, setObserved] = useState(false);
  const [reads, setReads] = useState<ProfileReads>({
    learnerProfile: "loading",
    mastery: "loading",
    recommendations: "loading",
    adaptations: "loading",
    accommodations: "loading",
  });
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState(false);
  const signedIn = useHasSession();
  const learningSupport = useHoldsLearningSupport();
  const loading = signedIn && !profile && !missing && !failed;

  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;

    // The page itself.
    void studentsApi
      .profile(studentId)
      .then((res) => {
        if (!cancelled) setProfile(res);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        /*
         * NOT A RETRY FOR A STUDENT WHO CANNOT BE SHOWN. The spec answers a
         * malformed id with 422, and a child outside this teacher's classes
         * with 403. Both read as "we couldn't load this - try again", a retry
         * that can never work. Only an answer that might change is a retry.
         */
        /*
         * NOT "NO SUCH CHILD". Since backend ab78139 (13 Oct) this route asks
         * every staff role for Learning Support, teachers included - so a
         * class teacher without the role is refused their own pupil, and
         * reading that refusal as missing sent them to a 404. C20 says the
         * profile looks exactly as it always did without the role; until the
         * route agrees, it is a read that did not land, not a child who does
         * not exist. Raised with backend.
         */
        if (refusedWith(err, LEARNING_SUPPORT_REQUIRED)) setFailed(true);
        else if (
          err instanceof ApiError &&
          (err.status === 404 || err.status === 422 || err.status === 403)
        ) {
          setMissing(true);
        } else setFailed(true);
      });

    // Enrichment. Each is allowed to fail on its own - and each now SAYS
    // whether it did, rather than leaving its empty default to speak.
    const settle = <K extends keyof ProfileReads>(key: K, to: ProfileReads[K]) => {
      if (!cancelled) setReads((r) => ({ ...r, [key]: to }));
    };
    void studentsApi
      .masteryByLevel(studentId)
      .then((res) => {
        if (!cancelled) setMastery(Array.isArray(res?.concepts) ? res.concepts : []);
        settle("mastery", "ready");
      })
      .catch((err: unknown) => settle("mastery", masteryNotRead(err)));
    void conversationEvidenceApi
      .forStudent(studentId)
      .then((res) => {
        if (!cancelled) setEvidence(res);
      })
      .catch(() => {});
    void studentsApi
      .recommendations(studentId)
      .then((rows) => {
        if (!cancelled) setRecommendations(rows);
        settle("recommendations", "ready");
      })
      .catch(() => settle("recommendations", "failed"));
    /*
     * NO PROGRESS READ. `GET /api/students/{id}/progress` was fetched on
     * every profile open and nothing rendered it: the live profile reads the
     * real sessions list instead. A request whose answer goes nowhere is load
     * on the server and a failure nobody can see. `sessions` stays on the
     * state, empty, for the fixture profile that still reads its own.
     */
    void studentsApi
      .accommodations(studentId)
      .then((a) => {
        if (!cancelled) setAccommodations(a);
        settle("accommodations", "ready");
      })
      .catch(() => settle("accommodations", "failed"));
    void studentsApi
      .learnerProfile(studentId)
      .then((p) => {
        if (!cancelled) setObserved(p.status === "observed");
        settle("learnerProfile", "ready");
      })
      .catch(() => settle("learnerProfile", "failed"));

    return () => {
      cancelled = true;
    };
  }, [studentId]);

  /*
   * ADAPTATION HISTORY, FOR EVERY TEACHER OF THE CHILD (Lydia, 14 Oct, P1:
   * "Learning Support widens WHICH children someone sees … never a gate
   * between a teacher and their own pupils. A class teacher reaches their own
   * pupils' profile, adaptation history and flags with no role.").
   *
   * It was read only for a holder, on design's C20 note of 12 Oct, which P1
   * overtook. The server agrees with P1: the route checks access to the child
   * and asks an ADMIN for the role, not a teacher (3901b87,
   * `require_learning_support_if_admin`). Drawn as C16c for a class teacher,
   * and inside C20's section for a holder.
   */
  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    const settle = (to: ReadState) => {
      if (!cancelled) setReads((r) => ({ ...r, adaptations: to }));
    };
    void studentsApi
      .adaptations(studentId)
      .then((rows) => {
        // A suppressed adaptation is one Nevo considered and withheld; the
        // section is what actually happened for this student.
        if (!cancelled) setAdaptations(rows.filter((a) => !a.suppressed));
        settle("ready");
      })
      .catch(() => settle("failed"));
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  return {
    learningSupport,
    helpSeeking: helpSeekingLine(evidence),
    profile,
    // A concept with no name is a row with no label - nothing a teacher can
    // act on - so it is left out rather than drawn blank. The contract
    // requires the name; this is the guard for the day it doesn't arrive.
    concepts: mastery.filter((m) => m?.conceptName).map((m) => ({
      conceptId: m.conceptId,
      name: m.conceptName,
      // As sent. No level is filled in, and none is defaulted to `not`.
      levels: m.levels && typeof m.levels === "object" ? m.levels : {},
      reading: m.reading ?? null,
    })),
    recommendations,
    adaptations,
    sessions,
    accommodations,
    observed,
    reads,
    loading,
    missing,
    failed,
  };
}
