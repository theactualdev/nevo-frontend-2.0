"use client";

import { useEffect, useRef, useState } from "react";
import { useConsentGate } from "@/hooks/useConsentGate";
import { useRosterBand } from "@/hooks/useRosterBand";
import { formFactor } from "@/hooks/useSignals";
import { holdBaseline } from "@/lib/profiling/pendingBaseline";
import { ONBOARDING_SIGNAL_TYPES } from "@/lib/constants";
import {
  AGE_BANDS,
  bandForRoster,
  gridSpanConfig,
  type AgeBand,
} from "@/lib/profiling/bands";
import { getOnboardingDraft } from "@/lib/auth/onboarding";
import {
  BaselineCapture,
  baselineRunContext,
  baselineTrials,
} from "@/lib/profiling/capture";
import { randomId } from "@/lib/utils";
import type { TrackEvent } from "@/hooks";
import { DomainProbeModule } from "./DomainProbeModule";
import { GridSpanModule } from "./GridSpanModule";
import { MotorStep, motorStepRuns, type FormFactor } from "./MotorStep";
import { PatternFlankerModule } from "./PatternFlankerModule";
import { ProfilingIntro } from "./ProfilingIntro";
import { SentenceDotModule } from "./SentenceDotModule";
import { StretchInterstitial } from "./StretchInterstitial";

/**
 * The band for a child the server gives none: Primary 4-6, the band the
 * warm-up runs without one (D139). See `band` below for why it is not asked.
 */
const NO_BAND: AgeBand = AGE_BANDS.P46;

/**
 * The Baseline Cognitive Profiling flow (SCRUM-104) - onboarding Phase C.
 * Intro → motor-speed step (08a) → M1 Grid Span → stretch → M2
 * Pattern/Flanker → stretch → M3 Sentence/Dot → stretch → M4 Domain Probe →
 * Complete. One BaselineCapture spans the run; on completion it becomes one
 * trial per answer, the motor step's taps included, parked to be sent raw for
 * the server to reduce (B9), and the rest of the stream is purged.
 *
 * The age band is the server's: the roster's for a child already signed in,
 * else the entry lookup's, else Primary 4-6 - never from a question to the
 * child (D153); it drives grid sizes, content and targets, and the shells are
 * shared.
 */
