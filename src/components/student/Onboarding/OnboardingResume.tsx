"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSignals } from "@/hooks";
import { useHydrated } from "@/hooks/useHydrated";
import { useLiveQuery } from "@/hooks/useLiveQuery";
import {
  DOMAIN_PROBE,
  moduleCompleted,
  moduleUnavailable,
  ONBOARDING_MODULES,
  probeApi,
  type LearningReadiness,
} from "@/lib/api/probe";
import { planProbe, type ProbePlan } from "@/lib/api/probePlan";
import {
  claimMoveOn,
  claimReturn,
  lessonIdOf,
  wayBack,
} from "@/lib/auth/onboardingGate";
import { getSession, getToken } from "@/lib/auth/session";
import { ONBOARDING_SIGNAL_TYPES } from "@/lib/constants";
import { flushPendingBaseline } from "@/lib/profiling/pendingBaseline";
import { randomId } from "@/lib/utils";
import {
  DomainProbeStep,
  type DomainProbeOutcome,
} from "@/components/student/Profiling/DomainProbeModule";
import { ProfilingFlow } from "@/components/student/Profiling/ProfilingFlow";
import { ProbeEndState } from "@/components/student/Profiling/ProbeEndState";
import { QuestSegments } from "@/components/student/Profiling/QuestMap";
import { Letterbox } from "@/components/student/Shell/Letterbox";

const HOME = "/student/dashboard";
/** Where the nothing-state's "Go to my lessons" goes. */
const LESSONS = "/student/lessons";
/** The child's door, as `proxy.ts` sends a signed-out visitor to it. */
const SIGN_IN = "/auth/login";

/** The baseline's three, which the profiling run presents. */
const BASELINE_MODULES = ONBOARDING_MODULES.filter((m) => m !== DOMAIN_PROBE);

/**
 * `done` is Module 4 already held by the server, said before the child goes
 * on; `nothing` is the nothing-state (`ProbeEndState`).
 */
type Step = "baseline" | "probe" | "nothing" | "done";

/** Any of the first three is still to do, as the server holds them. */
function baselineLeft(readiness: LearningReadiness): boolean {
  return BASELINE_MODULES.some((m) => !moduleCompleted(readiness, m));
}

/**
 * Where the server's answers start a child: "already done" when nothing is
 * left, or null while they are still being read - and for a Module 4 with no
 * question bank, which is not a place to start but a move on (`moveOn`).
 * Nothing to ask while readiness still holds Module 4 owed (`nothingToAsk`)
 * is the nothing-state, as a failed read is: only the server's `unavailable`
 * moves a child on (Teslim, 21 Oct).
 */
function firstStep(
  readiness: LearningReadiness,
  plan: ProbePlan | null,
): Step | "home" | null {
  /*
   * Not "already done" when Module 4 is in only as `unavailable` - no bank,
   * sent `completed: true` (Teslim, 19 Oct): it was never sat, so the child
   * moves on unshown, as no bank always does.
   */
  if (readiness.complete) {
    return moduleUnavailable(readiness, DOMAIN_PROBE) ? "home" : "done";
  }
  if (!plan) return null;
  if (baselineLeft(readiness)) return "baseline";
  switch (plan.kind) {
    case "held":
      return "done";
    case "ask":
      return "probe";
    case "failed":
    case "nothingToAsk":
      return "nothing";
    case "unavailable":
      return null;
  }
}

/**
 * The server holds Module 4 as unavailable - no question bank: on, the first
 * time this tab meets that for this child, and the nothing-state every time
 * after (`claimMoveOn`, the loop guard: a server refusing their lessons for
 * Module 4 would bring them back here on every refusal). Since Teslim's 19
 * Oct contract the server records a probe with no bank as `unavailable` and
 * `completed`, and no longer refuses for it, so the guard should not be
 * reached that way; it stays as the guard.
 */
function moveOn(): "home" | "nothing" {
  return claimMoveOn(getSession()?.userId) ? "home" : "nothing";
}

