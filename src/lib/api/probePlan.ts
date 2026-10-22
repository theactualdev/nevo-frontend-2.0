import { getToken } from "@/lib/auth/session";
import { reportProbeNothingToAsk } from "./clientErrors";
import {
  DOMAIN_PROBE,
  moduleCompleted,
  moduleUnavailable,
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
 * ONLY THE SERVER SAYS THERE IS NO BANK (Teslim's answers, 21 Oct). A
 * subject's `next` answering "finished" before any question is not one:
 * "`ProbeFinished` means the server finished that subject's run; it is not a
 * no-bank signal. Read onboarding again for the authoritative next step." Nor
 * is a subject readiness marked `probeAvailable` answering `ProbeEmpty`:
 * "availability may have changed. Refresh onboarding. If another eligible
 * subject has questions, use that subject; an empty subject alone must not
 * waive module 4." So when no subject gives a question, readiness is read
 * ONCE more and followed - its `status: "unavailable"` is the one no-bank
 * signal, done is done, and another subject with a question is asked. A
 * readiness that, read again, still holds the probe as owed with nothing to
 * ask is reported to backend and not moved past (`nothingToAsk`): Olayinka's
 * order on those answers. One re-read and no more, so two answers that
 * disagree cannot become a loop.
 *
 * The app writes no placement for any of it (Teslim, 21 Oct: "the app should
 * not write a placement"): every plan here is a read.
 *
 * Its own module, not `probe.ts`: it calls `probeApi` through the import, so
 * a test that stands in for `probeApi` stands in for it here too.
 */

/** A subject with something to ask, and the first item it asks - kept, so it is shown rather than fetched twice. */
export interface ProbeOpening {
  subject: OnboardingSubject;
  item: ProbeQuestion;
  /**
   * This is the server's suggested subject (`probeSubjectId`, Teslim 19 Oct),
   * so a child who does not choose runs it. Never this device's pick.
   */
  suggested: boolean;
}

/**
 * What the server's answers say about Module 4 for this child.
 *
 * - `held`: the server already holds it as done. Nothing to ask.
 * - `ask`: the subjects with an item to ask, in the server's order, each with
 *   that item.
 * - `unavailable`: no question bank - the server holds the probe as
 *   `status: "unavailable"` (it comes with `completed: true`), on the
 *   readiness in hand or on the one read again when nothing had a question.
 *   Never inferred from subjects with no items, `ProbeEmpty` or a finish
 *   before asking anything: the server's status is the only no-bank signal
 *   (Teslim, 21 Oct). This device records nothing for it - no completion, no
 *   placement: it moves on, and the server's gate says what happens next.
 *   (Also the signed-out walkthrough's, which reads nothing - `readProbePlan`.)
 * - `nothingToAsk`: readiness, read again, still holds the probe as owed -
 *   neither unavailable nor done - and still no subject gives a question. The
 *   server's answers disagree, so this device neither asks nor moves on: it
 *   reports it (`reportProbeNothingToAsk`), and the child gets the
 *   nothing-state, as for `failed`. Not `unavailable`: an empty subject alone
 *   must not waive Module 4.
 * - `failed`: a read failed, so this device cannot know. Not `unavailable`: a
 *   broken read is not permission to move on as though nothing were there.
 */
export type ProbePlan =
  | { kind: "held" }
  | { kind: "ask"; openings: ProbeOpenings }
  | { kind: "unavailable" }
  | { kind: "nothingToAsk" }
  | { kind: "failed" };

/** At least one: a plan with nothing in it to ask is never `ask`. */
export type ProbeOpenings = [ProbeOpening, ...ProbeOpening[]];

/**
 * One readiness, read through: the server's status, then each subject it
 * says has items. Undefined when nothing gave a question and no read failed -
 * the case Teslim's 21 Oct answers send back to readiness.
 *
 * `next` is the server's read of where this child's run is - a GET that writes
 * nothing (`probe.next_question`) - so it is asked of every subject the
 * readiness says has items, in parallel, and a subject is offered only if it
 * answered with an item.
 *
 * UNAVAILABLE BEFORE COMPLETED. The server sends a probe with no bank as
 * `completed: true, status: "unavailable"` (Teslim, 19 Oct). Read as held,
 * it ended Module 4 as sat, and the quest map kept a fourth stop for a
 * module that never ran - against design's 9 Oct rule, "A child who will do
 * three sees three segments".
 */
async function planFrom(
  readiness: LearningReadiness,
): Promise<ProbePlan | undefined> {
  if (moduleUnavailable(readiness, DOMAIN_PROBE)) return { kind: "unavailable" };
  if (moduleCompleted(readiness, DOMAIN_PROBE)) return { kind: "held" };
  const open = readiness.subjects.filter((s) => s.probeAvailable);

  const firsts = await Promise.allSettled(
    open.map((s) => probeApi.next(s.subjectId)),
  );
  const openings: ProbeOpening[] = [];
  let failed = false;
  firsts.forEach((first, i) => {
    if (first.status === "rejected") failed = true;
    else if (probeStepKind(first.value) === "question") {
      openings.push({
        subject: open[i],
        item: first.value as ProbeQuestion,
        suggested: open[i].subjectId === readiness.probeSubjectId,
      });
    }
  });
  const [first, ...rest] = openings;
  if (first) return { kind: "ask", openings: [first, ...rest] };
  return failed ? { kind: "failed" } : undefined;
}

/**
 * The plan, from a readiness already in hand. Never rejects.
 *
 * NOTHING TO ASK IS NOT NO BANK (Teslim, 21 Oct). When no subject gives a
 * question - none marked `probeAvailable`, or each answering `ProbeEmpty` or
 * a finish - readiness is read ONCE more and followed, as the first was:
 * unavailable, held, or the subjects it now marks with a question asked,
 * `suggested` taken from ITS `probeSubjectId`. A re-read that cannot be read,
 * or a `next` that rejects with nothing asked, is `failed`. Still nothing, and
 * it is `nothingToAsk`, reported once for the page - not a third read, and
 * not a move on.
 */
export async function planProbe(readiness: LearningReadiness): Promise<ProbePlan> {
  const plan = await planFrom(readiness);
  if (plan) return plan;

  let reread: LearningReadiness;
  try {
    reread = await probeApi.readiness();
  } catch {
    return { kind: "failed" };
  }
  const followed = await planFrom(reread);
  if (followed) return followed;

  reportProbeNothingToAsk({
    subjectIds: reread.subjects
      .filter((s) => s.probeAvailable)
      .map((s) => s.subjectId),
    status: reread.modules.find((m) => m.id === DOMAIN_PROBE)?.status,
  });
  return { kind: "nothingToAsk" };
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
