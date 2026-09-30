"use client";

import { useEffect, useRef, useState } from "react";
import { useConsentGate } from "@/hooks/useConsentGate";
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
 * The age band comes from the age the child gave at onboarding, falling back
 * to the profile label (mock: "Year 4" → P4-6) when there is no draft, and
 * drives grid sizes, content and targets; the shells are shared.
 */
export function ProfilingFlow({
  track,
  onDone,
}: {
  track?: TrackEvent;
  /**
   * The whole flow is complete - carry on to the Consent Gate.
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
   * Nothing a signed-in child can read carries an age or a year group -
   * `users/me` has neither and there is no student-facing class read - so it
   * cannot be derived. When we do not know, we ask, on the intro screen that
   * was already there. One question is cheaper than mis-pitching four modules,
   * and far cheaper than a baseline that measures the wrong child.
   */
  const [askedAge, setAskedAge] = useState("");
  const draftAge = getOnboardingDraft().age;
  const band = draftAge ? bandForAge(draftAge) : bandForAge(Number(askedAge));
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
   * THE SCREENS ARE UNCHANGED, deliberately. What a withdrawn child should
   * actually SEE is an open design question, and inventing an answer here
   * would put unreviewed copy in front of the child this protects. Stopping
   * the processing needs no ruling; changing the flow does.
   */
  const { withdrawn } = useConsentGate();
  useEffect(() => {
    if (withdrawn) void capture.purge();
  }, [withdrawn, capture]);
  /*
   * The completion screen's `saved` is left null - "still resolving" - because
   * that is now literally what it is: the vector is parked and goes out when
   * the account exists, a screen or two later. This run cannot know the answer
   * any more, and should not pretend to.
   *
   * NOTE FOR DESIGN: the settled copy reads "Your learning space has been
   * personalized", which now runs slightly ahead of the write rather than
   * alongside it. It was already shown while a submit was in flight; the
   * in-flight window is just longer. Worth a neutral phrasing if you would
   * rather it did not claim a past-tense write at all.
   */

  const finishRun = () => {
    if (!submitted.current) {
      submitted.current = true;
      if (withdrawn) {
        // Nothing is derived from the stream and nothing is parked. The raw
        // capture goes the same way it always does, and no signal is tracked
        // either - "baseline submitted" would not be true.
        void capture.purge();
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
      holdBaseline(c.sessionId, features);
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
        askAge={!draftAge}
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
