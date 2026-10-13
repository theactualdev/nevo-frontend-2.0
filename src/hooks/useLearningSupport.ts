"use client";

import { useCallback } from "react";
import { learningSupportApi, type LearningSupportHolders } from "@/lib/api/learningSupport";
import { useLiveQuery } from "./useLiveQuery";

/**
 * Whether the teacher looking holds Learning Support (C20, design 12 Oct).
 *
 * `GET /api/v1/learning-support/holders` answers `viewerHoldsIt` to any school
 * member. Holding the role widens what a teacher sees - a sidebar item, and an
 * added section on a profile - and never changes how anything else is drawn.
 *
 * TRUE ONLY ON THE SERVER'S WORD. Still asking, a failed read, or no session
 * are all "not shown": C20 says that without the role the section is simply
 * absent - "no locked panel, no greyed section, no line explaining what is
 * missing" - so not knowing yet draws exactly what not holding it draws.
 */
export function useHoldsLearningSupport(): boolean {
  const run = useCallback(() => learningSupportApi.holders(), []);
  const { data } = useLiveQuery<LearningSupportHolders>(run, []);
  return data?.viewerHoldsIt === true;
}
