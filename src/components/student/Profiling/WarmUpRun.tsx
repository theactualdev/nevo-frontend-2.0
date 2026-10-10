"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useWarmUpPrompt,
  type WarmUpItem,
  type WarmUpPrompt,
} from "@/hooks/useWarmUpDimension";
import { ArrowRight, Check } from "lucide-react";
import { cn, randomId } from "@/lib/utils";
import { baselineApi } from "@/lib/api";
import { holdBaseline } from "@/lib/profiling/pendingBaseline";
import { markWarmUpDone, warmUpDoneFor } from "@/lib/profiling/warmUpDone";
import { getSession } from "@/lib/auth/session";
import { useConsentGate } from "@/hooks/useConsentGate";
import { useHydrated } from "@/hooks/useHydrated";
import { useRosterBand } from "@/hooks/useRosterBand";
import { formFactor } from "@/hooks/useSignals";
import {
  AGE_BANDS,
  BASELINE_DIMENSIONS,
  gridSpanConfig,
  type AgeBand,
  type BaselineDimension,
  type DotPair,
} from "@/lib/profiling/bands";
import {
  BaselineCapture,
  baselineRunContext,
  baselineTrials,
  tapPoint,
} from "@/lib/profiling/capture";
import {
  CheckButton,
  DUAL_CHECK_PROMPT,
  DUAL_CHECKS,
  TILE,
} from "./GridSpanModule";
import {
  flankerTurns,
  warmUpFlanker,
  warmUpPattern,
} from "./PatternFlankerModule";
import {
  HeardPictures,
  hasSpeech,
  speak,
  stopSpeaking,
  warmUpDots,
  warmUpReading,
} from "./SentenceDotModule";

/** Where every way out of the warm-up goes (D18). */
const HOME = "/student/dashboard";

/**
 * The band the warm-up runs when the roster gives none: Primary 4-6, whose
 * version is the one the warm-up frame draws - tile memory's 4x4 grid and
 * three tiles, and "Garri is made from cassava.", P4-6's first sentence.
 *
 * IT RAN THE PROTOTYPE'S TIMES THERE, a 660ms light and an 850ms dot display,
 * which no frame states for any band. With no band it now runs P4-6's version
 * whole, its 700ms light (D72) and 600ms display (D75) included. One round
 * only; the whole run should feel like ~45 seconds, never a test.
 */
const FRAME_BAND: AgeBand = AGE_BANDS.P46;
const GAP_MS = 280;
const PICK_BEAT_MS = 440;
/**
 * The tile task's wrong tap, as tile memory has it (`GridSpanModule`, from
 * 11:225-228): the grid locks under a soft-violet ring for 1.5s, then the same
 * pattern plays again; the third miss ends the round. No slowing, in any band
 * (D74).
 */
const NUDGE_MS = 1500;
const MAX_MISSES = 3;

/** Monday 1 Jan 2024, from which school days are counted. */
const ROTATION_EPOCH = Date.UTC(2024, 0, 1);

/**
 * The signed-out walkthrough's task for a day, on the frame's school-day
 * rotation (`12 Daily Warm-Up` `rotation`: MON patterns, TUE matches, WED a
 * short read, THU counts, FRI focus, then MON a quick question). The six run
 * across school days and carry over the weekend, so they do not restart each
 * Monday; a weekend shows Friday's.
 *
 * It was `getDay() % 6`, which put Sunday first and restarted every week, so
 * the sixth task only ever fell on a Saturday.
 *
 * A signed-in child never sees this: their task is the engine's, or nothing.
 */
export function dimensionForToday(now = new Date()): BaselineDimension {
  const day = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((day - ROTATION_EPOCH) / 86_400_000);
  const weekday = ((days % 7) + 7) % 7; // 0 is Monday
  const schoolDays = Math.floor(days / 7) * 5 + Math.min(weekday, 4);
  const n = BASELINE_DIMENSIONS.length;
  return BASELINE_DIMENSIONS[((schoolDays % n) + n) % n];
}

/**
 * Daily warm-up run (`Nevo Warm-Up Run Frame`, SCRUM-104): one round of the
 * day's baseline task, stripped of the onboarding quest map - a quiet
 * "DAILY WARM-UP" header with a small ring, the activity, and the gentle
 * one-shot done state. Never reads as an assessment; nothing is marked
 * right or wrong.
 *
 * The done state is the title and "Go on", and claims no save (D80, D97, 6
 * Oct). It said "Your progress is saved" once the write landed, and design
 * dropped that line. When the write failed it is D126's save-failed state
 * (8 Oct): a neutral mark and one line, see `SaveFailedMark`. (This note used
 * to say the screen "is not wired to"
 * `POST /api/baseline/submit`. It was wired for some time; the note went
 * stale and was the reason nobody checked WHAT it was submitting, which for
 * longer still was the task name and a duration, and none of the measurement.
 * It now sends the run's trials to `POST /api/baseline/trials`, B9.)
 * The day's dimension comes from `GET /api/baseline/recalibrate-prompt/{id}`
 * and from nowhere else for a signed-in child. It used to fall back to a
 * weekday rotation whenever the prompt failed, was unrecognised or was still
 * in flight - and then SUBMIT that run as a measurement the engine never asked
 * for, and swap the task if the answer came late. Now the task waits for the
 * engine, and without an answer the screen shows the nothing-state: the
 * header, no task, and the way back to Home (see `WarmUpNothing`).
 * The rotation is for the signed-out walkthrough only.
 *
 * NOT CONDITIONAL ON LESSONS (D18, 1 Oct). Both of the screen's buttons went
 * into the day's lesson, so a child with none queued was handed nowhere to
 * go. Design: "its done button goes to the child's home rather than to a
 * lesson. A warm-up is not conditional on there being work waiting." Both go
 * Home now, whatever is queued.
 *
 * THE BAND'S OWN VERSION OF EACH TASK (D17, 1 Oct; D81, 6 Oct): "The warm-up
 * re-checks one baseline measure, so it uses that band's own version of that
 * module." See `WarmUpTask`.
 */
