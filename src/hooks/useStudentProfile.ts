"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  conversationEvidenceApi,
  type ConversationEvidence,
  studentsApi,
  type Accommodations,
  type ConceptMasteryRow,
  type LessonProgress,
  type Recommendation,
  type StudentAdaptation,
  type StudentProfileResponse,
} from "@/lib/api/students";
import { getToken } from "@/lib/auth/session";
import { useHasSession } from "./useHasSession";

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

export interface MasteryConcept {
  conceptId: string;
  /** Resolved from `/api/concepts`; the id itself if it cannot be. */
  name: string;
  /** 0-100, as the frame's bars want. */
  understanding: number;
  reading: number;
  practiceCount: number;
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
  const tail = clear ? `, mostly about ${ranked[0][0]}` : "";
  return `Asked Nevo for help ${times} ${period}${tail}.`;
}

/** Where one background read stands. */
export type ReadState = "loading" | "ready" | "failed";

/** The reads that fill a profile in, each allowed to fail on its own. */
export interface ProfileReads {
  learnerProfile: ReadState;
  mastery: ReadState;
  recommendations: ReadState;
  adaptations: ReadState;
  accommodations: ReadState;
}

export interface StudentProfileState {
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

const pct = (p: number) => Math.round(Math.max(0, Math.min(1, p)) * 100);

export function useStudentProfile(studentId: string): StudentProfileState {
  const [profile, setProfile] = useState<StudentProfileResponse | null>(null);
  const [mastery, setMastery] = useState<ConceptMasteryRow[]>([]);
  const [evidence, setEvidence] = useState<ConversationEvidence | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [adaptations, setAdaptations] = useState<StudentAdaptation[]>([]);
  const [sessions, setSessions] = useState<LessonProgress[]>([]);
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
        if (err instanceof ApiError && err.status === 404) setMissing(true);
        else setFailed(true);
      });

    // Enrichment. Each is allowed to fail on its own - and each now SAYS
    // whether it did, rather than leaving its empty default to speak.
    const settle = (key: keyof ProfileReads, to: ReadState) => {
      if (!cancelled) setReads((r) => ({ ...r, [key]: to }));
    };
    void studentsApi
      .mastery(studentId)
      .then((rows) => {
        if (!cancelled) setMastery(rows);
        settle("mastery", "ready");
      })
      .catch(() => settle("mastery", "failed"));
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
    void studentsApi
      .adaptations(studentId)
      .then((rows) => {
        // A suppressed adaptation is one Nevo considered and withheld; the
        // section is what actually happened for this student.
        if (!cancelled) setAdaptations(rows.filter((a) => !a.suppressed));
        settle("adaptations", "ready");
      })
      .catch(() => settle("adaptations", "failed"));
    void studentsApi
      .progress(studentId)
      .then((p) => {
        if (cancelled) return;
        setSessions(
          [...p.lessons].sort(
            (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
          ),
        );
      })
      .catch(() => {});
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

  return {
    helpSeeking: helpSeekingLine(evidence),
    profile,
    concepts: mastery.map((m) => ({
      conceptId: m.conceptId,
      // Straight from the mastery read since 31 Aug. It used to be resolved
      // through a second, best-effort `/api/concepts` call whose failure was
      // swallowed - and when it failed a teacher was shown a raw UUID as the
      // name of the concept their student was struggling with.
      name: m.conceptName,
      understanding: pct(m.masteryProbabilityConcept),
      reading: pct(m.masteryProbabilityReading),
      practiceCount: m.practiceCount,
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
