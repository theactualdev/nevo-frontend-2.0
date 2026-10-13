"use client";

import { useEffect, useState } from "react";
import { baselineApi, type RecalibratePrompt } from "@/lib/api/baseline";
import { getSession } from "@/lib/auth/session";
import {
  BASELINE_DIMENSIONS,
  type BaselineDimension,
} from "@/lib/profiling/bands";
import { useHasSession } from "./useHasSession";
import { useHydrated } from "./useHydrated";

/** The namespace of a device-task day's `itemId` (B79): never a probe item. */
const DEVICE_TASK_ID = "device:";

/** A question the engine served with the day's dimension. No answer key. */
export interface WarmUpItem {
  itemId: string;
  question: string;
  options: { value: string; label: string }[];
}

/**
 * What today's warm-up is, as far as anyone has said.
 *
 *  - `waiting`: nobody has answered yet (before hydration, or the read is in
 *    flight).
 *  - `none`: a signed-in child, and the engine named nothing this screen can
 *    run - the read failed, or the dimension is not one of our six, or the
 *    day's task is the question and none was served.
 *  - `ready`: run this. `live` is false only for the signed-out walkthrough.
 *
 * `doneToday` is the account's answer to "has this child done today's?" (B10,
 * 1 Oct), whenever the read answered with one. Absent means nobody said: the
 * read failed, or the deployment predates the field. See `warmUpDoneFor`.
 */
export type WarmUpPrompt =
  | { state: "waiting" }
  | { state: "none"; doneToday?: boolean }
  | {
      state: "ready";
      dimension: BaselineDimension;
      item: WarmUpItem | null;
      live: boolean;
      doneToday?: boolean;
    };

/**
 * Today's warm-up, from the engine - and nothing in its place for a child.
 *
 * `GET /api/baseline/recalibrate-prompt/{student_id}` knows what the engine
 * wants recalibrated next. This used to start every run on a weekday rotation
 * and swap to the engine's answer if one arrived: so a failed, slow or
 * unrecognised prompt ran a task the engine never asked for and SUBMITTED it
 * as a measurement, and a late answer changed the task mid-run. The engine
 * decides; until it has, a signed-in child gets the nothing-state (rule 5).
 *
 * The rotation now serves the signed-out walkthrough only, where there is no
 * engine to ask and nothing is measured.
 */
export function useWarmUpPrompt(visitor: BaselineDimension): WarmUpPrompt {
  const hydrated = useHydrated();
  const signedIn = useHasSession();
  const [answer, setAnswer] = useState<WarmUpPrompt | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    const session = getSession();
    let cancelled = false;
    void (
      session
        ? baselineApi.recalibratePrompt(session.userId)
        : Promise.reject(new Error("no session"))
    )
      .then((res) => {
        if (!cancelled) setAnswer(toPrompt(res));
      })
      .catch(() => {
        // A failed read names no task. It is not a reason to invent one.
        if (!cancelled) setAnswer({ state: "none" });
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  if (!hydrated) return { state: "waiting" };
  if (!signedIn) {
    return { state: "ready", dimension: visitor, item: null, live: false };
  }
  return answer ?? { state: "waiting" };
}

/**
 * The served prompt as something the run can render, or `none`.
 *
 * A QUESTION ONLY WHEN `served` SAYS ONE WAS SERVED (B65, 5 Oct). `question`
 * and `options` became optional with the flag beside them, because only the
 * question task has a question and requiring them of all six made the other
 * five look like served questions with nothing in them. So the flag decides,
 * not the dimension and not whatever text happens to be present; an absent
 * flag is a deployment that does not say, and is not read as served.
 *
 * A DEVICE DAY'S ID IS NEVER A SERVED ITEM (B79, B81, 8 Oct). A served item's
 * `itemId` is a probe-bank UUID; a device-task day's sits in the explicit
 * `device:*` namespace and always comes with `served: false`. Should the two
 * ever disagree, the namespace wins: an id that names a device task is run as
 * that task, and is never shown as a question or sent as a probe item.
 */
export function toPrompt(res: Partial<RecalibratePrompt>): WarmUpPrompt {
  const dimension = res.dimension;
  // Only a boolean is an answer. Absent is a deployment that does not say.
  const done =
    typeof res.doneToday === "boolean" ? { doneToday: res.doneToday } : {};
  if (
    typeof dimension !== "string" ||
    !(BASELINE_DIMENSIONS as readonly string[]).includes(dimension)
  ) {
    return { state: "none", ...done };
  }
  const options = Array.isArray(res.options)
    ? res.options.filter(
        (o) =>
          typeof o?.value === "string" &&
          typeof o?.label === "string" &&
          o.label.trim() !== "",
      )
    : [];
  const served = res.served === true;
  const item: WarmUpItem | null =
    served &&
    typeof res.itemId === "string" &&
    res.itemId !== "" &&
    !res.itemId.startsWith(DEVICE_TASK_ID) &&
    typeof res.question === "string" &&
    res.question.trim() !== "" &&
    options.length >= 2
      ? {
          itemId: res.itemId,
          question: res.question,
          options: options.map(({ value, label }) => ({ value, label })),
        }
      : null;
  // The subject-knowledge task has no device version: it IS a served
  // question. Without one there is nothing to ask, and the frame's fixture is
  // not this child's question.
  if (dimension === "domain" && !item) return { state: "none", ...done };
  return {
    state: "ready",
    dimension: dimension as BaselineDimension,
    item,
    live: true,
    ...done,
  };
}
