"use client";

import Link from "next/link";
import type { BaselineDimension } from "@/lib/profiling/bands";
import { useWarmUpPrompt } from "@/hooks/useWarmUpDimension";
import { useHydrated } from "@/hooks/useHydrated";
import { getSession } from "@/lib/auth/session";
import { warmUpDoneFor } from "@/lib/profiling/warmUpDone";
import { dimensionForToday } from "./WarmUpRun";

/** The rotating chip copy - warm, never clinical (frame's rotation map). */
export const WARM_UP_CHIPS: Record<BaselineDimension, string> = {
  wmc: "Quick patterns today",
  ps: "Quick matches today",
  reading: "A short read today",
  ans: "Quick counts today",
  attention: "Quick focus today",
  domain: "A quick question today",
};

/**
 * The card as Home places it, with today's task and whether it is done read
 * here - so the decision is tested where it is made, not only the card that
 * renders it. (A dashboard that hard-coded `done={false}` once passed every
 * test the card had.)
 *
 * DONE IS THE ACCOUNT'S ANSWER (B10, 1 Oct). `doneToday` on the prompt is
 * held against the account, so a warm-up done on one tablet reads as done on
 * the next. This device's memory stands in only while nobody has said - the
 * prompt in flight, a failed read, a deployment without the field - so the
 * card does not offer a warm-up for a moment and then take it back.
 *
 * Read during render behind `hydrated`, not from an effect: the memory lives
 * in localStorage, which the server cannot see, and setting state to say so
 * trips `set-state-in-effect`. False until hydrated means the live card is
 * what renders first, which is the right way round - offering a warm-up to a
 * child who has done one is a smaller wrong than telling a child who has not
 * that they have.
 */
export function TodaysWarmUpCard() {
  const prompt = useWarmUpPrompt(dimensionForToday());
  const hydrated = useHydrated();
  const done =
    hydrated &&
    warmUpDoneFor(
      prompt.state === "waiting" ? undefined : prompt.doneToday,
      getSession()?.userId,
    );
  // The same dimension the run will use - the card naming one task and the
  // run opening another would be a small, avoidable lie.
  return (
    <WarmUpCard
      dimension={prompt.state === "ready" ? prompt.dimension : null}
      done={done}
    />
  );
}

/**
 * Daily warm-up card (`Nevo Warm-Up Card`, SCRUM-104): the 45-second
 * calibration that opens the daily session, rotating one baseline dimension per
 * day. Presents as a quick warm-up, never an assessment.
 */
export function WarmUpCard({
  dimension,
  done = false,
}: {
  /**
   * Today's task, or null while the engine has not named one. Null drops the
   * chip: it named the weekday rotation's task, which the run no longer falls
   * back to for a signed-in child, so it would promise a task that never
   * opens.
   */
  dimension: BaselineDimension | null;
  /**
   * Today's is already behind them.
   *
   * **AND THE CARD STOPS BEING AN ACTION.** Design, 24 Sep: *"no tap, no
   * navigation into the done state, because a card that looks tappable and
   * lands somewhere inert is worse than a card that plainly says it has
   * finished."* So this is not a disabled button or a greyed link - the
   * control is gone.
   *
   * **No praise, no score, nothing about how it went**, which is the same line
   * the run's own done state holds. "Today's warm-up is done" is a fact about
   * the day, not a verdict on the child.
   */
  done?: boolean;
}) {
  if (done) return <WarmUpDone />;

  return (
    <div className="mt-6 flex items-center gap-6 rounded-[12px] bg-nevo-cream-elevated px-[26px] py-6 shadow-elevation-1 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-500">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-mono text-[11px] font-bold tracking-[0.14em] text-nevo-violet">
            DAILY WARM-UP
          </span>
          {dimension && (
            <span className="rounded-full bg-nevo-violet/20 px-2.5 py-[3px] text-[11px] font-medium text-nevo-navy">
              {WARM_UP_CHIPS[dimension]}
            </span>
          )}
        </div>
        <h3 className="mt-3 text-xl font-semibold tracking-[-0.01em] text-nevo-navy">
          A quick warm-up to begin
        </h3>
        {/*
          The frame's line less "No score,". The architecture bans the word
          in front of a child ("test", "score" and "ability" never appear),
          and design ruled the line reworded on 1 Oct (D13) without giving
          words - so the claim is removed and nothing is added.
        */}
        <p className="mt-2 max-w-[420px] text-[14.5px] leading-[1.55] text-pretty text-nevo-near-black">
          About 45 seconds. It just keeps Nevo tuned to how you&apos;re doing
          today.
        </p>
        <Link
          href="/student/warm-up"
          className="mt-[18px] inline-flex h-11 items-center rounded-[10px] bg-nevo-navy px-[22px] text-[15px] font-semibold text-nevo-cream transition-[filter,transform] hover:brightness-109 active:scale-[0.985]"
        >
          Begin warm-up
        </Link>
      </div>
      <div className="hidden size-[132px] shrink-0 items-center justify-center rounded-[12px] bg-nevo-cream sm:flex">
        <div className="flex gap-2.5">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className="size-4 rounded-full bg-nevo-violet motion-safe:[animation:nevo-tile-hi_2.4s_ease-in-out_infinite]"
              style={{ animationDelay: `${i * 300}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The card once today's warm-up is behind them. Design's words, 24 Sep.
 *
 * Same shell as the live card so the dashboard does not reflow when the state
 * changes, and deliberately no chip: the rotating "Quick patterns today" line
 * names a task that is no longer on offer.
 */
function WarmUpDone() {
  return (
    <div className="mt-6 flex items-center gap-6 rounded-[12px] bg-nevo-cream-elevated px-[26px] py-6 shadow-elevation-1">
      <div className="min-w-0 flex-1">
        <span className="font-mono text-[11px] font-bold tracking-[0.14em] text-nevo-violet">
          DAILY WARM-UP
        </span>
        <h3 className="mt-3 text-xl font-semibold tracking-[-0.01em] text-nevo-navy">
          Today&apos;s warm-up is done.
        </h3>
        <p className="mt-2 max-w-[420px] text-[14.5px] leading-[1.55] text-pretty text-nevo-near-black">
          Come back tomorrow.
        </p>
      </div>
      <div className="hidden size-[132px] shrink-0 items-center justify-center rounded-[12px] bg-nevo-cream sm:flex">
        {/* Still, not breathing. The live card's dots animate because something
            is waiting to be done; nothing is. */}
        <div className="flex gap-2.5">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="size-4 rounded-full bg-nevo-violet/35" />
          ))}
        </div>
      </div>
    </div>
  );
}
