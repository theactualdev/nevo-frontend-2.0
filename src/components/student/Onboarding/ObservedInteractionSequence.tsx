"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useSignals, type TrackEvent } from "@/hooks";
import {
  entryIdentityFromDraft,
  rememberOnboardedStudent,
} from "@/lib/auth/onboarding";
import { bindFirstPin } from "@/lib/auth/firstPin";
import { setSession } from "@/lib/auth/session";
import { enterFirstLesson } from "@/lib/auth/entryGate";
import { useNextLessonHref } from "@/hooks/useNextLessonHref";
import {
  flushPendingBaseline,
  readPendingBaseline,
} from "@/lib/profiling/pendingBaseline";
import { ONBOARDING_SIGNAL_TYPES } from "@/lib/constants";
import { randomId } from "@/lib/utils";
import { ProfilingFlow } from "@/components/student/Profiling/ProfilingFlow";
import { TransitionScreen } from "./TransitionScreen";
import { LearningNotice } from "./LearningNotice";
import { PinCreationScreen } from "./PinCreationScreen";
import { YoureInScreen } from "./YoureInScreen";

/**
 * Onboarding Phase C — one continuous experience: a calm transition, the
 * Baseline Cognitive Profiling flow (SCRUM-104 — design retired the Observed
 * Interaction Sequence's four activities and this flow took their slot), the
 * learning notice, PIN Creation, and the "You're In" hand-off into the app.
 *
 * THE NOTICE COMES AFTER THE BASELINE, and design settled that on 1 Oct (D10).
 * The parent consents and the child is informed - two mechanisms, and the
 * notice is not a consent step. Before the activities, "Nevo will get to know
 * how you learn" is an abstraction a child has nothing to attach to; after,
 * it says what they just did was for. It was named a Consent Gate here, and
 * that framing is what once pulled it in front of the baseline.
 * Manual students arrive from 05 Entry, which matched them on the roster and
 * checked their consent first; SSO students from the callback. Only the
 * transition copy and the PIN step differ, driven by the session
 * (`user.method`), never a URL param.
 */
