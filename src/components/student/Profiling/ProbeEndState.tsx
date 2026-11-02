"use client";

import { Button } from "@/components/shared";
import { cn } from "@/lib/utils";
import { ProfilingShell } from "./ProfilingShell";

/** Which stop of the quest map Module 4 is: three done, the fourth active. */
const DONE_BEFORE = 3;

/**
 * Module 4's two ends after the PIN that ask nothing (design 5bb9ee2, 28 Oct,
 * `09d Module 4 - Domain Probe`, BP-M4-AFTER-PIN: "a returning sign-in can
 * land here; neither state is a dead end").
 *
 * - `done`: the server already holds Module 4 as done. The frame draws it as
 *   "the backend's 409", but the probe has no such 409 - its only two are
 *   `probe_subject_mismatch` and `probe_item_stale` (backend 1a9a4dd) - so it
 *   is shown on the server's own answer, readiness holding the module
 *   `completed` (Hub, 28 Oct). "Never the word 'conflict'".
 * - `nothing`: "the calm case where there is simply no probe to run".
 *
 * The words are the frame's (Hub, 28 Oct: "Use the frame's exact words"),
 * less one. The nothing-state named "no warm-up waiting", and the warm-up
 * lives somewhere else. Lydia, 31 Oct: "Say 'Nothing to do here right now'"
 * - which its heading already says, so that sentence goes rather than the
 * heading being said twice.
 */
export type ProbeEnd = "done" | "nothing";

export const PROBE_END_COPY: Record<
  ProbeEnd,
  { heading: string; body: string; action: string }
> = {
  done: {
    heading: "You've already done this part",
    body: "Your answers from before are saved, so there's nothing to do again here. You can carry straight on to Nevo.",
    action: "Continue to Nevo",
  },
  nothing: {
    heading: "Nothing to do here right now",
    body: "You can go on to Nevo and come back any time.",
    action: "Go to my lessons",
  },
};

/**
 * One of the two, in Module 4's own shell: the wordmark and the quest map
 * with three done and the fourth active, as the frame draws both. A mark, a
 * heading, a line and one way onward, centred - the mark a navy check for
 * done, a quiet lavender dash for nothing.
 */
export function ProbeEndState({
  end,
  onGo,
}: {
  end: ProbeEnd;
  onGo: () => void;
}) {
  const { heading, body, action } = PROBE_END_COPY[end];
  return (
    <ProfilingShell filled={DONE_BEFORE} active={DONE_BEFORE}>
      <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center">
        <div className="flex w-full max-w-[440px] flex-col items-center text-center">
          <span
            aria-hidden="true"
            className={cn(
              "flex size-16 shrink-0 items-center justify-center rounded-full",
              end === "done"
                ? "bg-nevo-navy text-nevo-cream"
                : "bg-nevo-violet/22 text-nevo-navy",
            )}
          >
            {end === "done" ? (
              <svg
                width="30"
                height="30"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            ) : (
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              >
                <path d="M6 12h12" />
              </svg>
            )}
          </span>
          <h1 className="mt-6 text-[22px] leading-[1.25] font-semibold tracking-[-0.01em] text-balance text-nevo-near-black">
            {heading}
          </h1>
          <p className="mt-3 text-base leading-[1.6] text-pretty text-nevo-violet-text">
            {body}
          </p>
          <Button className="mt-7 px-7 text-base" onClick={onGo}>
            {action}
          </Button>
        </div>
      </div>
    </ProfilingShell>
  );
}
