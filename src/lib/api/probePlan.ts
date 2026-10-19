import { getToken } from "@/lib/auth/session";
import {
  DOMAIN_PROBE,
  moduleCompleted,
  probeApi,
  probeStepKind,
  type LearningReadiness,
  type OnboardingSubject,
  type ProbeQuestion,
} from "./probe";

/**
 * WHETHER MODULE 4 WILL RUN, FOUND OUT BEFORE ANY OF IT IS DRAWN.
 *
 * Teslim's 19 Oct plan names "the agreed no-question-bank exception, which
 * allows conservative entry without inventing a measured placement", and
 * Olayinka ruled 19 Oct: "Build module 4 so an unavailable probe moves the
 * child on, never to a dead end, and don't fill in any placement on the
 * device." So whether there is anything to ask is settled first - readiness,
 * then each subject's first `next` - and only a probe that will run is
 * presented: no stretch before a module that will not happen, and no quest
 * map stop for it.
 *
 * Its own module, not `probe.ts`: it calls `probeApi` through the import, so
 * a test that stands in for `probeApi` stands in for it here too.
 */

/** A subject with something to ask, and the first item it asks - kept, so it is shown rather than fetched twice. */
export interface ProbeOpening {
  subject: OnboardingSubject;
  item: ProbeQuestion;
}

/**
 * What the server's answers say about Module 4 for this child.
 *
 * - `held`: the server already holds it as done. Nothing to ask.
 * - `ask`: the subjects with an item to ask, in the server's order, each with
 *   that item.
 * - `unavailable`: nothing to ask - no subject has items, or every one that
 *   should answered with none (`ProbeEmpty`) or with a finish before asking
 *   anything. The server records nothing for this child then, and neither does
 *   this device: it moves on, and the server's gate says what happens next.
 * - `failed`: a read failed, so this device cannot know. Not `unavailable`: a
 *   broken read is not permission to move on as though nothing were there.
 */
export type ProbePlan =
  | { kind: "held" }
  | { kind: "ask"; openings: ProbeOpenings }
  | { kind: "unavailable" }
  | { kind: "failed" };

/** At least one: a plan with nothing in it to ask is `unavailable`, not this. */
export type ProbeOpenings = [ProbeOpening, ...ProbeOpening[]];

/**
 * The plan, from a readiness already in hand.
 *
 * `next` is the server's read of where this child's run is - a GET that writes
 * nothing (`probe.next_question`) - so it is asked of every subject the
 * readiness says has items, in parallel, and a subject is offered only if it
 * answered with an item. Never rejects.
 */
export async function planProbe(readiness: LearningReadiness): Promise<ProbePlan> {
  if (moduleCompleted(readiness, DOMAIN_PROBE)) return { kind: "held" };
  const open = readiness.subjects.filter((s) => s.probeAvailable);
  if (open.length === 0) return { kind: "unavailable" };

  const firsts = await Promise.allSettled(
    open.map((s) => probeApi.next(s.subjectId)),
  );
  const openings: ProbeOpening[] = [];
  let failed = false;
  firsts.forEach((first, i) => {
    if (first.status === "rejected") failed = true;
    else if (probeStepKind(first.value) === "question") {
      openings.push({ subject: open[i], item: first.value as ProbeQuestion });
    }
  });
  const [first, ...rest] = openings;
  if (first) return { kind: "ask", openings: [first, ...rest] };
  return failed ? { kind: "failed" } : { kind: "unavailable" };
}

/**
 * Readiness, then the plan. A readiness that cannot be read is `failed`.
 *
 * With no session - the signed-out walkthrough - there is nothing to ask and
 * nothing is read at all. Never rejects.
 */
export async function readProbePlan(): Promise<ProbePlan> {
  if (!getToken()) return { kind: "unavailable" };
  let readiness: LearningReadiness;
  try {
    readiness = await probeApi.readiness();
  } catch {
    return { kind: "failed" };
  }
  return planProbe(readiness);
}
