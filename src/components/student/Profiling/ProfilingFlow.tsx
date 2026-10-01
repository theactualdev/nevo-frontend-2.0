"use client";

import { useEffect, useRef, useState } from "react";
import { useConsentGate } from "@/hooks/useConsentGate";
import { useRosterBand } from "@/hooks/useRosterBand";
import { holdBaseline } from "@/lib/profiling/pendingBaseline";
import { ONBOARDING_SIGNAL_TYPES } from "@/lib/constants";
import { bandForAge, gridSpanConfig } from "@/lib/profiling/bands";
import { getOnboardingDraft } from "@/lib/auth/onboarding";
import {
  BaselineCapture,
  reduceGridSpan,
  reduceRunContext,
  reduceTrialModule,
} from "@/lib/profiling/capture";
import { randomId } from "@/lib/utils";
import type { TrackEvent } from "@/hooks";
import { DomainProbeModule } from "./DomainProbeModule";
import { GridSpanModule } from "./GridSpanModule";
import { PatternFlankerModule } from "./PatternFlankerModule";
import { ProfilingIntro } from "./ProfilingIntro";
import { SentenceDotModule } from "./SentenceDotModule";
import { StretchInterstitial } from "./StretchInterstitial";

/**
 * The Baseline Cognitive Profiling flow (SCRUM-104) - onboarding Phase C.
 * Intro → M1 Grid Span → stretch → M2 Pattern/Flanker → stretch → M3
 * Sentence/Dot → stretch → M4 Domain Probe → Complete. One BaselineCapture
 * spans the run; on completion the raw stream is reduced to a feature vector,
 * submitted, and purged - raw interaction data never leaves the device.
 *
 * The age band comes from the roster for a child already signed in, else from
 * the age the child gave at onboarding, else from the intro's age question; it
 * drives grid sizes, content and targets, and the shells are shared.
 */
export function ProfilingFlow({
  track,
  onDone,
  ownerUserId = null,
}: {
  track?: TrackEvent;
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
   * `runSessionId` is the capture session this run parked its vector under, or
   * null if nothing was parked. The caller hands it back to
   * `flushPendingBaseline`, which is what proves the vector belongs to the
   * child who just sat it rather than to whoever used this device last.
   */
  onDone: (runSessionId: string | null) => void;
}) {
  /** The capture session this run parked, if it parked one. */
  const parkedRunRef = useRef<string | null>(null);
  const [phase, setPhase] = useState<
    | "intro"
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
   * no owner) and their Step 1 age decides.
   *
   * When neither says, we ask, on the intro screen that was already there. One
   * question is cheaper than mis-pitching four modules, and far cheaper than a
   * baseline that measures the wrong child. Asked only once the roster read
   * has settled without a band, so a child with one never sees the question.
   */
  const [askedAge, setAskedAge] = useState("");
  const draftAge = getOnboardingDraft().age;
  const roster = useRosterBand(ownerUserId);
  const band =
    roster.band ??
    (draftAge ? bandForAge(draftAge) : bandForAge(Number(askedAge)));
  /**
   * The roster has not answered, so the band is not known: nothing to ask and
   * nothing to start - not even on a Step 1 age, which the roster outranks.
   */
  const bandPending = !roster.settled;
  const askAge = roster.settled && !roster.band && !draftAge;
  const [capture] = useState(
    () => new BaselineCapture(`baseline-${randomId()}`),
  );
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
   * THE SCREENS ARE UNCHANGED, deliberately. What a withdrawn child should
   * actually SEE is an open design question, and inventing an answer here
   * would put unreviewed copy in front of the child this protects. Stopping
   * the processing needs no ruling; changing the flow does.
   */
  const { withdrawn } = useConsentGate();
  useEffect(() => {
    if (withdrawn) void capture.stop();
  }, [withdrawn, capture]);
  /*
   * The completion screen's `saved` is left null - "still resolving" - because
   * that is now literally what it is: the vector is parked and goes out when
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
        // capture goes the same way it always does, and no signal is tracked
        // either - "baseline submitted" would not be true.
        void capture.stop();
        setPhase("complete");
        return;
      }
      const features = [
        // Which band's items and which subject produced the numbers below.
        reduceRunContext(capture),
        reduceGridSpan(capture),
        reduceTrialModule(capture, "pattern_flanker"),
        reduceTrialModule(capture, "sentence_dot"),
        reduceTrialModule(capture, "domain_probe"),
      ];
      const c = capture;
      /*
       * PARKED, NOT SENT. `POST /api/baseline/submit` is Bearer, and this run
       * is phase 0 of the sequence - the account is not created until phase 2.
       * So this used to post with no token, take the 401 as final
       * (`submitWithRetry` does not retry a 4xx), and purge the capture in a
       * `.finally()` regardless: the whole measurement gone, in the run that
       * happens once, for every child except those arriving by SSO.
       *
       * On a shared tablet it was worse than lost. `/student/onboarding` lets a
       * signed-in child through, so a token the previous child left behind made
       * this SUCCEED - writing one child's cognitive assessment to another
       * child's account.
       *
       * `flushPendingBaseline` sends it once an account exists and can be shown
       * to be this child's. The raw capture still never leaves the device and
       * is still purged the moment it has been reduced.
       */
      holdBaseline(c.sessionId, features, ownerUserId);
      // Remembered so the account this run goes on to create can prove the
      // vector is its own. Nothing else may send it.
      parkedRunRef.current = c.sessionId;
      void c.purge();
      track?.(ONBOARDING_SIGNAL_TYPES.BASELINE_SUBMITTED, {
        modules: features.map((f) => f.module),
      });
    }
    setPhase("complete");
  };

  if (phase === "intro") {
    return (
      <ProfilingIntro
        askAge={askAge}
        waiting={bandPending}
        age={askedAge}
        onAgeChange={setAskedAge}
        mode="intro"
        onContinue={() => {
          track?.(ONBOARDING_SIGNAL_TYPES.BASELINE_MODULE_START, {
            module: "grid_span",
            band,
          });
          capture.record("run_start", { band });
          setPhase("m1");
        }}
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
            module: "grid_span",
          });
          setPhase("stretch1");
        }}
      />
    );
  }

  const startSignal = (module: string) =>
    track?.(ONBOARDING_SIGNAL_TYPES.BASELINE_MODULE_START, { module, band });
  const completeSignal = (module: string) =>
    track?.(ONBOARDING_SIGNAL_TYPES.BASELINE_MODULE_COMPLETE, { module });

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