/** Where a child goes once Module 4 has ended, as it ended. */
function afterModuleFour(outcome: DomainProbeOutcome): "home" | "nothing" {
  if (outcome === "sat") return "home";
  return outcome === "absent" ? moveOn() : "nothing";
}

/**
 * FINISHING ONBOARDING, FOR A CHILD WHO ALREADY HAS AN ACCOUNT (SCRUM-244).
 *
 * Lydia, 17 Oct: all four modules run before any lesson, and the server holds
 * it - a lesson read answers 409 `onboarding_required` until they are in, and
 * the client sends the child here (`onboardingDoor`). Most often that is a
 * child who onboarded before Module 4 existed, so the three are done and the
 * probe is not.
 *
 * THE SERVER SAYS WHAT IS LEFT; THIS DEVICE NEVER INFERS IT. Readiness
 * (`GET /api/v1/students/me/onboarding`), and then whether Module 4 has
 * anything to ask (`planProbe`), decide - both before anything is drawn:
 *   - all four in: "You've already done this part", then on - or straight
 *     on when Module 4 is in only as no bank.
 *   - only Module 4 left: straight into it, then on.
 *   - any of the first three left: the profiling run, its trials sent for
 *     this child, then Module 4 - or "already done" if the server holds it -
 *     then on. Its quest map has a stop for Module 4 only if Module 4 will
 *     run.
 *
 * ALREADY DONE IS SAID, NOT SKIPPED (design 5bb9ee2, 28 Oct, BP-M4-AFTER-PIN:
 * "a returning sign-in can land here; neither state is a dead end"). When the
 * server holds Module 4 done - all four in on arrival, or the probe `held` -
 * the child sees the frame's "already done" (`ProbeEndState`), and "Continue
 * to Nevo" is the way on below. The frame calls it "the backend's 409"; there
 * is no such 409 (the probe's two are `probe_subject_mismatch` and
 * `probe_item_stale`), so it is shown on readiness `completed`, the server's
 * own answer (Hub, 28 Oct). A run that has just sat Module 4 goes straight on.
 *
 * ON IS BACK TO THE PAGE THAT WAS REFUSED, else Home. On the 20 Oct
 * production run a child who tapped Start on a lesson finished the probe and
 * landed on Home instead of in the lesson. The refused page rides here as
 * `returnTo`, checked twice (`returnPathOf`, as it is sent and as it is
 * read), and every way out that means "onboarding is done" takes it: all
 * four in on arrival, Module 4 sat, Module 4 already held, and the one-time
 * move on for a Module 4 with no bank. Not the nothing-state's "Go to my
 * lessons": that is the way out of a state that may be refused again, and it
 * goes to the lessons. And once per tab per page (`claimReturn`, the 21 Oct on-screen
 * check): a page that still refuses after readiness says done sends the
 * child Home the second time, as before the way back, not round again.
 *
 * THE SERVER'S WAY BACK COMES FIRST (SCRUM-266, Teslim 21 Oct). The server
 * remembers the lesson a child was refused and names it - Module 4's finish
 * as `navigatesTo`, readiness as `returnTo` - "The frontend still has to
 * follow that destination". So "done" opens the first of: the finish's
 * `navigatesTo`, readiness's `returnTo`, the refused page, Home - each
 * checked as the refused page is, a bad one skipped (`wayBack`), and the one
 * taken still once per tab (`claimReturn`).
 *
 * AND MODULE 4 IS ASKED ABOUT THAT LESSON (SCRUM-266). A child refused a
 * lesson - the refused page is the lesson player's - has readiness read for
 * that lesson (`lessonIdOf`), and the probe asks the lesson's subject, about
 * its concepts, when the server says it can (`planProbe`). With no lesson -
 * Home refused, or a plain visit - nothing about a lesson is sent.
 *
 * NO QUESTION BANK MOVES THE CHILD ON (Olayinka, 19 Oct: "an unavailable
 * probe moves the child on, never to a dead end"; Teslim's 19 Oct
 * no-question-bank exception): straight on, replacing this route, rather than
 * a screen to dismiss. Nothing is recorded or assumed for Module 4 - no
 * placement, no completion - and the server's gate decides what can open. If
 * it still refuses, the child is back here, and a second arrival in the same
 * tab stays on the nothing-state rather than bouncing on again
 * (`claimMoveOn`).
 *
 * AND ONLY THE SERVER SAYS THERE IS NO BANK (Teslim's answers, 21 Oct). A
 * subject that answers empty, or finished before asking, is not one; the
 * plan reads readiness again and follows it (`planProbe`). If readiness still
 * holds Module 4 owed with nothing to ask, that is reported to backend and
 * the child gets the nothing-state - not a move on, and not the one-time
 * claim spent on it: Olayinka's order on those answers.
 *
 * A READ THAT FAILS IS NOT "NO BANK": it is the nothing-state - the frame's
 * "Nothing to do here right now" (5bb9ee2), which says no more than that
 * nothing can be done here now, with its one way out, "Go to my lessons",
 * offered rather than taken - so a broken read is never passed off as a move
 * on. Not "already done" either, which this device cannot know.
 *
 * NO NOTICE, PIN OR YOU'RE IN. Those make an account, and this child has one.
 */
