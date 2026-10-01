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
import {
  BASELINE_DIMENSIONS,
  gridSpanConfig,
  type AgeBand,
  type BaselineDimension,
} from "@/lib/profiling/bands";
import {
  BaselineCapture,
  reduceGridSpan,
  reduceTrialModule,
  tapPoint,
} from "@/lib/profiling/capture";
import { TILE } from "./GridSpanModule";
import { warmUpReading } from "./SentenceDotModule";

/** Where every way out of the warm-up goes (D18). */
const HOME = "/student/dashboard";

/**
 * The tile task with no band known: the frame's one version, a 4x4 grid and
 * three tiles at 660ms. One round only; the whole run should feel like ~45
 * seconds, never a test.
 */
const FRAME_GRID = { n: 4, length: 3, litMs: 660 };
/** The frame's one sentence, for a band with no read sentence of its own. */
const FRAME_SENTENCE = { text: "Garri is made from cassava.", isTrue: true };
const GAP_MS = 280;
const DOT_REVEAL_MS = 850;
const PICK_BEAT_MS = 440;
/**
 * The tile task's wrong tap, as tile memory has it (`GridSpanModule`, from
 * 11:225-228): the grid locks under a soft-violet ring for 1.5s, then the same
 * pattern plays again; the third miss ends the round. No slowing - the
 * warm-up's one round stays at the frame's single pace.
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
 * The done state only claims the run was saved if the write actually landed -
 * telling a child their progress was saved when nothing was written would be
 * false every single time. (This note used to say the screen "is not wired to"
 * `POST /api/baseline/submit`. It has been wired for some time; the note went
 * stale and was the reason nobody checked WHAT it was submitting, which for
 * longer still was the task name and a duration, and none of the measurement.)
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
 * SIZED TO THE CHILD'S BAND (D17, 1 Oct) when the roster carries one: the
 * tile task runs tile memory's own grid, sequence length and light time for
 * that band, and the reading task the band's own item. See `WarmUpTask`.
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
   * claims no save either way - not "your progress is saved", which would be
   * false, and not "we couldn't save it", which would blame a failure that did
   * not happen.
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
  const startedAt = useRef(0);
  const started = useRef(false);
  const submitted = useRef(false);

  /*
   * ONE WARM-UP A DAY, AND THE CHECK HAS TO HAPPEN BEFORE THE RUN STARTS.
   *
   * It was re-sittable any number of times, and the cost was not cosmetic:
   * every run reduces to a feature vector and submits it, so a child who
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
   * settled, which decides the task's size and goes on the event.
   */
  useEffect(() => {
    if (!dimension || !bandSettled || started.current) return;
    if (warmUpDoneFor(doneToday, getSession()?.userId)) return;
    started.current = true;
    startedAt.current = performance.now();
    capture.record("warmup_start", {
      dimension,
      ...(band ? { band } : {}),
      ...(item ? { itemId: item.itemId } : {}),
    });
  }, [capture, dimension, item, doneToday, band, bandSettled]);

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

  const finish = useCallback(() => {
    if (!submitted.current) {
      submitted.current = true;
      if (withdrawn) {
        /*
         * A WITHDRAWN GUARDIAN STOPS THE WARM-UP TOO, and this one recurs
         * daily where the onboarding run happens once.
         *
         * BEFORE the reduction, not after: deriving a feature vector and then
         * declining to send it is still processing the child's interactions.
         * Nothing is derived, nothing is parked, nothing is sent, and the raw
         * stream goes the same way it always does.
         *
         * `saved` is left null rather than set false. False renders "we
         * couldn't save it just now - that's on us, not you", and that is not
         * what happened: we chose not to. A child is not told their work
         * failed when it did not. Nor that it was saved: `withheld` drops
         * that line too.
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
     * failed write parks the vector rather than losing it. In neither case
     * does sitting it again help - the withdrawal still applies, and the
     * parked vector is already on its way. What the child DID is the thing
     * being remembered here, not what reached Nevo.
     *
     * Only ever the fallback now: the account's `doneToday` decides whenever
     * the prompt carries it.
     */
    markWarmUpDone(getSession()?.userId);
    setDone(true);

    function send() {
      const durationMs = Math.round(performance.now() - startedAt.current);
      /*
       * SUBMIT WHAT THE CHILD ACTUALLY DID.
       *
       * This sent `{ module, dimension, durationMs }` - the day's task name and
       * how long it took - and then purged the capture. Every trial, every
       * response time, every right and wrong answer was recorded to
       * IndexedDB and deleted without ever being reduced. The warm-up exists to
       * recalibrate the engine on one dimension each day; what reached it was
       * "a child spent 45 seconds".
       *
       * The working-memory task records taps rather than picks, so it reduces
       * through the grid reducer; the other five go through the trial one. Both
       * are tagged `warmup` so the engine can tell a daily run from the
       * onboarding baseline, which uses the same two functions.
       */
      const measured =
        dimension === "wmc"
          ? reduceGridSpan(capture)
          : reduceTrialModule(capture, "warmup");
      /*
       * THE BAND THE TASK WAS SIZED FOR, when it was sized for one (D17). A
       * span of four on a 5x5 grid and a span of two on a 3x3 are not the
       * same measurement, and nothing else on the vector says which this was.
       * Absent, never guessed, when the frame's one version ran.
       *
       * The served question's pick is NOT here any more. It rode along as
       * `item: {itemId, chosenOption}` for whoever marked it; it now goes to
       * the prompt's own endpoint and is marked there (B8, below).
       */
      const features = [
        {
          ...measured,
          module: "warmup",
          dimension,
          durationMs,
          ...(band ? { band } : {}),
        },
      ];
      /*
       * A FAILED WRITE PARKS THE MEASUREMENT; IT DOES NOT DESTROY IT.
       *
       * This used a bare `submit` and threw the day's work away on the first
       * refusal - a blip, a cold backend, a 3G stutter - while the IDENTICAL
       * onboarding write already retried and parked. Same data, same endpoint,
       * two different answers to the same failure, and the quieter one lost a
       * child's warm-up.
       *
       * `submitWithRetry` handles the transient cases; `holdBaseline` keeps
       * what it still cannot send, and `flushPendingBaseline` - already called
       * on every student screen - delivers it later against a session provably
       * this child's.
       */
      /*
       * WHOSE WARM-UP THIS IS, recorded at the moment it is parked.
       *
       * A warm-up is sat by a child who is already signed in, so unlike the
       * onboarding run there IS an id to write down - and writing it down is
       * what stops this vector being delivered to the next child who onboards
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
       * never landed makes the done state say it could not be saved, rather
       * than "Your progress is saved" over a pick nobody received.
       */
      const pick = servedPick.current;
      const answered =
        pick && owner
          ? baselineApi.answerPrompt(owner, pick).catch(() => false)
          : Promise.resolve(true);
      const submittedOk = baselineApi
        .submitWithRetry(capture.sessionId, features)
        .then((ok) => {
          if (!ok) holdBaseline(capture.sessionId, features, owner);
          return ok;
        })
        .catch(() => {
          holdBaseline(capture.sessionId, features, owner);
          return false;
        })
        // The RAW stream is purged either way - only the reduced vector ever
        // travels, and it must not linger on the device. What is parked above
        // is the vector, not the raw capture.
        .finally(() => void capture.purge());
      void Promise.all([submittedOk, answered]).then(([sent, heard]) =>
        setSaved(sent && heard),
      );
    }
    // `withdrawn` belongs here: without it this closes over the value from the
    // first render, which is always false, and a withdrawal that resolved
    // mid-run would be read as consent.
  }, [capture, dimension, withdrawn, band]);

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
          <span className="flex size-20 items-center justify-center rounded-full bg-nevo-navy motion-safe:animate-nevo-pop">
            <Check className="size-9 text-nevo-cream" strokeWidth={2.4} />
          </span>
          <div>
            <h3 className="text-[22px] font-semibold tracking-[-0.01em] text-nevo-navy">
              That&apos;s it for today
            </h3>
            {/*
              Nothing until the write settles. `saved` is null while the
              submit is in flight, and the done state used to read that as
              "Your progress is saved" - a claim made before any save had
              happened, and false whenever the write then failed.
            */}
            {!withheld && saved !== null && (
              <p className="mt-2.5 max-w-[320px] text-[15.5px] leading-[1.55] text-nevo-near-black">
                {saved
                  ? "Nevo is tuned to how you're doing today. Your progress is saved."
                  : "Thanks for doing that. We couldn't save it just now - that's on us, not you."}
              </p>
            )}
          </div>
          <HomeButton onClick={() => router.push(HOME)} />
        </div>
      ) : !dimension || !bandSettled ? (
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
 * The warm-up's one way out, to the child's Home (D18).
 *
 * DESIGN ASK, THE LABEL. The frame's button reads "Start today's lesson",
 * which stopped being true when design sent it Home on 1 Oct - and a child
 * with no lesson queued would be promised one. No frame draws "Back to home".
 * "Home" is the frames' own label for a button that goes there (32 Prototype,
 * the lesson summary's second button; 30 Flow Reference, "Back to lessons" /
 * "Home"), so it is used until design names this one.
 */
function HomeButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-12 cursor-pointer rounded-[10px] bg-nevo-navy px-6 text-base font-semibold text-nevo-cream transition-[filter,transform] hover:brightness-109 active:scale-[0.985]"
    >
      Home
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
 * button Home, because this route is full-screen and a child must never be
 * left on it with nothing to press. Shown while the prompt (or the band) is in
 * flight too: the client has no timeout, so a read that never answers would
 * otherwise be a blank screen for good. When the task arrives it replaces this.
 */
function WarmUpNothing({ onHome }: { onHome: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-7 pb-10">
      <HomeButton onClick={onHome} />
    </div>
  );
}

/**
 * One round of the day's task - the frame's simplified single-trial forms.
 *
 * BY BAND, WHERE THE BASELINE ALREADY VARIES BY BAND (D17, 1 Oct). The frame
 * draws one version - a 4x4 grid, three tiles, "Garri is made from cassava." -
 * and that was every child's, "tuned for neither" a Primary 2 nor an SS2
 * child. With a band known:
 *
 *  - the tile task runs tile memory's grid for it, its starting sequence
 *    length and its light time (`gridSpanConfig`), not its dual task;
 *  - the reading task reads the band's own first item from the reading
 *    activity (`warmUpReading`): JSS's sentence, SS's passage and its
 *    question. P4-6's first sentence is the frame's.
 *
 * With none, and for P1-3's reading, which that activity runs by ear, the
 * frame's one version runs. Nothing here is a new value.
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
  const shownAt = useRef(0);
  useEffect(() => {
    shownAt.current = performance.now();
  }, []);
  /*
   * `detail` carries whether they were right, which the task knows and nothing
   * downstream can work out. Without it the vector said only how FAST a child
   * answered - and a wrong quick tap outscored a right considered one on every
   * dimension but working memory, which records its own taps.
   *
   * Every task below has exactly one fixed stimulus, so the answer is the same
   * every day that dimension comes round. That limits what accuracy can tell
   * you here and is worth an item bank; it is not a reason to keep discarding
   * it. See the note in docs/BUILD_STATUS.md.
   */
  const pick = (choice: number | string, detail: Record<string, unknown>) => {
    capture.record("trial_pick", {
      module: "warmup",
      act: dimension,
      choice,
      rtMs: Math.round(performance.now() - shownAt.current),
      ...detail,
    });
  };

  switch (dimension) {
    case "wmc": {
      const config = band ? gridSpanConfig(band) : null;
      return (
        <WarmUpGrid
          n={config?.n ?? FRAME_GRID.n}
          length={config?.spanStart ?? FRAME_GRID.length}
          litMs={config?.litMs ?? FRAME_GRID.litMs}
          capture={capture}
          onDone={onDone}
        />
      );
    }
    case "ps":
      return (
        <SingleChoice
          prompt="Same, or different?"
          onDone={onDone}
          onPick={pick}
          options={["Same", "Different"]}
          // A circle and a rounded square - never the same shape.
          answer="Different"
          stimulus={
            <div className="flex gap-5 sm:gap-7">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="flex size-[120px] items-center justify-center rounded-[16px] border-2 border-nevo-navy bg-nevo-cream sm:size-[150px]"
                >
                  <span
                    className={cn(
                      "block size-1/2 border-[3px] border-nevo-violet",
                      i === 0 ? "rounded-full" : "rounded-[6px]",
                    )}
                  />
                </div>
              ))}
            </div>
          }
        />
      );
    case "reading": {
      const reading = band ? warmUpReading(band) : null;
      // Each pick carries `mode` as the reading activity records it, so the
      // engine can tell a passage read from a sentence read.
      if (reading?.mode === "passage") {
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
      const sentence = reading ?? FRAME_SENTENCE;
      return (
        <SingleChoice
          prompt="True or false?"
          onDone={onDone}
          onPick={(choice, detail) =>
            pick(choice, { ...detail, mode: "sentence" })
          }
          stacked
          options={["True", "False", "Not sure"]}
          answer={sentence.isTrue ? "True" : "False"}
          softLast
          stimulus={
            <div className="w-full rounded-[12px] border-2 border-nevo-navy/50 bg-nevo-cream p-[18px] text-center text-[17px] leading-[1.5] text-nevo-near-black">
              {sentence.text}
            </div>
          }
        />
      );
    }
    case "ans":
      return <WarmUpDots onDone={onDone} onPick={pick} />;
    case "attention":
      return (
        <SingleChoice
          prompt="Which way is the middle arrow pointing?"
          onDone={onDone}
          onPick={pick}
          options={["Left", "Right"]}
          // The four flankers are mirrored; only the centre points right.
          answer="Right"
          stimulus={
            <div className="flex items-center gap-1.5">
              {[0, 1, 2, 3, 4].map((i) => (
                <ArrowRight
                  key={i}
                  strokeWidth={2.4}
                  className={cn(
                    i === 2
                      ? "size-10 text-nevo-navy"
                      : "size-8 -scale-x-100 text-nevo-near-black/40",
                  )}
                />
              ))}
            </div>
          }
        />
      );
    default:
      /*
       * THE ENGINE'S QUESTION, when it served one - which for a signed-in
       * child it must have, or this task never opens (`toPrompt`).
       *
       * This used to be one fixture for every child, every time: "A quick one
       * from today's lesson." over two-thirds against three-fifths, marked on
       * the device and submitted as subject knowledge. Now the served question
       * and options render as they came, and the pick is recorded unmarked:
       * the answer key came down the wire too, and the client does not use it.
       *
       * No prompt line. "From today's lesson" is something no field says about
       * the served item, so it is not said. The fixture below is the
       * signed-out walkthrough's, the frame's own.
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
 * wmc: one sequence on an n x n grid, tapped back in reverse - three tiles on
 * a 4x4 grid in the frame, or tile memory's first round for the child's band.
 *
 * A WRONG TAP NOW DOES WHAT IT DOES IN TILE MEMORY, which this reuses. It rang
 * violet for 900ms and left the child to keep guessing at a pattern they had
 * seen once, with no limit - so the round could only end by a child finding
 * the tiles by elimination, which measures persistence rather than memory.
 * Now the grid locks under the nudge, the same pattern plays again, and the
 * third miss ends the round (`NUDGE_MS`, `MAX_MISSES`). Nothing says it went
 * wrong, and the vector records the misses and no completed round.
 */
function WarmUpGrid({
  n,
  length,
  litMs,
  capture,
  onDone,
}: {
  /** The grid is n x n. */
  n: number;
  /** How many tiles light. */
  length: number;
  /** How long each stays lit. */
  litMs: number;
  capture: BaselineCapture;
  onDone: () => void;
}) {
  const [seq, setSeq] = useState<number[]>([]);
  const [lit, setLit] = useState(-1);
  const [phase, setPhase] = useState<"watch" | "input" | "nudge">("watch");
  const [tapped, setTapped] = useState<ReadonlySet<number>>(() => new Set());
  const [wrongCell, setWrongCell] = useState(-1);
  const pos = useRef(0);
  const misses = useRef(0);
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

  /** Light the sequence, then hand the grid to the child. */
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
      at(t + 150, () => setPhase("input"));
    },
    [clearTimers, litMs],
  );

  useEffect(() => {
    const pool = [...Array(n * n).keys()];
    const s: number[] = [];
    for (let i = 0; i < length; i++)
      s.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    play(s);
    return clearTimers;
  }, [play, clearTimers, n, length]);

  const tap = (cell: number, e: React.MouseEvent) => {
    if (phase !== "input") return;
    const expected = [...seq].reverse();
    const correct = cell === expected[pos.current];
    capture.record("tap", {
      module: "warmup",
      act: "wmc",
      cell,
      correct,
      // `reduceGridSpan` pairs consecutive taps by `posInSeq` to measure recall
      // speed, and counts completed rounds from `round_complete`. Neither was
      // recorded here, so a warm-up reduced to maxSpan 0 and no recall gap at
      // all - a child who did it perfectly looked like one who never finished.
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
          : "Tap the tiles you saw, in reverse order."}
      </p>
      <div
        className={cn("grid w-full max-w-[420px] sm:w-auto", tile.g)}
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
    </>
  );
}

/** ans: one dot comparison - reveal, mask, then answer. */
function WarmUpDots({
  onPick,
  onDone,
}: {
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
    Math.random() < 0.5 ? [9, 6] : [6, 9],
  );
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);
  useEffect(() => {
    const t = setTimeout(() => setMasked(true), DOT_REVEAL_MS);
    return () => clearTimeout(t);
  }, []);
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

  const choose = (i: number, label: string, e: React.MouseEvent) => {
    if (!masked || picked !== -1) return;
    onPick(label, { correct: counts[i] > counts[1 - i], ...tapPoint(e) });
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
                className="absolute size-4 rounded-full bg-nevo-violet"
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

/** What each dot array is called, depending on how the two are laid out. */
const SIDES = [
  { side: "Left", stacked: "Top" },
  { side: "Right", stacked: "Bottom" },
] as const;
