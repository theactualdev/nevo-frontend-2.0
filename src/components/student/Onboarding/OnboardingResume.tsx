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
import { getSession, getToken } from "@/lib/auth/session";
import { ONBOARDING_SIGNAL_TYPES } from "@/lib/constants";
import { flushPendingBaseline } from "@/lib/profiling/pendingBaseline";
import { randomId } from "@/lib/utils";
import { DomainProbeStep } from "@/components/student/Profiling/DomainProbeModule";
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

/** Where the server's answer starts a child, or Home when nothing is left. */
function firstStep(readiness: LearningReadiness): Step | "home" {
  if (readiness.complete) return "home";
  if (BASELINE_MODULES.some((m) => !moduleCompleted(readiness, m))) {
    return "baseline";
  }
  return moduleCompleted(readiness, DOMAIN_PROBE) ? "home" : "probe";
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
 * (`GET /api/v1/students/me/onboarding`) decides:
 *   - all four in: Home.
 *   - only Module 4 left: straight into it, then Home.
 *   - any of the first three left: the profiling run, its trials sent for
 *     this child, then Module 4, then Home.
 * A read that fails, or a Module 4 with nothing to ask, is the nothing-state:
 * no words (none is designed, and none is true for every cause) and the one
 * way out, Home - not a "you're done" this device cannot know.
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
  /** Where the child has got to, once something here has moved them on. */
  const [moved, setMoved] = useState<Step | "home" | null>(null);
  const from = readiness.data ? firstStep(readiness.data) : null;
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
          track={profiling.trackEvent}
          runId={profilingSessionId}
          ownerUserId={owner}
          onDone={(runSessionId) => {
            /*
             * Sent for this child, and only then said to be: the run parked its
             * trials under their own id, so nothing else can claim them.
             */
            if (owner && runSessionId) {
              void flushPendingBaseline(owner, runSessionId).then((ok) => {
                if (ok && alive.current) {
                  profiling.trackEvent(ONBOARDING_SIGNAL_TYPES.BASELINE_SUBMITTED);
                }
              });
            }
            setAfterBaseline(true);
            setMoved("probe");
          }}
        />
      </Letterbox>
    );
  }

  return (
    <Letterbox>
      <QuestSegments.Provider value={ONBOARDING_MODULES.length}>
        <DomainProbeStep
          stretchFirst={afterBaseline}
          track={profiling.trackEvent}
          onDone={(outcome) => {
            profiling.flush();
            setMoved(outcome === "sat" ? "home" : "nothing");
          }}
        />
      </QuestSegments.Provider>
    </Letterbox>
  );
}