export function OnboardingResume({
  returnTo,
}: {
  /**
   * The student page the child was refused, already checked by the route
   * (`returnPathOf`): where "done" goes when the server names nowhere, and
   * - when it is the lesson player's - the lesson Module 4 is asked about
   * (`lessonIdOf`). Absent: Home, and no lesson.
   */
  returnTo?: string;
} = {}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const owner = hydrated ? (getSession()?.userId ?? null) : null;
  const signedOut = hydrated && !getToken();
  /** The lesson onboarding is being finished for, or none. */
  const lessonId = lessonIdOf(returnTo) ?? undefined;
  const run = useCallback(
    () => (lessonId ? probeApi.readiness(lessonId) : probeApi.readiness()),
    [lessonId],
  );
  const readiness = useLiveQuery(run, [run]);
  const data = readiness.data;
  /** Whether Module 4 will run, once readiness says it is not yet done. */
  const [plan, setPlan] = useState<ProbePlan | null>(null);
  /** Where the child has got to, once something here has moved them on. */
  const [moved, setMoved] = useState<Step | "home" | null>(null);
  const from = data ? firstStep(data, plan) : null;
  const step = moved ?? (readiness.failed ? "nothing" : from);
  /** Module 4 follows a module the child has just done, so it stretches first. */
  const [afterBaseline, setAfterBaseline] = useState(false);

  /*
   * The baseline's markers and its `baseline_submitted` go on a `profiling`
   * stream of this run's own (B43), as in the sequence.
   */
  const [profilingSessionId] = useState(() => randomId());
  const profiling = useSignals(profilingSessionId, undefined, "profiling");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!data || data.complete) return;
    let cancelled = false;
    void planProbe(data, lessonId).then((p) => {
      if (cancelled) return;
      setPlan(p);
      // Only Module 4 left, and no bank: on, not a screen to dismiss.
      if (!baselineLeft(data) && p.kind === "unavailable") setMoved(moveOn());
    });
    return () => {
      cancelled = true;
    };
  }, [data, lessonId]);

  /** The way back Module 4's finish named, as sent - checked on the way out. */
  const finishedTo = useRef<string | null>(null);
  /** The way back readiness names, as sent - checked on the way out. */
  const serverReturn = data?.returnTo;

  /*
   * Where "done" goes, settled once per arrival: the claim is spent when it
   * is read, so an effect that runs again (Strict Mode, a re-render) must not
   * read it a second time and turn a first return into a Home.
   */
  const leaving = useRef<string | null>(null);
  useEffect(() => {
    // A visitor with no session has nothing to finish here, and reads nothing.
    if (signedOut) router.replace(SIGN_IN);
    else if (step === "home") {
      // Done: the server's way back, else the page they were refused, once
      // per tab - a page that still refuses sends them Home, not round again
      // (`claimReturn`).
      const back = wayBack([finishedTo.current, serverReturn], returnTo);
      leaving.current ??=
        back && claimReturn(getSession()?.userId, back) ? back : HOME;
      router.replace(leaving.current);
    }
  }, [signedOut, step, router, returnTo, serverReturn]);

  if (signedOut || step === null || step === "home") {
    // Reading, or on the way out: nothing to show for a moment.
    return null;
  }

  if (step === "nothing" || step === "done") {
    return (
      <Letterbox>
        {/* Module 4's own map, as on its question: three stops before it. */}
        <QuestSegments.Provider
          value={
            plan?.kind === "unavailable"
              ? BASELINE_MODULES.length
              : ONBOARDING_MODULES.length
          }
        >
          <ProbeEndState
            end={step}
            onGo={() =>
              step === "done" ? setMoved("home") : router.replace(LESSONS)
            }
          />
        </QuestSegments.Provider>
      </Letterbox>
    );
  }

  if (step === "baseline") {
    return (
      <Letterbox>
        <ProfilingFlow
          // A stop for Module 4 unless the server holds it unavailable
          // (design, 9 Oct: "A child who will do three sees three
          // segments"). Four when that could not be read, or when readiness
          // holds it owed with nothing to ask: Module 4 is tried again once
          // the run is done.
          segments={
            plan?.kind === "unavailable"
              ? BASELINE_MODULES.length
              : ONBOARDING_MODULES.length
          }
          track={profiling.trackEvent}
          runId={profilingSessionId}
          ownerUserId={owner}
          onDone={(runSessionId) => {
            /*
             * Sent for this child, and only then said to be: the run parked its
             * trials under their own id, so nothing else can claim them.
             */
            const delivered: Promise<void> =
              owner && runSessionId
                ? flushPendingBaseline(owner, runSessionId).then(
                    (ok) => {
                      if (ok && alive.current) {
                        profiling.trackEvent(
                          ONBOARDING_SIGNAL_TYPES.BASELINE_SUBMITTED,
                        );
                      }
                    },
                    () => {},
                  )
                : Promise.resolve();
            setAfterBaseline(true);
            /*
             * Module 4 next, unless the server holds it done or unavailable.
             * A plan that failed, or found nothing to ask while readiness
             * holds it owed, is planned again by the step after the run -
             * the server may have its bank by then - and is never a move on.
             */
            if (
              plan?.kind === "ask" ||
              plan?.kind === "failed" ||
              plan?.kind === "nothingToAsk"
            ) {
              setMoved("probe");
              return;
            }
            /*
             * Nothing of Module 4 to present: "already done" when the server
             * holds it, else on - once the baseline has gone, so that its
             * `baseline_submitted` leaves on this stream rather than being
             * dropped with it.
             */
            const to = plan?.kind === "held" ? "done" : moveOn();
            void delivered.then(() => {
              if (!alive.current) return;
              profiling.flush();
              setMoved(to);
            });
          }}
        />
      </Letterbox>
    );
  }

  return (
    <Letterbox>
      <QuestSegments.Provider value={ONBOARDING_MODULES.length}>
        <DomainProbeStep
          // What the plan found to ask, shown as read. A plan that failed
          // before the baseline run is read again by the step itself.
          openings={plan?.kind === "ask" ? plan.openings : undefined}
          lessonId={lessonId}
          stretchFirst={afterBaseline}
          track={profiling.trackEvent}
          onDone={(outcome, navigatesTo) => {
            finishedTo.current = navigatesTo ?? null;
            profiling.flush();
            setMoved(afterModuleFour(outcome));
          }}
        />
      </QuestSegments.Provider>
    </Letterbox>
  );
}
