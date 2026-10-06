"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, incidentId } from "@/lib/api/client";
import { awaitParseRun, contentApi } from "@/lib/api/content";
import { lessonsApi, type LessonDetailResponse } from "@/lib/api/lessons";

/**
 * Read the lesson again - the remedy for a transformation that came out wrong.
 *
 * WHY THIS IS THE PRIMARY REMEDY AND RE-UPLOAD IS THE FALLBACK (design,
 * 17 Sep). `POST /api/content/lessons/{id}/regenerate` operates on the lesson
 * ID, so it fixes the lesson IN PLACE. A teacher who regenerates never creates
 * a second copy - which does not merely give them a remedy, it removes the
 * duplicate problem entirely. Re-uploading is crude precisely because it leaves
 * two assignable lessons with the same title and nothing to tell them apart,
 * and there is still no delete on any lesson or upload route.
 *
 * It does not need the original source document: it re-runs over the lesson's
 * own stored segment text, so a lesson seeded directly regenerates fine.
 *
 * THE SHAPE IS THE UPLOAD'S, because it is the same pipeline: 202 with a
 * receipt, poll the run until `finished`, then read the lesson back. `finished`
 * covers `failed` too, so a run that genuinely could not be done arrives as a
 * run with a `failureReason` rather than as a hang.
 *
 * Polling is aborted on unmount. A teacher who navigates away mid-regenerate
 * has not cancelled the run - the backend finishes it and the lesson is
 * updated either way - but this hook stops asking.
 */

export type RegenerateState = "idle" | "running" | "failed";

export interface LessonRegenerate {
  state: RegenerateState;
  /**
   * The parse's own sentence when the re-read FAILED, from the field that
   * promises prose. It was wrapped in an error and thrown away, so a teacher
   * got a generic line while the upload screens showed the server's.
   */
  failureReason: string | null;
  /** The backend's reference for a failure, to quote in a report. */
  incident: string | null;
  /** Re-read the lesson. Ignored while one is already running. */
  run: (lessonId: string) => void;
}

export function useLessonRegenerate(
  onLesson: (lesson: LessonDetailResponse) => void,
): LessonRegenerate {
  const [state, setState] = useState<RegenerateState>("idle");
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const [incident, setIncident] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const running = useRef(false);
  const onLessonRef = useRef(onLesson);

  // In an effect, not during render: `react-hooks/refs` rejects the render-time
  // assignment, and correctly - a ref written while rendering is a value the
  // component can read before React has committed the render that set it.
  useEffect(() => {
    onLessonRef.current = onLesson;
  }, [onLesson]);

  useEffect(
    () => () => {
      abort.current?.abort();
    },
    [],
  );

  const run = useCallback((lessonId: string) => {
    // A second click while the first run is in flight would start a second
    // parse over the same lesson and race two answers into the same screen.
    if (running.current) return;
    running.current = true;
    const controller = new AbortController();
    abort.current = controller;
    setState("running");
    setFailureReason(null);
    setIncident(null);

    void contentApi
      .regenerate(lessonId)
      .then(async (accepted) => {
        const parseRun = await awaitParseRun(accepted.parseRunId, {
          signal: controller.signal,
        });
        if (parseRun.status === "failed") {
          // Kept for the screen, not only thrown: these are the run's answer.
          setFailureReason(parseRun.failureReason ?? null);
          setIncident(parseRun.incidentId ?? null);
          throw new ApiError(
            500,
            parseRun.failureReason ?? "The parse failed.",
          );
        }
        return lessonsApi.detail(accepted.lessonId);
      })
      .then((lesson) => {
        running.current = false;
        if (controller.signal.aborted) return;
        setState("idle");
        onLessonRef.current(lesson);
      })
      .catch((err: unknown) => {
        running.current = false;
        // A request that failed outright may still carry a reference.
        const ref = err instanceof ApiError ? incidentId(err.detail) : null;
        if (ref) setIncident(ref);
        // An aborted poll is not a failure the teacher should be told about:
        // they left the screen.
        if (controller.signal.aborted) return;
        setState("failed");
      });
  }, []);

  return { state, run, failureReason, incident };
}
