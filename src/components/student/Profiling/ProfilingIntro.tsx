"use client";

import { IllustrationWrapper } from "@/components/shared";
import {
  AgeStepper,
  isAgeInRange,
} from "@/components/student/Onboarding/AgeStepper";
import { ProfilingShell } from "./ProfilingShell";

/**
 * Profiling intro + complete (BP-01 / BP-DONE) - the bookends of the baseline
 * flow, one component with two modes per the frame. Fixed copy; never "test",
 * "score" or "ability". No skip, no back. The complete screen shows no results
 * of any kind - a settled figure, not a celebration.
 *
 * The complete copy claims no write. It read "Your learning space has been
 * personalized", a past-tense claim about the engine that was false whenever
 * the submit had not landed; design ruled the replacement on 1 Oct
 * (SCRUM-180), "Nevo has everything it needs to set up your learning space.",
 * which is true the moment it is read. `saved === false` swaps it for the same
 * plain admission the daily warm-up uses.
 *
 * **THAT BRANCH IS CURRENTLY UNREACHABLE, DELIBERATELY - see `saved` below
 * before relying on it.**
 */
export function ProfilingIntro({
  mode,
  onContinue,
  saved = null,
  askAge = false,
  waiting = false,
  age = "",
  onAgeChange,
}: {
  mode: "intro" | "complete";
  onContinue: () => void;
  /**
   * Ask before starting, because we do not know.
   *
   * The band decides the grid size, the span ceiling, whether the dual task
   * runs and which domain questions a child sees. It comes from the roster
   * when the child is signed in and it has one, or from the age given in
   * onboarding Step 1 - but a child arriving by SSO never sees that step, and
   * the code fell back to a FIXTURE's "Year 4". Every SSO child therefore sat
   * the Primary 4-6 baseline: a sixteen-year-old on a 4x4 grid with no dual
   * task, a seven-year-old asked "What is 15% of 200?".
   *
   * So only when neither says. One question is cheaper than mis-pitching four
   * modules. NOT DRAWN: design asked on 1 Oct (D13) which case still reaches
   * this before drawing it; see `ProfilingFlow`.
   */
  askAge?: boolean;
  /**
   * The roster has not answered yet, so it is not known whether to ask. No
   * question, and no start: a run begun now would be sized by a guess.
   */
  waiting?: boolean;
  age?: string;
  onAgeChange?: (value: string) => void;
  /**
   * Whether the baseline reached Nevo. Null while it is still resolving, which
   * reads as the settled copy - the child did their part either way and the
   * screen should not flicker a warning at them mid-flight.
   *
   * **NOTHING PASSES THIS TODAY, SO `false` IS UNREACHABLE HERE. Kept on
   * purpose; decided 24 Sep.**
   *
   * `ProfilingFlow` is this component's only caller and renders
   * `mode="complete"` without it, because the trials are now PARKED
   * (`holdBaseline`) and delivered once an account exists a screen or two
   * later. That run cannot know whether the write landed, and a screen that
   * cannot know must not claim either answer - so null, which reads settled.
   *
   * The branch stays rather than being deleted because the parking is a
   * property of the ONBOARDING path, not of this component: the daily warm-up
   * reaches the same admission through its own done state, and a flow that
   * submits inline would want this copy back unchanged. Deleting it would make
   * the next person write the sentence again, slightly differently, which is
   * how two apologies for the same failure end up in one product.
   *
   * The settled copy no longer runs ahead of the write: design replaced the
   * past-tense "has been personalized" on 1 Oct (SCRUM-180), after it was
   * raised on 24 Sep.
   */
  saved?: boolean | null;
}) {
  const complete = mode === "complete";
  const blocked =
    !complete && (waiting || (askAge && !isAgeInRange(age)));
  return (
    <ProfilingShell filled={complete ? 4 : 0} active={complete ? -1 : 0}>
      <div className="flex min-h-0 w-full max-w-[300px] flex-1 flex-col items-center justify-center text-center sm:max-w-[480px]">
        <IllustrationWrapper
          src={
            complete
              ? "/illustrations/sequence-complete.png"
              : "/illustrations/sequence-intro.png"
          }
          alt={
            complete
              ? "A calm Nevo figure sitting comfortably"
              : "A friendly Nevo figure leaning in"
          }
          width={518}
          height={486}
          priority
          className="h-[160px] w-auto sm:h-[200px]"
        />
        <h1 className="mt-[22px] text-[22px] leading-[1.25] font-semibold tracking-[-0.015em] text-balance text-nevo-navy sm:mt-[26px] sm:text-2xl">
          {complete
            ? "All set. Nevo is ready for you."
            : "Let's set up your learning space"}
        </h1>
        <p className="mt-3 max-w-[400px] text-[15px] leading-[1.55] text-pretty text-nevo-near-black sm:text-base">
          {complete
            ? saved === false
              ? "Thanks for doing that. We couldn’t save it just now - that’s on us, not you."
              : "Nevo has everything it needs to set up your learning space."
            : // The frame's line less "No tests, no scores.": words the
              // architecture keeps from a child, and design ruled the line
              // reworded on 1 Oct (D13) without giving words. Removed, not
              // replaced.
              "You'll do four quick activities. This just helps Nevo work better for you."}
        </p>
        {askAge && !complete && !waiting && (
          <div className="mt-6 w-full">
            <p className="mb-2 text-[15px] font-medium text-nevo-near-black">
              How old are you?
            </p>
            <AgeStepper value={age} onChange={(v) => onAgeChange?.(v)} />
          </div>
        )}

        <button
          type="button"
          disabled={blocked}
          onClick={onContinue}
          className={
            blocked
              ? "mt-[30px] h-[52px] w-full cursor-not-allowed rounded-[10px] bg-nevo-navy text-base font-semibold text-nevo-cream opacity-40 sm:mt-[34px]"
              : "mt-[30px] h-[52px] w-full cursor-pointer rounded-[10px] bg-nevo-navy text-base font-semibold text-nevo-cream transition-[filter,transform] hover:brightness-109 active:scale-[0.985] sm:mt-[34px]"
          }
        >
          {complete ? "Start my first lesson" : "Let's go"}
        </button>
      </div>
    </ProfilingShell>
  );
}
