"use client";

import { useEffect, useState } from "react";
import { intelligenceApi, type AttentionFlag } from "@/lib/api/intelligence";
import {
  classInsightsApi,
  type ClassInsightState,
  type ClassInsightsNarrative,
  type ClassMasteryRow,
  type ClassMisconception,
} from "@/lib/api/students";
import { getToken } from "@/lib/auth/session";
import { useHasSession } from "./useHasSession";
import { useStudentDirectory } from "./useStudentDirectory";

/**
 * C09 Insights for one class, from four reads.
 *
 * The three reads are `misconceptions/class` (the misconception section
 * outright), `mastery/class` (the class-mastery panel, and unlike the
 * per-student read it carries `conceptName`), and the flags endpoint filtered
 * by class.
 *
 * "THERE IS NO `/classes/{id}/insights`" WAS TRUE AND IS NOT ANY MORE - checked
 * against the deployed spec on 16 Sep. `GET /api/v1/classes/{class_id}/insights`
 * exists and returns `ClassInsightsNarrativeResponse {classId, className,
 * weeklySummary, lookingAhead, generatedAt}` - which is C09's written summary
 * and C14 A2's "looking ahead", the two things the next paragraph used to call
 * sourceless, by name. Nothing in `src/` calls it yet; `classInsightsApi` wraps
 * only misconceptions and mastery. `CONSOLE_INVENTORY.md` has recorded it as
 * landed since 15 Sep, so this docblock was the stale half.
 *
 * THE FOURTH READ IS THAT NARRATIVE, as of 21 Sep, and it closes a breach
 * this hook shipped. `empty` was computed here from three array lengths -
 * a threshold in the client, which frontend section 6 rules out, and which
 * could not tell a settled week from a new class. A class having a good
 * week was told insights were still being gathered.
 *
 * `ClassInsightState` now arrives from the engine with three values, and
 * the contract's own description of the enum is that defect written down:
 * "The engine owns the threshold and the copy; the client renders what it
 * is given."
 *
 * WHAT STILL HAS NO SOURCE: the per-student recommendations, which still fan
 * out. That stays absent rather than becoming invented prose about a real
 * class.
 *
 * Each read stands alone: a class can have mastery and no misconceptions, and
 * one failing must not empty the others.
 */

export interface InsightsConcept {
  conceptId: string;
  name: string;
  /** 0-100, as the dual-track bars want. */
  understanding: number;
  reading: number;
  studentCount: number;
}

export interface InsightsFlag {
  id: string;
  name: string | null;
  note: string;
  isSudden: boolean;
}

export interface ClassInsightsState {
  misconceptions: ClassMisconception[];
  concepts: InsightsConcept[];
  flags: InsightsFlag[];
  loading: boolean;
  /** The engine's own reading of the week. Absent until it answers. */
  state: ClassInsightState | null;
  /** C09's written summary, straight from the engine. */
  summary: string | null;
  /** C14 A2's forward look. */
  lookingAhead: string | null;
  /**
   * The engine says this class is still gathering. NOT a count of rows:
   * that arithmetic was the breach this hook shipped.
   */
  gathering: boolean;
  /** A calm week with a summary to show, which is not the same thing. */
  settledWeek: boolean;
  /** Every read FAILED. Never the same thing as a quiet class. */
  failed: boolean;
  /**
   * The narrative read failed on its own. The three lists may still have
   * landed, so this is not `failed` - but nothing may claim the class is
   * quiet on the strength of a request that did not arrive.
   */
  narrativeFailed: boolean;
}

const pct = (p: number) => Math.round(Math.max(0, Math.min(1, p)) * 100);

function suddenish(flagType: string): boolean {
  const t = flagType.toLowerCase();
  return ["sudden", "drop", "stall", "stopped", "disengag"].some((w) =>
    t.includes(w),
  );
}

export function useClassInsights(classId: string | null): ClassInsightsState {
  const [misconceptions, setMisconceptions] = useState<ClassMisconception[]>([]);
  const [mastery, setMastery] = useState<ClassMasteryRow[]>([]);
  const [flags, setFlags] = useState<AttentionFlag[]>([]);
  const [narrative, setNarrative] = useState<ClassInsightsNarrative | null>(
    null,
  );
  const [narrativeFailed, setNarrativeFailed] = useState(false);
  const [settled, setSettled] = useState(0);
  const [failures, setFailures] = useState(0);
  const signedIn = useHasSession();
  const { students } = useStudentDirectory();

  useEffect(() => {
    if (!classId || !getToken()) return;
    let cancelled = false;
    // No resets here: `LiveClassInsights` is keyed by class id, so switching
    // class remounts this with fresh state. Clearing it from the effect body
    // would be a setState during render's shadow, which this codebase rules
    // out - and the key is the better answer anyway.
    const done = () => {
      if (!cancelled) setSettled((n) => n + 1);
    };
    // A read that FAILED is not a class with nothing to show. Counting them
    // separately is what keeps "we couldn't load this" out of the mouth of
    // "this class is just getting started".
    const fail = () => {
      if (!cancelled) setFailures((n) => n + 1);
    };

    void classInsightsApi
      .misconceptions(classId)
      .then((rows) => {
        if (!cancelled) setMisconceptions(rows);
      })
      .catch(fail)
      .finally(done);
    void classInsightsApi
      .mastery(classId)
      .then((rows) => {
        if (!cancelled) setMastery(rows);
      })
      .catch(fail)
      .finally(done);
    void intelligenceApi
      .getFlags({ classId })
      .then((rows) => {
        if (!cancelled) setFlags(rows.filter((f) => !f.acknowledged));
      })
      .catch(fail)
      .finally(done);
    void classInsightsApi
      .narrative(classId)
      .then((res) => {
        if (!cancelled) setNarrative(res);
      })
      .catch(() => {
        // Deliberately NOT counted with the other three. Those three
        // failing means the class could not be read at all; this one
        // failing means the written week is missing from a screen that
        // still has its sections.
        if (!cancelled) setNarrativeFailed(true);
      })
      .finally(done);

    return () => {
      cancelled = true;
    };
  }, [classId]);

  const byId = new Map(students.map((s) => [s.studentId, s]));
  const loading = Boolean(classId) && signedIn && settled < 4;

  // Every read failed: say so, rather than describing an empty class.
  const allFailed = !loading && failures === 3;

  return {
    failed: allFailed,
    misconceptions,
    concepts: mastery.map((m) => ({
      conceptId: m.conceptId,
      name: m.conceptName,
      understanding: pct(m.masteryProbabilityConcept),
      reading: pct(m.masteryProbabilityReading),
      studentCount: m.studentCount,
    })),
    flags: flags.map((f) => ({
      id: f.id,
      name: byId.get(f.studentId)?.name ?? null,
      note: f.description,
      isSudden: suddenish(f.flagType),
    })),
    loading,
    /*
     * WHAT THE ENGINE SAID, and nothing derived from what we happen to
     * hold. An absent `state` is `summary` by the schema's own default -
     * a server that says nothing is not a server saying it does not know.
     */
    state: narrative ? (narrative.state ?? "summary") : null,
    summary: narrative?.weeklySummary ?? null,
    lookingAhead: narrative?.lookingAhead ?? null,
    gathering: !loading && narrative?.state === "gathering",
    settledWeek: !loading && narrative?.state === "settled",
    narrativeFailed,
  };
}