export function WarmUpRun({
  dimension: dimensionProp,
}: {
  /** Pins the task (tests and previews); a pinned task has no served item. */
  dimension?: BaselineDimension;
}) {
  const router = useRouter();
  const served = useWarmUpPrompt(dimensionForToday());
  const prompt: WarmUpPrompt = dimensionProp
    ? { state: "ready", dimension: dimensionProp, item: null, live: false }
    : served;
  const dimension = prompt.state === "ready" ? prompt.dimension : null;
  const item = prompt.state === "ready" ? prompt.item : null;
  /** The engine named this run, for this child - not the walkthrough, not a pin. */
  const live = prompt.state === "ready" && prompt.live;
  /** The account's answer, once the prompt has given one. */
  const doneToday = prompt.state === "waiting" ? undefined : prompt.doneToday;
  const hydrated = useHydrated();
  /*
   * The band, from the roster, for the child whose session this is. Read on
   * the client only: the session is invisible to the server. The task waits
   * for this to settle so it never starts at one size and changes to another.
   */
  const { band, settled: bandSettled } = useRosterBand(
    hydrated ? (getSession()?.userId ?? null) : null,
  );
  const [done, setDone] = useState(false);
  // null until the write settles; false means it never reached Nevo.
  const [saved, setSaved] = useState<boolean | null>(null);
  /*
   * Nothing was kept, by choice: the guardian withdrew. The done state then
   * says nothing about saving - not "Today's warm-up didn't save", which would
   * report a failure that did not happen.
   */
  const [withheld, setWithheld] = useState(false);
  /** The served question's pick, sent to the prompt's own endpoint (B8). */
  const servedPick = useRef<{ itemId: string; value: string } | null>(null);
  const [capture] = useState(() => new BaselineCapture(`warmup-${randomId()}`));
  /*
   * Withdrawal, read once per mount. A child here is always signed in, so the
   * answer is always available - unlike the onboarding run, where a school-code
   * child has no session to ask with until their account exists.
   *
   * False until the read answers and false if it fails: a flaky network is not
   * a withdrawal. The effect empties whatever accumulated in the window before
   * the answer arrived, and STOPS the capture, so nothing the child does after
   * it is recorded or written to the device either.
   */
  const { withdrawn } = useConsentGate();
  useEffect(() => {
    if (withdrawn) void capture.stop();
  }, [withdrawn, capture]);
  const started = useRef(false);
  const submitted = useRef(false);
  /*
   * A HEARD ROUND NEEDS A VOICE. P1-3's reading round is a sentence heard, as
   * in the baseline (D81). Where the device cannot speak, the baseline skips
   * that activity rather than mime it, and the warm-up shows its nothing-state
   * for the same reason: it never puts another task in place of the one the
   * engine asked for. Settled on the client only, like everything that waits
   * on `hydrated` here.
   */
  const unheard =
    dimension === "reading" &&
    !item &&
    warmUpReading(band ?? FRAME_BAND).mode === "audio" &&
    !(hydrated && hasSpeech());

  /*
   * ONE WARM-UP A DAY, AND THE CHECK HAS TO HAPPEN BEFORE THE RUN STARTS.
   *
   * It was re-sittable any number of times, and the cost was not cosmetic:
   * every run submits a measurement, so a child who
   * opened it four times sent four measurements of the same dimension on the
   * same day, and the engine recalibrates on those. Design ruled the done
   * state on 23 Sep; the screen already had one, what it lacked was a memory
   * that it had happened.
   *
   * In an effect rather than in `useState`'s initialiser because the answer is
   * in `localStorage`, which the server cannot see - a lazy initialiser would
   * render `false` on the server and `true` on the client and tear.
   *
   * No `warmup_start` is recorded on a day already done. The child is not
   * starting a warm-up; they are looking at one they finished.
   *
   * Nor before the engine has named the task, and only ONCE. It ran on mount
   * with the rotation's dimension and again when the engine's answer swapped
   * it, so one run carried two starts for two different tasks.
   *
   * "Done" is the ACCOUNT's answer when the prompt carried one (B10), so a
   * warm-up done on another tablet is done here too; this device's memory
   * answers only when it did not (`warmUpDoneFor`). Nor before the band has
   * settled, which decides the task's size and goes on the event. Nor for a
   * heard round the device cannot say, which never starts.
   */
  useEffect(() => {
    if (!dimension || !bandSettled || unheard || started.current) return;
    if (warmUpDoneFor(doneToday, getSession()?.userId)) return;
    started.current = true;
    capture.record("warmup_start", {
      dimension,
      ...(band ? { band } : {}),
      // The device, read once here, goes beside the trials (B76).
      formFactor: formFactor(),
      ...(item ? { itemId: item.itemId } : {}),
    });
  }, [capture, dimension, item, doneToday, band, bandSettled, unheard]);

  /*
   * Derived during render rather than set from an effect.
   *
   * `localStorage` is invisible to the server, so this has to wait for the
   * client - but setting state in an effect to say so trips the
   * `set-state-in-effect` purity rule, which this codebase has hit before.
   * `useHydrated` is the sanctioned shape for "decide nothing that depends on
   * the token until the client is actually running", and it means the done
   * state is right on the FIRST client render rather than after a flash of the
   * activity.
   *
   * NOT WHILE THE PROMPT IS ON ITS WAY. The device memory could say "done"
   * here and the account then say otherwise, and "That's it for today"
   * followed by a task is worse than the nothing-state, which already covers
   * the wait. Home's card, which has no such state, does use it there.
   */
  const showDone =
    done ||
    (hydrated &&
      prompt.state !== "waiting" &&
      warmUpDoneFor(doneToday, getSession()?.userId));
  /** The write settled and failed. A withdrawal is not a failure. */
  const unsaved = !withheld && saved === false;

  const finish = useCallback(() => {
    if (!submitted.current) {
      submitted.current = true;
      if (withdrawn) {
        /*
         * A WITHDRAWN GUARDIAN STOPS THE WARM-UP TOO, and this one recurs
         * daily where the onboarding run happens once.
         *
         * BEFORE the trials are taken, not after: deriving them and then
         * declining to send them is still processing the child's interactions.
         * Nothing is derived, nothing is parked, nothing is sent, and the raw
         * stream goes the same way it always does.
         *
         * `saved` is left null rather than set false. False renders D126's
         * "Today's warm-up didn't save.", and that is not what happened: we
         * chose not to. A child is not told their work failed when it did
         * not.
         *
         * AND THEN THE DONE STATE, which this used to return before reaching.
         * The route is full-screen with no other way out, so a withdrawn
         * child's last tap did nothing and they sat on the task for good.
         */
        void capture.stop();
        setWithheld(true);
      } else {
        send();
      }
    }
    /*
     * Remembered even when nothing was submitted.
     *
     * A withdrawn guardian's run derives nothing and sends nothing, and a
     * failed write parks the trials rather than losing them. In neither case
     * does sitting it again help - the withdrawal still applies, and the
     * parked trials are already on their way. What the child DID is the thing
     * being remembered here, not what reached Nevo.
     *
     * Only ever the fallback now: the account's `doneToday` decides whenever
     * the prompt carries it.
     */
    markWarmUpDone(getSession()?.userId);
    setDone(true);

    function send() {
      /*
       * SEND WHAT THE CHILD ACTUALLY DID, AS THEY DID IT (B9, 5 Oct).
       *
       * This first sent `{ module, dimension, durationMs }` - the day's task
       * name and how long it took - and then a feature vector reduced on the
       * device: a mean response time, an accuracy, a span. Frontend §3 says
       * the device computes none of those. Each answer now goes up as one
       * trial carrying its own dimension, and the server reduces them.
       *
       * The run's length had no field on a trial and is not sent. The band the
       * task was sized for (D17) and the device go beside the trials now
       * (B76, 8 Oct, `baselineRunContext`); there is no motor step here, so
       * no `motorStepSkipped`. With no roster band, no band is claimed: the
       * Primary 4-6 default is the task's size, not the child's age band.
       *
       * The served question's pick goes to the prompt's own endpoint as well
       * (B8, below); here it is a trial naming its item, which the server
       * marks against its own key.
       */
      const trials = baselineTrials(capture);
      const context = baselineRunContext(capture);
      /*
       * A FAILED WRITE PARKS THE MEASUREMENT; IT DOES NOT DESTROY IT.
       *
       * This used a bare `submit` and threw the day's work away on the first
       * refusal - a blip, a cold backend, a 3G stutter - while the IDENTICAL
       * onboarding write already retried and parked. Same data, same endpoint,
       * two different answers to the same failure, and the quieter one lost a
       * child's warm-up.
       *
       * `submitTrials` handles the transient cases; `holdBaseline` keeps
       * what it still cannot send, and `flushPendingBaseline` - already called
       * on every student screen - delivers it later against a session provably
       * this child's.
       */
      /*
       * WHOSE WARM-UP THIS IS, recorded at the moment it is parked.
       *
       * A warm-up is sat by a child who is already signed in, so unlike the
       * onboarding run there IS an id to write down - and writing it down is
       * what stops these trials being delivered to the next child who onboards
       * on this tablet. The guard that used to prevent that relied on the
       * device having no session for the new account, which stopped being true
       * when the invite path began storing one.
       */
      const owner = getSession()?.userId ?? null;
      /*
       * THE PICK GOES TO ITS OWN ENDPOINT, UNMARKED (B8, 1 Oct).
       * `POST .../recalibrate-prompt/{id}/response` takes `{itemId, value}`
       * and marks it server-side; the key never reaches the device. It is not
       * parked when it fails - the parking is the submit's - so a pick that
       * never landed makes the done state say it could not be saved.
       */
      const pick = servedPick.current;
      const answered =
        pick && owner
          ? baselineApi.answerPrompt(owner, pick).catch(() => false)
          : Promise.resolve(true);
      /*
       * AND ON A DEVICE-TASK DAY, WORD THAT IT HAPPENED (B54, 5 Oct).
       *
       * Five days in six serve no question, so nothing went to that endpoint
       * and the account's `doneToday` stayed false: a second tablet offered
       * the child a second run and took a second measurement. The same
       * endpoint takes a completion with no item. Only for a run the engine
       * named for this child.
       *
       * Not part of `saved`. That line tells the child whether what they DID
       * reached Nevo; this is the account's note that it happened, and this
       * tablet already remembers it (`markWarmUpDone`) if it does not land.
       */
      if (!pick && owner && live) void baselineApi.deviceTaskDone(owner);
      const submittedOk = baselineApi
        .submitTrials(capture.sessionId, trials, context)
        .then((ok) => {
          if (!ok) holdBaseline(capture.sessionId, trials, owner, context);
          return ok;
        })
        .catch(() => {
          holdBaseline(capture.sessionId, trials, owner, context);
          return false;
        })
        // The RAW stream is purged either way - only the trials ever travel,
        // and the rest must not linger on the device. What is parked above is
        // the trials, not the raw capture.
        .finally(() => void capture.purge());
      void Promise.all([submittedOk, answered]).then(([sent, heard]) =>
        setSaved(sent && heard),
      );
    }
    // `withdrawn` belongs here: without it this closes over the value from the
    // first render, which is always false, and a withdrawal that resolved
    // mid-run would be read as consent.
  }, [capture, withdrawn, live]);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-nevo-cream text-nevo-near-black">
      <div className="flex shrink-0 items-center justify-between px-7 py-7">
        <span className="font-mono text-[11px] font-bold tracking-[0.14em] text-nevo-violet">
          DAILY WARM-UP
        </span>
        <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden>
          <circle
            cx="17"
            cy="17"
            r="15"
            fill="none"
            stroke="rgba(154,156,203,0.25)"
            strokeWidth="3"
          />
          <circle
            cx="17"
            cy="17"
            r="15"
            fill="none"
            stroke="#9a9ccb"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="94"
            strokeDashoffset={showDone ? 0 : 40}
            transform="rotate(-90 17 17)"
            className="transition-[stroke-dashoffset] duration-500"
          />
        </svg>
      </div>

      {showDone ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-[22px] px-9 text-center">
          {/*
            The frame's phone sizes below `sm`: a 64px badge with a 32px
            check and a 19px title. Tablet and desktop draw 80px and 22px.
          */}
          {unsaved ? (
            <SaveFailedMark />
          ) : (
            <span className="flex size-16 items-center justify-center rounded-full bg-nevo-navy motion-safe:animate-nevo-pop sm:size-20">
              <Check className="size-8 text-nevo-cream sm:size-9" strokeWidth={2.4} />
            </span>
          )}
          <div>
            <h3 className="text-[19px] font-semibold tracking-[-0.01em] text-nevo-navy sm:text-[22px]">
              That&apos;s it for today
            </h3>
            {/*
              NO BODY LINE WHEN IT SAVED (D80, 6 Oct). The frame is the title
              and the button. "Nevo is tuned to how you're doing today. Your
              progress is saved." is gone from it.

              D126's ONE LINE WHEN IT DID NOT (8 Oct), in the frame's words:
              no apology, no reason, no retry - the warm-up is 45 seconds
              and the child cannot fix it. Only once the write has settled
              and failed, never while it is in flight.
            */}
            {unsaved && (
              <p className="mt-3 max-w-[300px] text-[14.5px] leading-[1.55] text-pretty text-nevo-near-black/70 sm:text-[15.5px]">
                Today&apos;s warm-up didn&apos;t save. It won&apos;t change your lessons.
              </p>
            )}
          </div>
          <HomeButton label="Go on" onClick={() => router.push(HOME)} />
        </div>
      ) : !dimension || !bandSettled || unheard ? (
        <WarmUpNothing onHome={() => router.push(HOME)} />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center px-7 pb-10">
          <div className="flex w-full max-w-[480px] flex-col items-center gap-[26px]">
            <WarmUpTask
              dimension={dimension}
              band={band}
              item={item}
              capture={capture}
              onServedPick={(pick) => {
                servedPick.current = pick;
              }}
              onDone={finish}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * D126's quiet neutral mark, "not the success check": a pale violet disc the
 * badge's size, with a short navy bar across it - 40% of the disc, so 26px on
 * a phone and 32px from tablet up. It does not pop in.
 */
function SaveFailedMark() {
  return (
    <span
      data-testid="warmup-save-failed-mark"
      aria-hidden
      className="flex size-16 items-center justify-center rounded-full bg-nevo-violet/22 sm:size-20"
    >
      <span className="h-[3px] w-[26px] rounded-full bg-nevo-navy sm:w-8" />
    </span>
  );
}

/**
 * The warm-up's one way out, to the child's Home (D18).
 *
 * THE LABEL. On the done screen it is the frame's "Go on" (D97, 6 Oct). It
 * read "Start today's lesson", which stopped being true when design sent it
 * Home on 1 Oct, and then "Home" while design named it.
 *
 * The nothing-state's is still "Home" (D79 is open). No frame draws that
 * state; "Home" is the frames' own label for a button that goes there (32
 * Prototype, the lesson summary's second button; 30 Flow Reference, "Back to
 * lessons" / "Home").
 */
function HomeButton({
  label = "Home",
  onClick,
}: {
  label?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-12 cursor-pointer rounded-[10px] bg-nevo-navy px-6 text-base font-semibold text-nevo-cream transition-[filter,transform] hover:brightness-109 active:scale-[0.985]"
    >
      {label}
    </button>
  );
}

/**
 * The warm-up with no task: the engine has not named one, or will not.
 *
 * NOT DRAWN. Rule 5 says render the nothing-state rather than fill the gap,
 * and the gap used to be filled with the weekday rotation's task - run, and
 * then submitted as a measurement. So: no task, no words of explanation (none
 * is designed, and none is true for every cause), and the done state's own
 * button, labelled "Home" here while D79 is open, because this route is
 * full-screen and a child must never be left on it with nothing to press.
 * Shown while the prompt (or the band) is in flight too: the client has no
 * timeout, so a read that never answers would otherwise be a blank screen for
 * good. When the task arrives it replaces this. And for a P1-3 reading round
 * on a device that cannot speak, which cannot be presented honestly (D81).
 */
function WarmUpNothing({ onHome }: { onHome: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-7 pb-10">
      <HomeButton onClick={onHome} />
    </div>
  );
}

/**
 * How the warm-up times and records an answer: as the baseline's
 * `useTrialRunner` does, from the moment the round was shown, or from when it
 * opened for answers where it has a stimulus phase first.
 */
function useWarmUpPicks(
  capture: BaselineCapture,
  dimension: BaselineDimension,
) {
  const shownAt = useRef(0);
  /*
   * WHEN THE CHILD COULD FIRST ANSWER, for a round with a stimulus phase: the
   * dot mask, the end of a heard sentence. The answer is timed from there, as
   * the baseline times it (`useTrialRunner`'s `open`), and carries
   * `openAfterMs`, the offset, so nothing is folded in silently. The warm-up's
   * dots were timed from the moment they appeared, which put the display time
   * - now each band's own - into every answer.
   */
  const openedAt = useRef<number | null>(null);
  useEffect(() => {
    shownAt.current = performance.now();
  }, []);
  /** First call only: a replayed sentence does not move the moment later. */
  const open = useCallback(() => {
    if (openedAt.current === null) openedAt.current = performance.now();
  }, []);
  /*
   * `detail` carries whether they were right, which the task knows and nothing
   * downstream can work out. Without it a trial said only how FAST a child
   * answered - and a wrong quick tap outscored a right considered one on every
   * dimension but working memory, which records its own taps.
   *
   * Every warm-up task has exactly one fixed stimulus, so the answer is the same
   * every day that dimension comes round. That limits what accuracy can tell
   * you here and is worth an item bank; it is not a reason to keep discarding
   * it. See the note in docs/BUILD_STATUS.md.
   *
   * `opensLate` marks a round that opens for answers only once its stimulus
   * has run. One answered before then - a picture tapped while the sentence
   * is still being said - has no honest time, so it goes with `rtMs: null`
   * and `beforeOpen`, exactly as in the baseline.
   */
  const record = (
    choice: number | string,
    detail: Record<string, unknown>,
    opensLate: boolean,
  ) => {
    const now = performance.now();
    const opened = openedAt.current;
    const early = opensLate && opened === null;
    capture.record("trial_pick", {
      module: "warmup",
      act: dimension,
      choice,
      rtMs: early ? null : Math.round(now - (opened ?? shownAt.current)),
      ...(opened !== null
        ? { openAfterMs: Math.round(opened - shownAt.current) }
        : {}),
      ...(early ? { beforeOpen: true } : {}),
      ...detail,
    });
  };
  return { open, record };
}

/**
 * One round of the day's task - the frame's simplified single-trial forms.
 *
 * THE BAND'S OWN VERSION OF THE MODULE IT RE-CHECKS (D17, 1 Oct; D81, 6 Oct).
 * The frame draws one version - a 4x4 grid, three tiles, "Garri is made from
 * cassava." - and that was every child's, "tuned for neither" a Primary 2 nor
 * an SS2 child. Then only the tiles and the reading followed the band, and
 * not all of either. Design: "A warm-up that measures a different construct
 * from the baseline cannot recalibrate it." So, for the child's band, each
 * task is that module's first round, from the module's own config:
 *
 *  - tiles: tile memory's grid, first sequence length and light time
 *    (`gridSpanConfig`), and for SS its dual check between watch and recall;
 *  - pattern: 2A's first pair in the band's icons (`warmUpPattern`);
 *  - reading: 3A's first item (`warmUpReading`) - P1-3's sentence HEARD,
 *    JSS's sentence, SS's passage and its question;
 *  - dots: 3B's first pair, display time and dot size (`warmUpDots`);
 *  - flanker: the frame's trial drawn the band's way (`warmUpFlanker`).
 *
 * With no band, P4-6's version runs (`FRAME_BAND`). Nothing here is a new
 * value: each one is the baseline module's.
 */
function WarmUpTask({
  dimension,
  band,
  item,
  capture,
  onServedPick,
  onDone,
}: {
  dimension: BaselineDimension;
  /** The roster's band, or null when it gave none. */
  band: AgeBand | null;
  /** The question the engine served, if it served one. */
  item: WarmUpItem | null;
  capture: BaselineCapture;
  onServedPick: (pick: { itemId: string; value: string }) => void;
  onDone: () => void;
}) {
  /** The band this round is sized for: the roster's, or the frame's. */
  const sized = band ?? FRAME_BAND;
  const { open, record } = useWarmUpPicks(capture, dimension);
  const pick = (choice: number | string, detail: Record<string, unknown>) =>
    record(choice, detail, false);
  const pickOpened = (
    choice: number | string,
    detail: Record<string, unknown>,
  ) => record(choice, detail, true);

  /*
   * THE ENGINE'S QUESTION, whenever it served one, on any day (B65, 5 Oct).
   * `served` on the prompt says so (`toPrompt` builds `item` from nothing
   * else); the dimension is not asked to imply it.
   *
   * This used to be one fixture for every child, every time: "A quick one
   * from today's lesson." over two-thirds against three-fifths, marked on the
   * device and submitted as subject knowledge. Now the served question and
   * options render as they came, and the pick is recorded unmarked.
   *
   * No prompt line. "From today's lesson" is something no field says about
   * the served item, so it is not said.
   */
  if (item) {
    return (
      <SingleChoice
        onDone={onDone}
        onPick={(label, detail, i) => {
          const option = item.options[i];
          onServedPick({ itemId: item.itemId, value: option.value });
          pick(label, {
            ...detail,
            itemId: item.itemId,
            chosenOption: option.value,
          });
        }}
        stacked
        options={item.options.map((o) => o.label)}
        stimulus={
          <div className="w-full rounded-[12px] bg-nevo-cream-elevated px-5 py-[18px]">
            <p className="text-[17px] leading-[1.5] font-medium text-nevo-near-black">
              {item.question}
            </p>
          </div>
        }
      />
    );
  }

  switch (dimension) {
    case "wmc": {
      const config = gridSpanConfig(sized);
      return (
        <WarmUpGrid
          n={config.n}
          length={config.spanStart}
          litMs={config.litMs}
          dual={config.dual}
          capture={capture}
          onDone={onDone}
        />
      );
    }
    case "ps": {
      // 2A's first trial, a different pair; `pair` is its condition there.
      const { icons, same } = warmUpPattern(sized);
      const pair = same ? "same" : "different";
      return (
        <SingleChoice
          prompt="Same, or different?"
          onDone={onDone}
          onPick={(choice, detail) => pick(choice, { ...detail, pair })}
          options={["Same", "Different"]}
          answer={same ? "Same" : "Different"}
          stimulus={
            <div className="flex gap-5 sm:gap-7">
              {[icons[0], same ? icons[0] : icons[1]].map((svg, i) => (
                <div
                  key={i}
                  className="flex size-[120px] items-center justify-center rounded-[16px] border-2 border-nevo-navy bg-nevo-cream sm:size-[150px]"
                >
                  <div
                    className="size-1/2 text-nevo-navy"
                    dangerouslySetInnerHTML={{ __html: svg }}
                  />
                </div>
              ))}
            </div>
          }
        />
      );
    }
    case "reading": {
      const reading = warmUpReading(sized);
      // Each pick carries `mode` as the reading activity records it, so the
      // engine can tell a passage read from a sentence read or one heard.
      if (reading.mode === "audio") {
        return (
          <WarmUpHeard
            sentence={reading.sentence}
            answer={reading.answer}
            capture={capture}
            onOpen={open}
            onPick={(choice, detail) =>
              pickOpened(choice, { ...detail, mode: "audio" })
            }
            onDone={onDone}
          />
        );
      }
      if (reading.mode === "passage") {
        return (
          <SingleChoice
            onDone={onDone}
            onPick={(choice, detail) =>
              pick(choice, { ...detail, mode: "passage" })
            }
            stacked
            options={[...reading.options, "Not sure"]}
            answer={reading.answer}
            softLast
            stimulus={
              <div className="flex w-full flex-col gap-4">
                <div className="rounded-[12px] border-2 border-nevo-navy/50 bg-nevo-cream px-[18px] py-4 text-[15px] leading-[1.6] text-pretty text-nevo-near-black">
                  {reading.passage}
                </div>
                <p className="text-[15px] font-medium text-nevo-navy">
                  {reading.question}
                </p>
              </div>
            }
          />
        );
      }
      return (
        <SingleChoice
          prompt="True or false?"
          onDone={onDone}
          onPick={(choice, detail) =>
            pick(choice, { ...detail, mode: "sentence" })
          }
          stacked
          options={["True", "False", "Not sure"]}
          answer={reading.isTrue ? "True" : "False"}
          softLast
          stimulus={
            <div className="w-full rounded-[12px] border-2 border-nevo-navy/50 bg-nevo-cream p-[18px] text-center text-[17px] leading-[1.5] text-nevo-near-black">
              {reading.text}
            </div>
          }
        />
      );
    }
    case "ans":
      return (
        <WarmUpDots
          {...warmUpDots(sized)}
          onOpen={open}
          onDone={onDone}
          onPick={pickOpened}
        />
      );
    case "attention": {
      const { trial, alone, violet, arrow } = warmUpFlanker(sized);
      const turns = flankerTurns(trial);
      // The flanker's condition there; P1-3's lone arrow has none.
      const congruency = trial.congruency
        ? { congruency: trial.congruency }
        : {};
      return (
        <SingleChoice
          prompt="Which way is the middle arrow pointing?"
          onDone={onDone}
          onPick={(choice, detail) => pick(choice, { ...detail, ...congruency })}
          options={["Left", "Right"]}
          answer={trial.target === "left" ? "Left" : "Right"}
          stimulus={
            <div className="flex items-center gap-1.5">
              {(alone ? [2] : [0, 1, 2, 3, 4]).map((i) => (
                <ArrowRight
                  key={i}
                  strokeWidth={i === 2 ? 3 : 2.6}
                  className={cn(
                    i === 2
                      ? cn("text-nevo-navy", arrow)
                      : cn(
                          "size-[28px] sm:size-[34px]",
                          violet ? "text-nevo-violet" : "text-nevo-near-black/40",
                        ),
                  )}
                  style={{
                    transform: `rotate(${i === 2 ? turns.target : turns.flank}deg)`,
                  }}
                />
              ))}
            </div>
          }
        />
      );
    }
    default:
      /*
       * The question task with no question served. A signed-in child never
       * reaches this: with nothing served it never opens (`toPrompt`). The
       * fixture is the signed-out walkthrough's, the frame's own.
       */
      return (
        <SingleChoice
          prompt="A quick one from today's lesson."
          onDone={onDone}
          onPick={pick}
          stacked
          options={["Two-thirds", "Three-fifths", "They're equal"]}
          answer="Two-thirds"
          stimulus={
            <div className="w-full rounded-[12px] bg-nevo-cream-elevated px-5 py-[18px]">
              <p className="text-[17px] leading-[1.5] font-medium text-nevo-near-black">
                Which is larger: two-thirds or three-fifths?
              </p>
            </div>
          }
        />
      );
  }
}

/** Generic single-trial pick with the 440ms pressed beat, no feedback. */
function SingleChoice({
  prompt,
  stimulus,
  options,
  answer,
  stacked = false,
  softLast = false,
  onPick,
  onDone,
}: {
  /** The line above the stimulus; none when nothing true can be said. */
  prompt?: string;
  stimulus: React.ReactNode;
  options: string[];
  /**
   * The option that is correct, for the fixed tasks that carry their own key.
   * Absent for a served question: nothing is marked on the device then, and
   * the pick carries no `correct` at all. `softLast` marks the last option
   * unscorable.
   */
  answer?: string;
  stacked?: boolean;
  softLast?: boolean;
  onPick: (
    choice: string,
    detail: Record<string, unknown>,
    index: number,
  ) => void;
  onDone: () => void;
}) {
  const [picked, setPicked] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const choose = (i: number, e: React.MouseEvent) => {
    if (picked !== -1) return;
    // "Not sure" is an honest non-answer and is never marked wrong; it is
    // counted separately so it cannot silently inflate an accuracy either.
    const soft = softLast && i === options.length - 1;
    onPick(
      options[i],
      {
        ...(soft
          ? { notSure: true }
          : answer !== undefined
            ? { correct: options[i] === answer }
            : {}),
        ...tapPoint(e),
      },
      i,
    );
    setPicked(i);
    timer.current = setTimeout(() => onDoneRef.current(), PICK_BEAT_MS);
  };

  return (
    <>
      {prompt && (
        <p className="text-center text-[17px] leading-[1.5] font-medium text-nevo-near-black">
          {prompt}
        </p>
      )}
      {stimulus}
      <div
        className={cn(
          "flex w-full gap-3.5",
          stacked ? "flex-col" : "justify-center",
        )}
      >
        {options.map((o, i) => {
          const soft = softLast && i === options.length - 1;
          return (
            <button
              key={`${i}-${o}`}
              type="button"
              onClick={(e) => choose(i, e)}
              className={cn(
                // `min-h`, so a served option longer than one line still fits.
                "min-h-12 cursor-pointer rounded-[10px] border-2 px-3 py-2 transition-[background-color,transform] active:scale-[0.97]",
                stacked ? "w-full" : "min-w-[140px] flex-1 sm:flex-none",
                soft ? "text-sm font-medium" : "text-base font-semibold",
                picked === i
                  ? "border-nevo-violet bg-nevo-violet text-nevo-near-black"
                  : soft
                    ? "border-nevo-violet bg-nevo-cream text-nevo-violet"
                    : "border-nevo-navy bg-nevo-cream text-nevo-navy",
              )}
            >
              {o}
            </button>
          );
        })}
      </div>
    </>
  );
}

/**
 * wmc: one sequence on an n x n grid, tapped back in reverse - tile memory's
 * first round for the child's band.
 *
 * A WRONG TAP NOW DOES WHAT IT DOES IN TILE MEMORY, which this reuses. It rang
 * violet for 900ms and left the child to keep guessing at a pattern they had
 * seen once, with no limit - so the round could only end by a child finding
 * the tiles by elimination, which measures persistence rather than memory.
 * Now the grid locks under the nudge, the same pattern plays again, and the
 * third miss ends the round (`NUDGE_MS`, `MAX_MISSES`). Nothing says it went
 * wrong, and the trials record the misses and no completed round.
 *
 * SS ANSWERS A CHECK BETWEEN WATCH AND RECALL, as in tile memory (D81, 6
 * Oct): "Yes, SS's warm-up tile round includes the dual check", because the
 * SS baseline is a complex span because of it. The same checks, the same
 * dimmed grid and the same unmarked True and False (`GridSpanModule`'s
 * `DUAL_CHECKS`); every playback, a replay too, is followed by the next one.
 */
function WarmUpGrid({
  n,
  length,
  litMs,
  dual,
  capture,
  onDone,
}: {
  /** The grid is n x n. */
  n: number;
  /** How many tiles light. */
  length: number;
  /** How long each stays lit. */
  litMs: number;
  /** Whether a true/false check sits between watch and recall (SS). */
  dual: boolean;
  capture: BaselineCapture;
  onDone: () => void;
}) {
  const [seq, setSeq] = useState<number[]>([]);
  const [lit, setLit] = useState(-1);
  const [phase, setPhase] = useState<"watch" | "check" | "input" | "nudge">(
    "watch",
  );
  const [check, setCheck] = useState(DUAL_CHECKS[0]);
  const [tapped, setTapped] = useState<ReadonlySet<number>>(() => new Set());
  const [wrongCell, setWrongCell] = useState(-1);
  const pos = useRef(0);
  const misses = useRef(0);
  const checks = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
  useEffect(() => () => clearTimers(), [clearTimers]);
  const after = (ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  };

  /*
   * When the grid was handed over, as tile memory records it. The first tap
   * of a recall is timed from here; without it that tap went up with no time
   * at all.
   */
  const handOver = useCallback(
    (shown: number) => {
      setPhase("input");
      capture.record("input_start", { module: "warmup", length: shown });
    },
    [capture],
  );

  /** Light the sequence, then the check (SS), then hand the grid over. */
  const play = useCallback(
    (s: number[]) => {
      clearTimers();
      const at = (ms: number, fn: () => void) =>
        timers.current.push(setTimeout(fn, ms));
      at(0, () => {
        setSeq(s);
        setTapped(new Set());
        setPhase("watch");
      });
      let t = 560;
      s.forEach((cell) => {
        at(t, () => setLit(cell));
        at(t + litMs, () => setLit(-1));
        t += litMs + GAP_MS;
      });
      at(t + 150, () => {
        if (!dual) {
          handOver(s.length);
          return;
        }
        const next = DUAL_CHECKS[checks.current % DUAL_CHECKS.length];
        checks.current += 1;
        setCheck(next);
        setPhase("check");
        capture.record("check_shown", { module: "warmup", check: next.text });
      });
    },
    [capture, clearTimers, dual, handOver, litMs],
  );

  useEffect(() => {
    const pool = [...Array(n * n).keys()];
    const s: number[] = [];
    for (let i = 0; i < length; i++)
      s.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    play(s);
    return clearTimers;
  }, [play, clearTimers, n, length]);

  /** Marked for the engine, as tile memory marks it; never shown. */
  const answerCheck = (answer: boolean, e: React.MouseEvent) => {
    if (phase !== "check") return;
    capture.record("check_answer", {
      module: "warmup",
      check: check.text,
      answer,
      correct: answer === check.isTrue,
      ...tapPoint(e),
    });
    handOver(seq.length);
  };

  const tap = (cell: number, e: React.MouseEvent) => {
    if (phase !== "input") return;
    const expected = [...seq].reverse();
    const correct = cell === expected[pos.current];
    capture.record("tap", {
      module: "warmup",
      act: "wmc",
      cell,
      correct,
      // The recall goes up as ONE trial, ended by a wrong tap or by
      // `round_complete` (`baselineTrials`, B80). Neither `posInSeq` nor
      // `round_complete` was recorded here once, and a child who did it
      // perfectly looked like one who never finished.
      posInSeq: pos.current,
      length: seq.length,
      ...tapPoint(e),
    });
    if (!correct) {
      misses.current += 1;
      const missed = misses.current;
      pos.current = 0;
      setWrongCell(cell);
      setPhase("nudge");
      after(NUDGE_MS, () => {
        setWrongCell(-1);
        if (missed >= MAX_MISSES) onDoneRef.current();
        else play(seq); // the SAME pattern, watched again
      });
      return;
    }
    const next = new Set(tapped).add(cell);
    setTapped(next);
    pos.current += 1;
    if (pos.current >= seq.length) {
      setPhase("nudge"); // nothing more to tap; the round is over
      capture.record("round_complete", { length: seq.length });
      after(PICK_BEAT_MS, () => onDoneRef.current());
    }
  };

  const inputOn = phase === "input";
  const checking = phase === "check";
  /*
   * Tile memory's sizing for this n: a square of its column on a phone, so a
   * 5x5 grid fits a 320px screen, and the frame's fixed sizes from `sm` up.
   * The phone grid takes the content column's width, capped as tile memory
   * caps its own.
   */
  const tile = TILE[n] ?? TILE[4];
  return (
    <>
      <p className="text-center text-[17px] leading-[1.5] font-medium text-nevo-near-black">
        {phase === "watch"
          ? "Watch the tiles"
          : checking
            ? DUAL_CHECK_PROMPT
            : "Tap the tiles you saw, in reverse order."}
      </p>
      <div className="relative w-full max-w-[420px] sm:w-auto">
        <div
          className={cn("grid w-full sm:w-auto", tile.g)}
          style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: n * n }, (_, i) => (
            <button
              key={i}
              type="button"
              tabIndex={inputOn ? 0 : -1}
              onClick={(e) => tap(i, e)}
              className={cn(
                "flex items-center justify-center rounded-[12px] transition-[transform,box-shadow] duration-150",
                tile.m,
                i === lit &&
                  "scale-105 bg-nevo-violet shadow-[0_6px_18px_rgba(154,156,203,0.5)]",
                tapped.has(i) && "bg-nevo-navy",
                i === wrongCell &&
                  "border-2 border-nevo-violet bg-nevo-cream shadow-[0_0_0_3px_rgba(154,156,203,0.35)]",
                i !== lit &&
                  !tapped.has(i) &&
                  i !== wrongCell &&
                  "border-2 border-nevo-navy bg-nevo-cream",
                inputOn ? "cursor-pointer" : "pointer-events-none",
                checking && "opacity-40",
              )}
            >
              {tapped.has(i) && (
                <Check
                  className="size-[34%] min-h-5 min-w-5 text-nevo-cream"
                  strokeWidth={2.6}
                />
              )}
            </button>
          ))}
        </div>
        {/* The check floats over the dimmed grid, as in tile memory. */}
        {checking && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="rounded-[12px] bg-nevo-cream px-[22px] py-3.5 text-xl font-medium tracking-[0.01em] text-nevo-navy shadow-[0_8px_24px_rgba(0,0,0,0.12)] sm:text-2xl">
              {check.text}
            </span>
          </div>
        )}
      </div>
      {checking && (
        <div className="flex gap-3">
          <CheckButton label="True" onClick={(e) => answerCheck(true, e)} />
          <CheckButton label="False" onClick={(e) => answerCheck(false, e)} />
        </div>
      )}
    </>
  );
}