export function ObservedInteractionSequence() {
  const router = useRouter();
  const { user } = useAuth();
  const isSso = user?.method === "sso";
  /*
   * The identifier storing the first PIN hands back.
   *
   * A ref rather than state: it is written inside the PIN screen's own store
   * step and read in the completion that immediately follows, so it must not
   * wait for a re-render - and nothing renders from it.
   */
  const identifierRef = useRef<string | null>(null);
  /*
   * One profile-seeding session spans the whole sequence.
   *
   * The id used to be `onboarding-${uuid}`, and the prefix was fatal: the
   * ingest contract declares `sessionId` as `format: uuid`, so every
   * onboarding batch failed the client's own UUID guard and was held until
   * the screen unmounted, taking the child's whole profiling stream with it.
   * A bare UUID plus `sessionType: "onboarding"` is what the 3 Sep contract
   * asks for, and it says the same thing honestly.
   *
   * These events are captured BEFORE the account exists. `useSignals` holds
   * them rather than throwing them at a Bearer-only endpoint, and they go out
   * on the first flush after PIN completion creates the session.
   */
  const [sessionId] = useState(() => randomId());
  const { trackEvent, flush } = useSignals(sessionId, undefined, "onboarding");
  /*
   * THE BASELINE HAS A STREAM OF ITS OWN, typed `profiling` (B43, 5 Oct).
   *
   * Its markers - `baseline_module_start`, `baseline_module_complete`,
   * `baseline_submitted` - rode the `onboarding` stream above. Backend's
   * ruling: `profiling` is the assessment itself, `onboarding` is the
   * account coming into existence - entry, the consent check, PIN creation,
   * which stay up there. On `onboarding` a later re-profiling would produce
   * events indistinguishable from a child's first morning.
   *
   * Owned HERE, not by `ProfilingFlow`, for the same reason the onboarding
   * stream is: before the PIN step there is no session, so its events are
   * held, and a stream that unmounted with the run would take them with it.
   * Its id is also the run's, so the trials go up under the session their
   * markers name.
   */
  const [profilingSessionId] = useState(() => randomId());
  const profiling = useSignals(profilingSessionId, undefined, "profiling");
  const [phase, setPhase] = useState<"transition" | "activities">("transition");
  const [index, setIndex] = useState(0);
  /**
   * The capture session the profiling run parked its trials under.
   *
   * Handed to `flushPendingBaseline` so the trials have to be THIS run's every
   * time, not merely whatever is parked. Before the join path stored a
   * session, a mismatched token was doing that job by accident; it is not
   * doing it any more.
   */
  const parkedRunRef = useRef<string | null>(null);
  /** False once this sequence, and the signal stream it owns, has gone. */
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /*
   * Deliver this run's parked baseline, and only THEN say so.
   *
   * `baseline_submitted` reaches the engine since 1 Oct, and `ProfilingFlow`
   * fired it when the run was parked - a claim that was false whenever the
   * submit later failed or never came. It is tracked here instead: only when
   * `POST /api/baseline/trials` succeeded, only for the trials THIS run parked
   * (an older run in the slot is not this baseline), and only while this
   * stream still exists. Trials delivered later by `StudentShell`'s flush,
   * after this sequence has gone, send no event at all rather than one on
   * some other stream.
   *
   * On the `profiling` stream (B43), and with no payload: the catalogue
   * declares none for it. The module list it carried came from the feature
   * vector, which is gone.
   */
  const deliverBaseline = async (owner: string, run: string | null) => {
    const parked = readPendingBaseline();
    const ours = run !== null && parked?.sessionId === run;
    const ok = await flushPendingBaseline(owner, run);
    if (ok && ours && alive.current) {
      profiling.trackEvent(ONBOARDING_SIGNAL_TYPES.BASELINE_SUBMITTED);
    }
  };

  if (phase === "transition") {
    return (
      <TransitionScreen
        path={isSso ? "sso" : "manual"}
        onDone={() => setPhase("activities")}
        track={trackEvent}
      />
    );
  }

  const advance = () => setIndex((i) => i + 1);

  /*
   * An SSO child is signed in for the whole sequence and never reaches the PIN
   * step that delivers everyone else's baseline, so theirs is parked under
   * their own id and sent from here. `method: "sso"` is written only by the
   * SSO callback, and survives a reload for that same account and no other
   * (`setSession` carries it across a refresh only when the user id matches),
   * so the owner is always the account that signed in through SSO.
   */
  const ssoOwner = isSso ? (user?.id ?? null) : null;

  if (index === 0) {
    return (
      <ProfilingFlow
        track={profiling.trackEvent}
        runId={profilingSessionId}
        ownerUserId={ssoOwner}
        onDone={(runSessionId) => {
          parkedRunRef.current = runSessionId;
          if (ssoOwner) void deliverBaseline(ssoOwner, runSessionId);
          advance();
        }}
      />
    );
  }

  if (index === 1) {
    return <LearningNotice onContinue={advance} />;
  }

  if (index === 2) {
    return (
      <PinCreationScreen
        sso={isSso}
        /*
         * The child 05 matched has no session yet, so there is nothing to
         * `POST /auth/pin` against. Storing the first PIN IS what gives them
         * one, and it hands back the login identifier the next sign-in will be
         * checked against.
         *
         * `bindFirstPin` sends the pair 05 matched with the PIN (B64). Any
         * refusal rejects out of here before anything below runs, so nothing
         * is signed in, delivered or remembered, and the PIN screen shows its
         * not-saved line rather than celebrating a PIN nobody stored.
         */
        storePin={async (pin) => {
          const entry = entryIdentityFromDraft();
          // A run that did not start on 05 has nobody to attach a PIN to.
          if (!entry) throw new Error("no entry identity");
          const res = await bindFirstPin(entry, pin);
          identifierRef.current = res.loginIdentifier;
          setSession({
            token: res.session.accessToken,
            expiresAt: res.session.expiresAt,
            userId: res.session.userId,
            role: res.session.role,
          });
          /*
           * The baseline this child sat in phase 0 can now reach them.
           *
           * READ THE SECOND ARGUMENT BEFORE CHANGING ANY OF THIS. Until the
           * line above there was no session, and that absence was doing the
           * safety work: a parked vector simply could not be sent. With a
           * session, `session.userId === res.userId` is true by construction
           * and would happily send whatever is parked - including a vector the
           * PREVIOUS child on a shared tablet left behind when their warm-up
           * submit failed. So the flush is told which run parked it, and sends
           * only that one.
           */
          await deliverBaseline(res.userId, parkedRunRef.current);
          /*
           * The onboarding stream held since before the account existed can
           * now be addressed. Flushed HERE rather than on unmount: the child
           * is about to be routed into a lesson, and an unmount flush races
           * that navigation.
           */
          flush();
          profiling.flush();
        }}
        onComplete={() => {
          /*
           * The device remembers this student - but only if the server issued
           * an identifier it will recognise AND the draft carries the school
           * code that is the other half of the credential. SSO students
           * re-enter through their provider, not a PIN.
           *
           * WHEN IT CANNOT, "You're In" NO LONGER SAYS SO (D71, 6 Oct): "You're
           * In is a passive moment of success, and a line about asking for
           * help implies something has gone wrong at the exact moment nothing
           * has." It matters at the next sign-in, not this one.
           */
          if (!isSso) rememberOnboardedStudent(identifierRef.current);
          advance();
        }}
      />
    );
  }

  return <YoureInStep go={(to) => router.push(to)} track={trackEvent} />;
}

/**
 * "You're In" — the hand-off out of onboarding straight into the first lesson
 * (Product Arch B.2: land in a lesson, never an empty dashboard). B.2 asks us
 * to land them in a lesson; it does not ask us to invent one, and
 * `useNextLessonHref` is where that is decided.
 *
 * ITS OWN COMPONENT SO THE LESSON IS READ WITH A SESSION. The read sat at the
 * top of the sequence, which mounts before the account exists: with no token
 * `useLiveQuery` returns early, and nothing re-ran it when PIN creation stored
 * one. So every child went to the Lessons tab, never their first lesson.
 * Mounted here, after the account is made, the dashboard read goes out at the
 * start of the celebration and has its whole hold to land.
 */
function YoureInStep({
  go,
  track,
}: {
  go: (to: string) => void;
  track: TrackEvent;
}) {
  const firstLesson = useNextLessonHref();
  return (
    <YoureInScreen
      onDone={() => {
        /*
         * THROUGH THE CONSENT GATE, like every other door. This pushed the
         * first lesson directly - so a child who joined by link, class code or
         * school code was never checked, and one the server holds went
         * straight into a lesson. `enterFirstLesson` opens the lesson, or
         * a hold for a held child - and for one whose consent could not be
         * read, since a check that cannot complete does not open the door
         * (D69).
         */
        void enterFirstLesson(firstLesson, go);
      }}
      track={track}
    />
  );
}
