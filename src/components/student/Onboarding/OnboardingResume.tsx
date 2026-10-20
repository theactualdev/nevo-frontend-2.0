"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSignals } from "@/hooks";
import { useHydrated } from "@/hooks/useHydrated";
import { useLiveQuery } from "@/hooks/useLiveQuery";
import {
  DOMAIN_PROBE,
  moduleCompleted,
  ONBOARDING_MODULES,
  probeApi,
  type LearningReadiness,
} from "@/lib/api/probe";
import { planProbe, type ProbePlan } from "@/lib/api/probePlan";
import { claimMoveOn } from "@/lib/auth/onboardingGate";
import { getSession, getToken } from "@/lib/auth/session";
import { ONBOARDING_SIGNAL_TYPES } from "@/lib/constants";
import { flushPendingBaseline } from "@/lib/profiling/pendingBaseline";
import { randomId } from "@/lib/utils";
import {
  DomainProbeStep,
  type DomainProbeOutcome,
} from "@/components/student/Profiling/DomainProbeModule";
import { ProfilingFlow } from "@/components/student/Profiling/ProfilingFlow";
import { QuestSegments } from "@/components/student/Profiling/QuestMap";
import { HomeButton } from "@/components/student/Profiling/WarmUpRun";
import { Letterbox } from "@/components/student/Shell/Letterbox";

const HOME = "/student/dashboard";
/** The child's door, as `proxy.ts` sends a signed-out visitor to it. */
const SIGN_IN = "/auth/login";

/** The baseline's three, which the profiling run presents. */
const BASELINE_MODULES = ONBOARDING_MODULES.filter((m) => m !== DOMAIN_PROBE);

type Step = "baseline" | "probe" | "nothing";

/** Any of the first three is still to do, as the server holds them. */
function baselineLeft(readiness: LearningReadiness): boolean {
  return BASELINE_MODULES.some((m) => !moduleCompleted(readiness, m));
}

/**
 * Where the server's answers start a child, Home when nothing is left, or
 * null while they are still being read - and for a Module 4 with nothing to
 * ask, which is not a place to start but a move on (`moveOn`).
 */
function firstStep(
  readiness: LearningReadiness,
  plan: ProbePlan | null,
): Step | "home" | null {
  if (readiness.complete) return "home";
  if (!plan) return null;
  if (baselineLeft(readiness)) return "baseline";
  switch (plan.kind) {
    case "held":
      return "home";
    case "ask":
      return "probe";
    case "failed":
      return "nothing";
    case "unavailable":
      return null;
  }
}

/**
 * Module 4 has nothing to ask: Home, the first time this tab meets that for
 * this child, and the nothing-state every time after (`claimMoveOn`, the loop
 * guard: a server refusing their lessons for Module 4 would bring them back
 * here on every refusal). Since Teslim's 19 Oct contract the server records a
 * probe with no bank as `unavailable` and `completed`, and no longer refuses
 * for it, so the guard should not be reached that way; it stays as the guard.
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
 *   - all four in: Home.
 *   - only Module 4 left: straight into it, then Home.
 *   - any of the first three left: the profiling run, its trials sent for
 *     this child, then Module 4, then Home. Its quest map has a stop for
 *     Module 4 only if Module 4 will run.
 *
 * NOTHING TO ASK MOVES THE CHILD ON (Olayinka, 19 Oct: "an unavailable probe
 * moves the child on, never to a dead end"; Teslim's 19 Oct no-question-bank
 * exception): straight Home, replacing this route, rather than a screen to
 * dismiss. Nothing is recorded or assumed for Module 4 - no placement, no
 * completion - and the server's gate decides what Home can open. If it still
 * refuses, the child is back here, and a second arrival in the same tab stays
 * on the nothing-state rather than bouncing Home again (`claimMoveOn`).
 *
 * A READ THAT FAILS IS NOT "NOTHING TO ASK": it is the nothing-state, as it
 * was - no words (none is designed, and none is true for every cause) and the
 * one way out, Home, offered rather than taken - so a broken read is never
 * passed off as a probe with nothing in it. Not "you're done" either, which
 * this device cannot know.
 *
 * NO NOTICE, PIN OR YOU'RE IN. Those make an account, and this child has one.
 */
export function OnboardingResume() {
  const router = useRouter();
  const hydrated = useHydrated();
  const owner = hydrated ? (getSession()?.userId ?? null) : null;
  const signedOut = hydrated && !getToken();
  const run = useCallback(() => probeApi.readiness(), []);
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
    void planProbe(data).then((p) => {
      if (cancelled) return;
      setPlan(p);
      // Only Module 4 left, with nothing to ask: on, not a screen to dismiss.
      if (!baselineLeft(data) && p.kind === "unavailable") setMoved(moveOn());
    });
    return () => {
      cancelled = true;
    };
  }, [data]);

  useEffect(() => {
    // A visitor with no session has nothing to finish here, and reads nothing.
    if (signedOut) router.replace(SIGN_IN);
    else if (step === "home") router.replace(HOME);
  }, [signedOut, step, router]);

  if (signedOut || step === null || step === "home") {
    // Reading, or on the way out: nothing to show for a moment.
    return null;
  }

  if (step === "nothing") {
    return (
      <Letterbox>
        <div className="flex min-h-[100dvh] items-center justify-center bg-nevo-cream px-5 pb-10 sm:px-7">
          <HomeButton onClick={() => router.replace(HOME)} />
        </div>
      </Letterbox>
    );
  }

  if (step === "baseline") {
    return (
      <Letterbox>
        <ProfilingFlow
          // A stop for Module 4 only if it will run (design, 9 Oct: "A child
          // who will do three sees three segments"). Four when that could not
          // be read: Module 4 is tried again once the run is done.
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
            if (plan?.kind === "ask" || plan?.kind === "failed") {
              setMoved("probe");
              return;
            }
            /*
             * Nothing of Module 4 to present: on, once the baseline has gone,
             * so that its `baseline_submitted` leaves on this stream rather
             * than being dropped with it.
             */
            const to = plan?.kind === "held" ? "home" : moveOn();
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
          stretchFirst={afterBaseline}
          track={profiling.trackEvent}
          onDone={(outcome) => {
            profiling.flush();
            setMoved(afterModuleFour(outcome));
          }}
        />
      </QuestSegments.Provider>
    </Letterbox>
  );
}