/**
 * ans: one dot comparison - reveal, mask, then answer. Module 3B's first pair
 * for the band, shown for its display time in its dot size (`warmUpDots`).
 * The buttons arm at the mask, and that is when the answer's time starts
 * (`onOpen`), as in the baseline.
 */
function WarmUpDots({
  pair,
  revealMs,
  dot,
  onOpen,
  onPick,
  onDone,
}: {
  pair: DotPair;
  /** How long the arrays show before the mask. */
  revealMs: number;
  /** The band's dot size. */
  dot: string;
  onOpen: () => void;
  onPick: (choice: string, detail: Record<string, unknown>) => void;
  onDone: () => void;
}) {
  const [masked, setMasked] = useState(false);
  const [picked, setPicked] = useState(-1);
  /*
   * Which side has more, drawn once. The larger array was always on the left,
   * so "Left" was always right - the same flaw as the onboarding baseline's
   * dot task, repeated every day in the warm-up.
   */
  const [counts] = useState<[number, number]>(() =>
    Math.random() < 0.5 ? [pair.a, pair.b] : [pair.b, pair.a],
  );
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);
  useEffect(() => {
    const t = setTimeout(() => {
      setMasked(true);
      onOpen();
    }, revealMs);
    return () => clearTimeout(t);
  }, [revealMs, onOpen]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const scatter = (count: number, seed: number) => {
    let s = seed >>> 0;
    const rng = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    return Array.from({ length: count }, () => ({
      x: 10 + rng() * 72,
      y: 10 + rng() * 72,
    }));
  };

  /** How close the two counts are: the baseline's `ratio`, its condition. */
  const ratio = Math.round((pair.a / pair.b) * 100) / 100;

  const choose = (i: number, label: string, e: React.MouseEvent) => {
    if (!masked || picked !== -1) return;
    onPick(label, {
      a: counts[0],
      b: counts[1],
      ratio,
      correct: counts[i] > counts[1 - i],
      ...tapPoint(e),
    });
    setPicked(i);
    timers.current.push(setTimeout(() => onDoneRef.current(), PICK_BEAT_MS));
  };

  return (
    <>
      <p className="text-center text-[17px] leading-[1.5] font-medium text-nevo-near-black">
        {masked ? "Which side had more dots?" : "Watch the dots"}
      </p>
      <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
        {counts.map((count, side) => (
          <div
            key={side}
            className="relative size-[150px] overflow-hidden rounded-[12px] border-2 border-nevo-navy bg-nevo-cream sm:size-[200px]"
          >
            {scatter(count, 17 + side * 29).map((d, i) => (
              <span
                key={i}
                className={cn("absolute rounded-full bg-nevo-violet", dot)}
                style={{ left: `${d.x}%`, top: `${d.y}%` }}
              />
            ))}
            {masked && (
              <div className="absolute inset-0 bg-nevo-cream-elevated" />
            )}
          </div>
        ))}
      </div>
      <div className="flex w-full justify-center gap-3.5">
        {SIDES.map(({ side, stacked }, i) => (
          <button
            key={side}
            type="button"
            onClick={(e) => choose(i, side, e)}
            className={cn(
              "h-12 min-w-[140px] rounded-[10px] border-2 text-base font-semibold transition-[background-color,border-color]",
              picked === i
                ? "border-nevo-violet bg-nevo-violet text-nevo-near-black"
                : masked
                  ? "cursor-pointer border-nevo-navy bg-nevo-cream text-nevo-navy"
                  : "cursor-default border-nevo-navy/30 bg-nevo-cream text-nevo-navy/40",
            )}
          >
            {/* The arrays are side by side from `sm` up and STACKED below it,
                so on a phone "Left" and "Right" named nothing on screen - the
                child was asked which side had more when one was above the
                other. Same treatment as Module 3's `DotButton`. */}
            <span className="sm:hidden">{stacked}</span>
            <span className="hidden sm:inline">{side}</span>
          </button>
        ))}
      </div>
    </>
  );
}