export function ProfilingFlow({
  track,
  onDone,
  ownerUserId = null,
  runId,
}: {
  /**
   * The baseline's markers go here: a `profiling` stream, not the onboarding
   * sequence's `onboarding` one (B43, 5 Oct). They are measurements, and on
   * onboarding a later re-profiling would look like a child's first morning.
   */
  track?: TrackEvent;
  /**
   * The id this run's trials go up under - the caller's `profiling` stream's,
   * so the trials and the markers of one run name the same session. A run of
   * its own when none is given.
   */
  runId?: string;
  /**
   * The child sitting this run, when that is already known - which is only
   * true for a child who arrived by SSO and so is signed in throughout.
   *
   * AN SSO CHILD'S BASELINE WAS NEVER DELIVERED. It was parked with no owner,
   * which only the run's own PIN step can claim (`storePin` flushes it with
   * this run's id) - and an SSO child skips that step. Nothing else may send
   * an ownerless vector, so it sat until it expired after seven days. Parked
   * under their id, it goes out the way a warm-up's does: the sequence flushes
   * it at the end of this run, and `StudentShell`'s flush on the next app
   * load does if that fails.
   *
   * Only the SSO path passes this. Any other "current session" here could be
   * the previous child's on a shared tablet, which is the exact mistake the
   * parking exists to prevent.
   */
  ownerUserId?: string | null;
  /**
   * The whole flow is complete - carry on to the learning notice, which comes
   * after the baseline (design, 1 Oct, D10: the parent consents, the child is
   * informed, and the notice explains what the activities just done were for).
   *
   * `runSessionId` is the capture session this run parked its trials under, or
   * null if nothing was parked. The caller hands it back to
   * `flushPendingBaseline`, which is what proves the trials belong to the
   * child who just sat them rather than to whoever used this device last.
   */
  onDone: (runSessionId: string | null) => void;
}) {
  /** The capture session this run parked, if it parked one. */
  const parkedRunRef = useRef<string | null>(null);
  const [phase, setPhase] = useState<
    | "intro"
    | "motor"
    | "m1"
    | "stretch1"
    | "m2"
    | "stretch2"
    | "m3"
    | "stretch3"
    | "m4"
    | "complete"
  >("intro");
  /*
   * THE BAND IS NEVER GUESSED FROM A FIXTURE.
   *
   * It decides the grid size, the span ceiling, whether the dual task runs and
   * which domain questions a child sees, so getting it wrong does not just skew
   * the measurement - it decides what a child is asked to do.
   *
   * The age comes from onboarding Step 1. When it is missing this fell back to
   * `bandForYearLabel(MOCK_STUDENT.subtitle)` - a FIXTURE's "Year 4" - and the
   * comment beside it named only one draft-less path, a re-run from Profile. It
   * missed the one that ships: a child arriving by SSO never sees Step 1, so
   * EVERY SSO child sat the Primary 4-6 baseline. A sixteen-year-old on a 4x4
   * grid with no dual task; a seven-year-old with SEND asked "What is 15% of
   * 200?" as their first minutes in Nevo.
   *
   * THE ROSTER'S BAND FIRST, since 1 Oct (D13, B5). The dashboard's
   * `student.ageBand` is now a closed set derived from the date of birth, so
   * for a child already signed in it is read rather than asked. That is only
   * the SSO child here, who is the only one signed in during this run and the
   * only one who never saw Step 1: everyone else's account is created at the
   * PIN step, after this, and any session the device holds before then may be
   * the previous child's - so nothing is read for them (`useRosterBand` takes
   * no owner) and the entry lookup's band decides.
   *
   * THE SERVER'S BAND, NEVER AN AGE WORKED INTO ONE HERE (backend, 9 Oct).
   * Design: "A child with no date of birth proceeds normally on their class
   * band" (D153). The entry lookup and the dashboard both carry `ageBand`,
   * derived from the date of birth or, with none, from the enrolled class
   * year. This used to band the lookup's `age` on the device, which
   * a child with no date of birth never had. `yearGroup` is not read: the
   * server has already turned it into the band.
   *
   * PRIMARY 4-6 ONLY WHEN THE SERVER GIVES NO BAND AT ALL, and the child is
   * never asked (D153, 8 Oct). The intro asked "How old are you?" here. It is
   * the band the warm-up runs when it has none (D139, `WarmUpRun`).
   */
  const entryBand = bandForRoster(getOnboardingDraft().ageBand);
  const roster = useRosterBand(ownerUserId);
  const band: AgeBand = roster.band ?? entryBand ?? NO_BAND;
  /**
   * The roster has not answered, so the band is not known: nothing to start -
   * not even on the entry lookup's band, which the roster outranks.
   */
  const bandPending = !roster.settled;
  const [capture] = useState(
    () => new BaselineCapture(runId ?? `baseline-${randomId()}`),
  );
  /** The device this run is on, read when it starts; the motor step's samples carry it. */
  const [device, setDevice] = useState<FormFactor | null>(null);
  const submitted = useRef(false);
  /*
   * A WITHDRAWN GUARDIAN STOPS THE MEASUREMENT.
   *
   * This run never asked. An SSO child is signed in throughout the sequence,
   * so the answer was knowable and was not sought: their baseline was
   * captured, reduced and parked whatever their guardian had said. Withdrawal
   * is the one consent state the frontend is entitled to act on, so this is
   * the gap that mattered most.
   *
   * `withdrawn` is false until the read answers, and false if it fails - a
   * flaky network is not a withdrawal. So there is a window, early in the run,
   * where the raw stream is still accumulating on the device. The effect below
   * empties it the moment the answer arrives, and `finishRun` derives nothing
   * and parks nothing. Blocking the whole run behind a consent read would
   * delay every child for a state almost none of them are in.
   *
   * STOPPED, NOT JUST EMPTIED. This purged once and the capture carried on:
   * every module after the withdrawal recorded again and wrote its stream
   * back to IndexedDB at its end, where it sat on a shared tablet until some
   * later run's sweep. `stop()` purges and then refuses every later record
   * and write for the rest of the run.
   *
   * WHAT THE CHILD SEES IS NOT DECIDED HERE. It is drawn now - 00e, Consent
   * Withdrawn (D117) - and every door sends a withdrawn child there
   * (`studentDestination`), as does the server's refusal of one from wherever
   * they are (B7, B44; `withdrawnDoor`). This covers the moments before
   * either: the run keeps its own screens, and records nothing.
   */
  const { withdrawn } = useConsentGate();
  useEffect(() => {
    if (withdrawn) void capture.stop();
  }, [withdrawn, capture]);
  /*
   * The completion screen's `saved` is left null - "still resolving" - because
   * that is now literally what it is: the trials are parked and go out when
   * the account exists, a screen or two later. This run cannot know the answer
   * any more, and should not pretend to.
   *
   * DESIGN RULED ON THE SETTLED COPY, 1 OCT (SCRUM-180). It read "Your
   * learning space has been personalized", a past-tense claim about a write
   * this run cannot see. It now reads "Nevo has everything it needs to set up
   * your learning space.", which is true the moment it is read.
   */

  const finishRun = () => {
    if (!submitted.current) {
      submitted.current = true;
      if (withdrawn) {
        // Nothing is derived from the stream and nothing is parked. The raw
        // capture goes the same way it always does, and nothing is parked for
        // anyone to deliver, so no "baseline submitted" can follow either.
        void capture.stop();
        setPhase("complete");
        return;
      }
      /*
       * THE TRIALS, NOT A REDUCTION (B9, 5 Oct). This built a feature vector
       * of means, accuracies and the longest span, which is the frontend
       * computing a measure of a child (frontend §3, rule 3). Each answer now
       * goes up as it happened and the server does the arithmetic.
       *
       * THE RUN'S CONTEXT GOES BESIDE THEM (B76, 8 Oct): the band it was
       * built for, the device, and whether the motor step was skipped, as
       * `run_start` and the step recorded them (`baselineRunContext`). The
       * band no longer rides `baseline_module_start`: see `startGridSpan`.
       */
      const trials = baselineTrials(capture);
      const context = baselineRunContext(capture);
      const c = capture;
      /*
       * PARKED, NOT SENT. The baseline's write is Bearer, and this run is
       * phase 0 of the sequence - the account is not created until phase 2.
       * So this used to post with no token, take the 401 as final (a 4xx is
       * not retried), and purge the capture in a
       * `.finally()` regardless: the whole measurement gone, in the run that
       * happens once, for every child except those arriving by SSO.
       *
       * On a shared tablet it was worse than lost. `/student/onboarding` lets a
       * signed-in child through, so a token the previous child left behind made
       * this SUCCEED - writing one child's cognitive assessment to another
       * child's account.
       *
       * `flushPendingBaseline` sends them once an account exists and can be
       * shown to be this child's. The rest of the raw capture never leaves the
       * device and is purged the moment the trials are taken.
       */
      holdBaseline(c.sessionId, trials, ownerUserId, context);
      // Remembered so the account this run goes on to create can prove the
      // trials are its own. Nothing else may send them.
      parkedRunRef.current = c.sessionId;
      void c.purge();
      /*
       * NO `baseline_submitted` HERE. It fired at this line, on PARKING, and
       * since 1 Oct that event reaches the engine - so it told the engine the
       * baseline was in whenever the later submit failed or never happened.
       * It is now tracked by whoever delivers the parked trials, once
       * `POST /api/baseline/trials` has succeeded for this run
       * (`ObservedInteractionSequence`), and never if that stream has gone.
       */
    }
    setPhase("complete");
  };

  /*
   * Module 1 starts here, and its start is signalled here, not on "Let's go":
   * the motor step sits between the two, and a start stamped before it would
   * fold the step into Module 1's time.
   *
   * THE CATALOGUE'S KEY AND NOTHING ELSE. `baseline_module_start` and
   * `baseline_module_complete` declare one payload key, `moduleId`
   * (`GET /api/signals/catalogue`). Both sent `module`, which it does not
   * name, and the start an undeclared `band` too. The band has no declared
   * home on either event; it goes beside the trials (B76, `finishRun`).
   */
  const startGridSpan = () => {
    track?.(ONBOARDING_SIGNAL_TYPES.BASELINE_MODULE_START, {
      moduleId: "grid_span",
    });
    setPhase("m1");
  };

  if (phase === "intro") {
    return (
      <ProfilingIntro
        waiting={bandPending}
        mode="intro"
        onContinue={() => {
          // The device, read once here, goes beside the trials (B76).
          const on = formFactor();
          capture.record("run_start", { band, formFactor: on });
          /*
           * THE MOTOR STEP COMES FIRST, on every path into the baseline (08a,
           * D12): after this intro and before the first timed activity. A
           * cursor device skips it, because a click is not a reach and 08a
           * does not draw one - the skip and its reason are recorded, so the
           * engine is told rather than left to find no samples.
           */
          if (motorStepRuns(on)) {
            setDevice(on);
            setPhase("motor");
            return;
          }
          capture.record("motor_skipped", { reason: "cursor", formFactor: on });
          startGridSpan();
        }}
      />
    );
  }

  if (phase === "motor" && device) {
    return (
      <MotorStep
        band={band}
        formFactor={device}
        capture={capture}
        onComplete={startGridSpan}
      />
    );
  }

  if (phase === "m1") {
    return (
      <GridSpanModule
        config={gridSpanConfig(band)}
        capture={capture}
        onComplete={() => {
          track?.(ONBOARDING_SIGNAL_TYPES.BASELINE_MODULE_COMPLETE, {
            moduleId: "grid_span",
          });
          setPhase("stretch1");
        }}
      />
    );
  }

  const startSignal = (moduleId: string) =>
    track?.(ONBOARDING_SIGNAL_TYPES.BASELINE_MODULE_START, { moduleId });
  const completeSignal = (moduleId: string) =>
    track?.(ONBOARDING_SIGNAL_TYPES.BASELINE_MODULE_COMPLETE, { moduleId });

  if (phase === "stretch1") {
    return (
      <StretchInterstitial
        filled={1}
        active={1}
        onDone={() => {
          startSignal("pattern_flanker");
          setPhase("m2");
        }}
      />
    );
  }

  if (phase === "m2") {
    return (
      <PatternFlankerModule
        band={band}
        capture={capture}
        onComplete={() => {
          completeSignal("pattern_flanker");
          setPhase("stretch2");
        }}
      />
    );
  }

  if (phase === "stretch2") {
    return (
      <StretchInterstitial
        filled={2}
        active={2}
        onDone={() => {
          startSignal("sentence_dot");
          setPhase("m3");
        }}
      />
    );
  }

  if (phase === "m3") {
    return (
      <SentenceDotModule
        band={band}
        capture={capture}
        onComplete={() => {
          completeSignal("sentence_dot");
          setPhase("stretch3");
        }}
      />
    );
  }

  if (phase === "stretch3") {
    return (
      <StretchInterstitial
        filled={3}
        active={3}
        onDone={() => {
          startSignal("domain_probe");
          setPhase("m4");
        }}
      />
    );
  }

  if (phase === "m4") {
    return (
      <DomainProbeModule
        band={band}
        capture={capture}
        onComplete={() => {
          completeSignal("domain_probe");
          finishRun();
        }}
      />
    );
  }

  return (
    <ProfilingIntro
      mode="complete"
      onContinue={() => onDone(parkedRunRef.current)}
    />
  );
}
