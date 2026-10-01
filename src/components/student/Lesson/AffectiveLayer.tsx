"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The pieces §4's instructions are applied WITH. Not new screens - small
 * modulations the player composes onto the segment it is already showing.
 * Nothing here labels the student; every piece reads as the lesson being
 * helpful, not the system diagnosing.
 *
 * NAMED FOR THE INSTRUCTION, NEVER THE STATE, since 17 Sep. These were
 * `BoredomOfferPill`, `ConfusionSupport` and `FrustrationHint`, which said out
 * loud that the frontend knows which state a child is in - the one thing §4
 * says it never does. Only the authored demo ever reached them, so no child
 * saw a consequence; the cost was that the next person to read this file would
 * learn the wrong model of the system from the names alone.
 */

/**
 * The two pills below are drawn 36px tall and touched at 44: the button is the
 * hit area, the inner span is the pill, and `-my-1` keeps the layout the frame
 * draws.
 */
const PILL_HIT = "group -my-1 inline-flex h-11 cursor-pointer items-center";

/** `increase_difficulty`: the step-up offer above the content. TODO(api):
 *  acceptance asks the backend for a step up; until then the tap spends it. */
export function DifficultyOfferPill({ onSpent }: { onSpent: () => void }) {
  return (
    <div className="mb-4 flex justify-center">
      <button type="button" onClick={onSpent} className={PILL_HIT}>
        <span className="inline-flex h-9 items-center rounded-[20px] border-[1.5px] border-nevo-violet/50 bg-nevo-cream-elevated px-[18px] text-[13px] font-medium text-nevo-navy transition-transform group-active:scale-[0.98]">
          Ready for something harder?
        </span>
      </button>
    </div>
  );
}

/**
 * `show_socratic_panel`: "Which part is unclear?" opens 2-3 guided questions
 * that think the idea through rather than handing the answer over. The panel
 * never blocks (no scrim) and carries its own visible 44px dismiss.
 */
export function SocraticPanel({ prompts }: { prompts: string[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="mb-4 flex justify-center">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className={PILL_HIT}
        >
          <span className="inline-flex h-9 items-center rounded-[20px] bg-nevo-cream-elevated px-[18px] text-[13px] text-nevo-near-black transition-transform group-active:scale-[0.98]">
            Which part is unclear?
          </span>
        </button>
      </div>
      {open && (
        <div className="fixed inset-x-0 bottom-0 z-30 rounded-t-[16px] bg-[#e5dfd3] px-[22px] pt-4 pb-[22px] shadow-[0_-8px_28px_rgba(43,43,47,0.14)] motion-safe:animate-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-300 motion-safe:ease-nevo-slide">
          {/* Frame: drag handle, then the small violet uppercase label. The 44px
              dismiss is our audited addition (the panel never blocks, so it
              needs a visible close) - kept beside the label. */}
          <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-nevo-near-black/20" />
          <div className="mx-auto w-full max-w-[620px]">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold tracking-[0.06em] text-nevo-violet uppercase">
                Let&apos;s think it through
              </span>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="-mr-2 flex size-11 cursor-pointer items-center justify-center rounded-full text-nevo-navy transition-colors hover:bg-nevo-navy/8"
              >
                <ChevronDown className="size-5" strokeWidth={2.2} />
              </button>
            </div>
            {/* Guided questions - 40px+ rows. Design specifies them as targets;
                what a tap leads to is undefined until Ask Nevo integration, so
                they read as prompts for now. */}
            <div className="mt-3 flex flex-col gap-2">
              {prompts.map((prompt) => (
                <div
                  key={prompt}
                  className="flex min-h-10 items-center rounded-[10px] bg-nevo-cream px-4 py-2 text-[13.5px] leading-[1.45] text-nevo-near-black"
                >
                  {prompt}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** `offer_hint`: the unrequested hint - a calm card, never an alarm. */
export function HintOverlay({ hint }: { hint: string }) {
  return (
    <div className="mt-4 rounded-[8px] border-l-[3px] border-nevo-violet bg-[#e5dfd3] px-4 py-3.5">
      <p className="text-sm leading-[1.5] text-nevo-near-black">{hint}</p>
    </div>
  );
}

/**
 * Secondary-chrome dim: the attention accommodation simplifies the interface
 * to 30% (37c).
 *
 * It took a second flag until 1 Oct: `modulate_density` dimmed the same chrome
 * to 40%. Design removed that state (SCRUM-180) - it was not in the contract's
 * enum and could never fire, and screen comfort belongs in device settings
 * rather than in an instruction Nevo issues. This dim is an accommodation, not
 * an instruction, and is unchanged.
 */
export function secondaryDim(attention: boolean): string {
  return cn("transition-opacity duration-[400ms]", attention && "opacity-30");
}