/**
 * reading, for P1-3: a sentence heard and a picture tapped, as the baseline
 * runs it (D81, 6 Oct) - said on arrival, again from the play button, with
 * the baseline's "I don't know" and its line, "Listen, then tap the matching
 * picture". The answer is timed from the end of the sentence (`onOpen`); one
 * made while it is still being said goes with no time at all.
 *
 * Only reached where the device can speak; see `unheard` in `WarmUpRun`.
 */
function WarmUpHeard({
  sentence,
  answer,
  capture,
  onOpen,
  onPick,
  onDone,
}: {
  sentence: string;
  /** The key of the picture that matches it. */
  answer: string;
  capture: BaselineCapture;
  onOpen: () => void;
  onPick: (choice: number, detail: Record<string, unknown>) => void;
  onDone: () => void;
}) {
  const [picked, setPicked] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  // Said on arrival: a six-year-old should not have to find the button to be
  // given the question. The button is there to hear it again.
  useEffect(() => {
    speak(sentence, onOpen);
    return stopSpeaking;
  }, [sentence, onOpen]);

  return (
    <>
      <p className="text-center text-[17px] leading-[1.5] font-medium text-nevo-near-black">
        Listen, then tap the matching picture
      </p>
      <HeardPictures
        answer={answer}
        picked={picked}
        onReplay={() => {
          capture.record("replay", { module: "warmup" });
          speak(sentence, onOpen);
        }}
        onPick={(i, detail, e) => {
          if (picked !== -1) return;
          onPick(i, { ...detail, ...tapPoint(e) });
          setPicked(i);
          timer.current = setTimeout(() => onDoneRef.current(), PICK_BEAT_MS);
        }}
      />
    </>
  );
}

/** What each dot array is called, depending on how the two are laid out. */
const SIDES = [
  { side: "Left", stacked: "Top" },
  { side: "Right", stacked: "Bottom" },
] as const;
