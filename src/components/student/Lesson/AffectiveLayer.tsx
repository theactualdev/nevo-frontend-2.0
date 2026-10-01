"use client";

import { useEffect, useRef, useState } from "react";
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
 * The pill below is drawn 36px tall and touched at 44: the button is the hit
 * area, the inner span is the pill, and `-my-1` keeps the layout the frame
 * draws.
 *
 * There were two pills. `DifficultyOfferPill` - "Ready for something
 * harder?" - went with design's 1 Oct ruling retiring the step-up (D28).
 */
const PILL_HIT = "group -my-1 inline-flex h-11 cursor-pointer items-center";

/** 37b's `socraticQ`: one guided question, a 40px row on the cream card. */
const PROMPT_ROW =
  "flex min-h-10 items-center rounded-[10px] bg-nevo-cream px-4 py-2 text-[13.5px] leading-[1.45] text-nevo-near-black";

/** Every prompt opened and not answered, said once and forgotten. */
function leave(still: Set<string>, onAbandon?: (promptId: string) => void) {
  for (const id of still) onAbandon?.(id);
  still.clear();
}

/** A row the panel lists: an answerable prompt, or a bare guided question. */
export interface PanelPrompt {
  /** Absent on a bare `guidedQuestions` string, which cannot be answered. */
  id?: string;
  prompt: string;
  options?: string[];
}

/**
 * `show_socratic_panel`: "Which part is unclear?" opens 2-3 guided questions
 * that think the idea through rather than handing the answer over. The panel
 * never blocks (no scrim) and carries its own visible 44px dismiss.
 *
 * ANSWERABLE SINCE 1 OCT (B19). A guided prompt has an id and may carry
 * options. 37b draws each question as a target, so tapping one with options
 * opens them beneath it, drawn as the same targets, and picking one is the
 * reply - the option, never anything typed. A prompt without options stays
 * a question to think about: 37b draws no field to answer in, so none is
 * invented here, and the contract's `responseLength` path waits on design.
 *
 * Leaving a prompt the child had opened without picking is `abandoned`, said
 * once - on the panel's close, or as the segment moves on under it.
 */
export function SocraticPanel({
  prompts,
  onShown,
  onAnswer,
  onAbandon,
}: {
  prompts: PanelPrompt[];
  /** The panel opened with these answerable prompts on screen, first time only. */
  onShown?: (promptIds: string[]) => void;
  /** The child picked an option. */
  onAnswer?: (promptId: string, option: string) => void;
  /** The child left a prompt they had opened without picking. */
  onAbandon?: (promptId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [answered, setAnswered] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  // Read by the unmount cleanup, which sees only refs.
  const opened = useRef<Set<string>>(new Set());
  const shown = useRef(false);
  const abandon = useRef(onAbandon);
  useEffect(() => {
    abandon.current = onAbandon;
  }, [onAbandon]);

  // The segment moving on under an open prompt leaves it too. The set is the
  // same object for the panel's whole life, so it is safe to hold here.
  useEffect(() => {
    const still = opened.current;
    return () => leave(still, abandon.current);
  }, []);

  const openPanel = () => {
    setOpen(true);
    if (shown.current) return;
    shown.current = true;
    const ids = prompts.flatMap((p) => (p.id ? [p.id] : []));
    if (ids.length > 0) onShown?.(ids);
  };

  const closePanel = () => {
    setOpen(false);
    setActive(null);
    leave(opened.current, onAbandon);
  };

  const pick = (id: string, option: string) => {
    opened.current.delete(id);
    setAnswered((prev) => new Set(prev).add(id));
    setActive(null);
    onAnswer?.(id, option);
  };

  return (
    <>
      <div className="mb-4 flex justify-center">
        <button
          type="button"
          aria-expanded={open}
          onClick={openPanel}
          className={PILL_HIT}
        >
          <span className="inline-flex h-9 items-center rounded-[20px] bg-nevo-cream-elevated px-[18px] text-[13px] text-nevo-near-black transition-transform group-active:scale-[0.98]">
            Which part is unclear?
          </span>
        </button>
      </div>
      {open && (
        <div className="fixed inset-x-0 bottom-0 z-30 max-h-[85dvh] overflow-y-auto rounded-t-[16px] bg-[#e5dfd3] px-[22px] pt-4 pb-[22px] shadow-[0_-8px_28px_rgba(43,43,47,0.14)] motion-safe:animate-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-300 motion-safe:ease-nevo-slide">
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
                onClick={closePanel}
                className="-mr-2 flex size-11 cursor-pointer items-center justify-center rounded-full text-nevo-navy transition-colors hover:bg-nevo-navy/8"
              >
                <ChevronDown className="size-5" strokeWidth={2.2} />
              </button>
            </div>
            {/* Guided questions - 40px+ rows, 44px where a tap does something.
                Only a prompt with options can be tapped; the rest, and one
                already answered, read as questions to think about. */}
            <div className="mt-3 flex flex-col gap-2">
              {prompts.map((p, i) => {
                const id = p.id;
                const options = p.options ?? [];
                if (!id || options.length === 0 || answered.has(id)) {
                  return (
                    <div key={id ?? `q-${i}`} className={PROMPT_ROW}>
                      {p.prompt}
                    </div>
                  );
                }
                const expanded = active === id;
                return (
                  <div key={id} className="flex flex-col gap-2">
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => {
                        opened.current.add(id);
                        setActive(expanded ? null : id);
                      }}
                      className={cn(
                        PROMPT_ROW,
                        "min-h-11 w-full cursor-pointer text-left transition-colors hover:bg-nevo-cream-elevated",
                      )}
                    >
                      {p.prompt}
                    </button>
                    {expanded && (
                      <div
                        role="group"
                        aria-label={p.prompt}
                        className="flex flex-col gap-2 pl-4"
                      >
                        {options.map((option) => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => pick(id, option)}
                            className="flex min-h-11 w-full cursor-pointer items-center rounded-[10px] border-[1.5px] border-nevo-navy/25 px-4 py-2 text-left text-[13.5px] leading-[1.45] text-nevo-near-black transition-colors hover:bg-nevo-navy/6"
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * `offer_hint`: the unrequested hint - a calm card, never an alarm.
 *
 * THE CHILD CAN CLOSE IT (design, 1 Oct, D29): "with a labelled control
 * rather than a faint unlabelled X. Support a child cannot dismiss becomes an
 * obstruction." So the control says what it does, in words, at 44px. The
 * player decides how long closed lasts - for that hint, on that segment.
 */
export function HintOverlay({
  hint,
  onClose,
}: {
  hint: string;
  onClose: () => void;
}) {
  return (
    <div className="mt-4 rounded-[8px] border-l-[3px] border-nevo-violet bg-[#e5dfd3] px-4 pt-3.5 pb-1">
      <p className="text-sm leading-[1.5] text-nevo-near-black">{hint}</p>
      <div className="flex justify-end">
        <button
          type="button"
          aria-label="Close hint"
          onClick={onClose}
          className="-mr-2 flex h-11 cursor-pointer items-center rounded-[10px] px-3 text-[13px] font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/8"
        >
          Close
        </button>
      </div>
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
