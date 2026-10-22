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
  /**
   * The lesson this subject's run is asked about, sent on every `next` and
   * `answer` of it (SCRUM-266) - present only when readiness, read for that
   * lesson, says its subject is this one and has items (`lessonScope`), and
   * the lesson's own read gave this item. Absent on the unscoped fallback
   * (`planFrom`), whose answers the server would refuse with the lesson.
   */
  lessonId?: string;
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
 * The lesson Module 4 is asked about, and the one subject that asks it - or
 * null, and the probe runs as it does with no lesson (SCRUM-266).
 *
 * Teslim, 21 Oct: with a `lessonId`, readiness "returns a preferred matching
 * probeSubjectId, lessonProbeStatus", and the probe's `next` and `answer`
 * limit items to the lesson's concepts - and refuse any other subject with
 * 409 `probe_subject_mismatch`. So a run is for the lesson ONLY WHEN THE
 * SERVER SAYS ITS SUBJECT CAN BE: `lessonProbeStatus: "available"`, with
 * that subject as `probeSubjectId`. Then that subject alone is asked first,
 * with the lesson - every other would be refused - and it is the suggested
 * one. (If it has nothing on the lesson's concepts, see `planFrom`.)
 *
 * `unavailable` or `subject_unmapped` - the lesson's subject has no items, or
 * is none of the child's - is the lesson saying nothing about Module 4, which
 * the server still owes on any one subject with items (`refresh_onboarding`:
 * the module's `status` is the one no-bank signal). Asked with the lesson,
 * every subject would be refused; so it is asked without, as with no lesson,
 * and the server's module status alone decides whether it runs.
 */
function lessonScope(
  readiness: LearningReadiness,
  lessonId: string | undefined,
): { lessonId: string; subjectId: string } | null {
  if (!lessonId || readiness.lessonProbeStatus !== "available") return null;
  const subjectId = readiness.probeSubjectId;
  return subjectId ? { lessonId, subjectId } : null;
}

/** What one round of first reads found, before it is a plan. */
interface FirstReads {
  /** The subjects that answered with an item, each with that item. */
  openings: ProbeOpening[];
  /** A read was refused or never landed. */
  failed: boolean;
  /** A subject's run was finished before anything was asked. */
  finished: boolean;
}

/**
 * Each subject's first `next`, in parallel - with the lesson, when given one.
 *
 * `next` is the server's read of where this child's run is (`probe.
 * next_question`), so it is asked of every subject handed in, and a subject
 * is offered only if it answered with an item.
 */
async function readFirsts(
  readiness: LearningReadiness,
  subjects: OnboardingSubject[],
  lessonId?: string,
): Promise<FirstReads> {
  const firsts = await Promise.allSettled(
    subjects.map((s) =>
      lessonId ? probeApi.next(s.subjectId, lessonId) : probeApi.next(s.subjectId),
    ),
  );
  const found: FirstReads = { openings: [], failed: false, finished: false };
  firsts.forEach((first, i) => {
    if (first.status === "rejected") {
      found.failed = true;
      return;
    }
    const kind = probeStepKind(first.value);
    if (kind === "finished") found.finished = true;
    if (kind !== "question") return;
    found.openings.push({
      subject: subjects[i],
      item: first.value as ProbeQuestion,
      suggested: subjects[i].subjectId === readiness.probeSubjectId,
      ...(lessonId ? { lessonId } : {}),
    });
  });
  return found;
}

/** Ask what answered; failed if nothing did and a read failed; else nothing. */
function planOf({ openings, failed }: FirstReads): ProbePlan | undefined {
  const [first, ...rest] = openings;
  if (first) return { kind: "ask", openings: [first, ...rest] };
  return failed ? { kind: "failed" } : undefined;
}

/**
 * One readiness, read through: the server's status, then each subject it
 * says has items - the lesson's own first, when the server says the lesson
 * can be asked about (`lessonScope`). Undefined when nothing gave a question
 * and no read failed - the case Teslim's 21 Oct answers send back to
 * readiness.
 *
 * UNAVAILABLE BEFORE COMPLETED. The server sends a probe with no bank as
 * `completed: true, status: "unavailable"` (Teslim, 19 Oct). Read as held,
 * it ended Module 4 as sat, and the quest map kept a fourth stop for a
 * module that never ran - against design's 9 Oct rule, "A child who will do
 * three sees three segments".
 *
 * A LESSON WITH NOTHING TO ASK FALLS BACK TO ANY SUBJECT THAT HAS. The
 * server's `lessonProbeStatus: "available"` is per subject - the lesson's
 * subject has items somewhere - while its lesson-scoped `next` serves only
 * items on the lesson's own concepts. So a lesson whose concepts have none
 * answers `ProbeEmpty` beside an "available" readiness, and before this
 * fallback that was the 21 Oct dead end: the re-read said the same,
 * `nothingToAsk`, the nothing-state, and the child could never open the
 * lesson - where, unscoped, another subject had questions. Teslim's answer
 * 3, 21 Oct: "If another eligible subject has questions, use that subject;
 * an empty subject alone must not waive module 4." So an empty lesson-scoped
 * read is asked once more UNSCOPED - every subject with items, no lesson
 * sent, as with no lesson at all - and a subject that answers is run
 * unscoped throughout (the server would refuse its answers sent with the
 * lesson). Readiness keeps the lesson either way, so the way back is still
 * the lesson.
 *
 * NOT A REFUSAL, A FAILURE OR A FINISH. 409 `probe_subject_mismatch`, or a
 * read that never landed, is `failed`: a refusal is not an empty bank. And a
 * `ProbeFinished` before any question is not one either: every finish the
 * server sends from `next` has just recorded `domain_probe` as done
 * (`probe._finish`), so another subject would be a probe for a module
 * already in - Teslim's answer 2, "Read onboarding again for the
 * authoritative next step", which the caller does.
 */
async function planFrom(
  readiness: LearningReadiness,
  lessonId?: string,
): Promise<ProbePlan | undefined> {
  if (moduleUnavailable(readiness, DOMAIN_PROBE)) return { kind: "unavailable" };
  if (moduleCompleted(readiness, DOMAIN_PROBE)) return { kind: "held" };
  const open = readiness.subjects.filter((s) => s.probeAvailable);
  const scope = lessonScope(readiness, lessonId);
  if (scope) {
    const forLesson = await readFirsts(
      readiness,
      open.filter((s) => s.subjectId === scope.subjectId),
      scope.lessonId,
    );
    const emptyForLesson =
      !forLesson.openings.length && !forLesson.failed && !forLesson.finished;
    if (!emptyForLesson) return planOf(forLesson);
  }
  return planOf(await readFirsts(readiness, open));
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
 *
 * `lessonId` - onboarding finished because of that lesson (`lessonIdOf`) -
 * is the one `readiness` was read with, and the re-read is read with it too.
 * Absent, nothing about a lesson is sent anywhere.
 */
export async function planProbe(
  readiness: LearningReadiness,
  lessonId?: string,
): Promise<ProbePlan> {
  const plan = await planFrom(readiness, lessonId);
  if (plan) return plan;

  let reread: LearningReadiness;
  try {
    reread = await (lessonId
      ? probeApi.readiness(lessonId)
      : probeApi.readiness());
  } catch {
    return { kind: "failed" };
  }
  const followed = await planFrom(reread, lessonId);
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
 * nothing is read at all. Never rejects. `lessonId` as for `planProbe`.
 */
export async function readProbePlan(lessonId?: string): Promise<ProbePlan> {
  if (!getToken()) return { kind: "unavailable" };
  let readiness: LearningReadiness;
  try {
    readiness = await (lessonId
      ? probeApi.readiness(lessonId)
      : probeApi.readiness());
  } catch {
    return { kind: "failed" };
  }
  return planProbe(readiness, lessonId);
}
