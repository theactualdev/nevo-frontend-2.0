"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { NevoKeyboard } from "@/components/shared";
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

/** 38's `qActive`: the prompt being answered, ringed in violet. */
const PROMPT_ACTIVE = "border-[1.5px] border-nevo-violet/60 py-[11px]";
/** 38's `qAnswered`, without the quoted answer - see `SocraticPanel`. */
const PROMPT_ANSWERED = "bg-nevo-violet/14 text-[13px] text-nevo-near-black/70";
/** 38's `qIdle`: the other prompts, while one is being answered. */
const PROMPT_IDLE = "text-nevo-near-black/50";

/** 38's Send: full width, 44px, navy - never greyed out. */
const SEND =
  "flex h-11 w-full cursor-pointer items-center justify-center rounded-[10px] bg-nevo-navy text-[14px] font-semibold text-nevo-cream transition-[filter,transform] hover:brightness-108 active:scale-[0.985]";

/** `GuidedAnswerRequest.responseLength` is 0 to 10000 on the contract. */
const MAX_RESPONSE_LENGTH = 10_000;

/** Frame 38's line for Send on an empty write-in, verbatim. */
const TYPE_FIRST = "Type a little first, then Send.";
/**
 * Send with no choice picked. Design ruled the behaviour ("exactly as the
 * empty written answer does") and drew no words for it, so this is the drawn
 * sentence with a pick in place of typing - ruled correct as written by
 * product (7 Oct).
 */
const PICK_FIRST = "Pick one first, then Send.";

/** 38's in-place note under a Send that had nothing to send. */
function SendNudge({ children }: { children: string }) {
  return (
    <div
      role="status"
      className="mt-2.5 flex items-start gap-2 rounded-[10px] bg-nevo-violet/18 px-[13px] py-2.5"
    >
      <span
        aria-hidden
        className="mt-[5px] size-[7px] shrink-0 rounded-full bg-nevo-violet"
      />
      <span className="text-[12.5px] leading-[1.5] text-nevo-near-black">
        {children}
      </span>
    </div>
  );
}

/** Every prompt opened and not answered, said once and forgotten. */
function leave(still: Set<string>, onAbandon?: (promptId: string) => void) {
  for (const id of still) onAbandon?.(id);
  still.clear();
}

/** A copy of `map` without `key`, for a state update. */
function without<V>(map: ReadonlyMap<string, V>, key: string) {
  const next = new Map(map);
  next.delete(key);
  return next;
}

/** A row the panel lists: an answerable prompt, or a bare guided question. */
export interface PanelPrompt {
  /** Absent on a bare `guidedQuestions` string, which cannot be answered. */
  id?: string;
  prompt: string;
  options?: string[];
}

/**
 * What a reply carries: the option picked, or how much was written. Never the
 * words - there is no shape here that could hold them.
 */
export type GuidedReply = { option: string } | { responseLength: number };

/**
 * `moved_on` the first time a prompt is answered, `asked_again` every time
 * after (B41): the child went back to the same question rather than on.
 */
export type GuidedAnswerOutcome = "moved_on" | "asked_again";

/**
 * How the panel was reached, which decides how it ends - see `SocraticPanel`.
 */
export type PanelEntry = "self" | "handoff";

/**
 * `show_socratic_panel`: "Which part is unclear?" opens 2-3 guided questions
 * that think the idea through rather than handing the answer over. The panel
 * never blocks (no scrim) and carries its own visible 44px dismiss.
 *
 * ANSWERED IN THE PANEL, AS FRAME 38 DRAWS IT (design, 6 Oct). Each prompt
 * with an id is a target. Tapping one rings it and opens its answer under it:
 * - WITH CHOICES, single select and then a separate Send. "Picking isn't
 *   answering": a choice sits selected until Send, and changing it first is
 *   just a change.
 * - WITH NO CHOICES, one line, the Nevo keyboard inside the sheet, and Send.
 * Either way Send is there from the start, and pressed with nothing to send
 * it stays pressable and says so in place rather than going grey (design, 6
 * Oct: "exactly as the empty written answer does"). The written path's words
 * are the frame's; the choices path has none drawn, so its line is the same
 * sentence for a pick - see `PICK_FIRST`.
 *
 * THE CHILD'S WORDS STAY HERE. A write-in sends its length and nothing else,
 * which is all the contract accepts, and the field is cleared once it is sent.
 *
 * AN ANSWER IS NOT MARKED: "left to backend - not drawn here on a guess", and
 * the answer route returns nothing to show. So the prompt simply closes, takes
 * 38's answered tint, and stays a target - opening it again and sending is the
 * child asking the same question again (`asked_again`).
 *
 * TWO ENDINGS, AND THE PANEL IS TOLD WHICH (SCRUM-241, frame 38 §4 and 38a).
 * Once every answerable prompt has been answered the panel closes on one:
 * - "self", the child opened it from the confusion prompt: "Want to try the
 *   question again now?" and Try again, the way back to the question. Only
 *   where there is a question to go back to (`onTryAgain`); otherwise the
 *   panel simply stays as it is.
 * - "handoff", the system handed the child off after repeated attempts at the
 *   check: the panel arrives open, with nothing to accept or decline, and
 *   ends on "Let's keep going." and Keep going, on into the next segment. No
 *   Try again: sending this child back to the question is the loop the
 *   hand-off exists to break.
 * Which one is never worked out from what the child does in here. The backend
 * owns the hand-off and the front end never counts attempts.
 *
 * NOT RENDERED from the frame's endings: the "You've got it" label and the
 * sentence naming the idea ("That's photosynthesis."). Guided answers are not
 * marked, so nothing says the child got it, and no field names the idea.
 *
 * Leaving a prompt the child had opened without sending is `abandoned`, said
 * once - on the panel's close, or as the segment moves on under it.
 */
export function SocraticPanel({
  prompts,
  entry = "self",
  onTryAgain,
  onKeepGoing,
  onShown,
  onAnswer,
  onAbandon,
}: {
  prompts: PanelPrompt[];
  /** How the panel was reached. Told at the way in, never inferred. */
  entry?: PanelEntry;
  /** The self-opened ending's way back to the question. */
  onTryAgain?: () => void;
  /** The handed-off ending's way on into the next segment. */
  onKeepGoing?: () => void;
  /**
   * The panel opened, first time only, with these answerable prompts on
   * screen - none when it lists only bare questions.
   */
  onShown?: (promptIds: string[]) => void;
  /** The child pressed Send on a prompt. */
  onAnswer?: (
    promptId: string,
    reply: GuidedReply,
    outcome: GuidedAnswerOutcome,
  ) => void;
  /** The child left a prompt they had opened without sending. */
  onAbandon?: (promptId: string) => void;
}) {
  // A hand-off arrives open; the child opens it otherwise.
  const [open, setOpen] = useState(entry === "handoff");
  const [active, setActive] = useState<string | null>(null);
  const [answered, setAnswered] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  /** The choice sitting selected, per prompt, until Send. */
  const [picked, setPicked] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  /** What the child has typed, per prompt - on this screen and nowhere else. */
  const [drafts, setDrafts] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  /** The prompt whose Send was pressed with nothing picked or typed. */
  const [nudged, setNudged] = useState<string | null>(null);
  // Read by the unmount cleanup, which sees only refs.
  const opened = useRef<Set<string>>(new Set());
  const shown = useRef(false);
  const abandon = useRef(onAbandon);
  const field = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    abandon.current = onAbandon;
  }, [onAbandon]);

  // The segment moving on under an open prompt leaves it too. The set is the
  // same object for the panel's whole life, so it is safe to hold here.
  useEffect(() => {
    const still = opened.current;
    return () => leave(still, abandon.current);
  }, []);

  // A write-in opens ready to type into, so a hardware keyboard works too.
  useEffect(() => {
    if (active) field.current?.focus();
  }, [active]);

  // Said once, the first time the panel is on screen: opened by the child, or
  // arriving open on a hand-off.
  useEffect(() => {
    if (!open || shown.current) return;
    shown.current = true;
    onShown?.(prompts.flatMap((p) => (p.id ? [p.id] : [])));
  }, [open, prompts, onShown]);

  const openPanel = () => setOpen(true);

  const closePanel = () => {
    setOpen(false);
    setActive(null);
    setNudged(null);
    leave(opened.current, onAbandon);
  };

  /*
   * WORKED THROUGH: every prompt that can be answered has been. A panel of
   * bare questions has nothing to answer, so only a hand-off - which must
   * always have a way on - counts it as worked through from the start.
   */
  const answerable = prompts.flatMap((p) => (p.id ? [p.id] : []));
  const workedThrough =
    answerable.length > 0
      ? answerable.every((id) => answered.has(id))
      : entry === "handoff";
  const ending =
    workedThrough && active === null
      ? entry === "handoff"
        ? onKeepGoing && {
            line: "Let's keep going.",
            action: "Keep going",
            go: onKeepGoing,
          }
        : onTryAgain && {
            line: "Want to try the question again now?",
            action: "Try again",
            go: onTryAgain,
          }
      : undefined;

  const toggle = (id: string) => {
    // An answered prompt opened again is not abandoned if it is left: it was
    // answered. Only one never sent can be.
    if (!answered.has(id)) opened.current.add(id);
    setNudged(null);
    setActive(active === id ? null : id);
  };

  const send = (id: string, reply: GuidedReply) => {
    const outcome: GuidedAnswerOutcome = answered.has(id)
      ? "asked_again"
      : "moved_on";
    opened.current.delete(id);
    setAnswered((prev) => new Set(prev).add(id));
    setPicked((prev) => without(prev, id));
    setDrafts((prev) => without(prev, id));
    setNudged(null);
    setActive(null);
    onAnswer?.(id, reply, outcome);
  };

  const sendPicked = (id: string) => {
    const choice = picked.get(id);
    if (choice === undefined) {
      setNudged(id);
      return;
    }
    send(id, { option: choice });
  };

  const sendWritten = (id: string) => {
    const length = (drafts.get(id) ?? "").trim().length;
    if (length === 0) {
      setNudged(id);
      return;
    }
    send(id, { responseLength: Math.min(length, MAX_RESPONSE_LENGTH) });
  };

  const write = (id: string, next: (text: string) => string) => {
    setNudged(null);
    setDrafts((prev) => new Map(prev).set(id, next(prev.get(id) ?? "")));
  };

  /** The prompt open for a write-in, which is what docks the keyboard. */
  const writingIn =
    prompts.find(
      (p) => p.id !== undefined && p.id === active && !p.options?.length,
    )?.id ?? null;

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
                A bare question has no id to answer against, so it reads as a
                question to think about. */}
            <div className="mt-3 flex flex-col gap-2">
              {prompts.map((p, i) => {
                const id = p.id;
                if (!id) {
                  return (
                    <div key={`q-${i}`} className={PROMPT_ROW}>
                      {p.prompt}
                    </div>
                  );
                }
                const options = p.options ?? [];
                const expanded = active === id;
                const choice = picked.get(id);
                const text = drafts.get(id) ?? "";
                return (
                  <div key={id} className="flex flex-col">
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => toggle(id)}
                      className={cn(
                        PROMPT_ROW,
                        "min-h-11 w-full cursor-pointer text-left transition-colors hover:bg-nevo-cream-elevated",
                        expanded
                          ? PROMPT_ACTIVE
                          : answered.has(id)
                            ? PROMPT_ANSWERED
                            : active && PROMPT_IDLE,
                      )}
                    >
                      {p.prompt}
                    </button>
                    {expanded && options.length > 0 && (
                      <>
                        <div
                          role="radiogroup"
                          aria-label={p.prompt}
                          className="mt-2.5 flex flex-col gap-2"
                        >
                          {options.map((option) => {
                            const on = choice === option;
                            return (
                              <button
                                key={option}
                                type="button"
                                role="radio"
                                aria-checked={on}
                                onClick={() => {
                                  setNudged(null);
                                  setPicked((prev) =>
                                    new Map(prev).set(id, option),
                                  );
                                }}
                                className={cn(
                                  "flex min-h-11 w-full cursor-pointer items-center justify-between gap-2.5 rounded-[10px] border-[1.5px] bg-nevo-cream px-3.5 py-[11px] text-left text-[13.5px] leading-[1.45] text-nevo-near-black transition-colors",
                                  on
                                    ? "border-nevo-navy font-semibold"
                                    : "border-nevo-near-black/18 font-medium hover:border-nevo-near-black/30",
                                )}
                              >
                                {option}
                                {on && (
                                  <span
                                    aria-hidden
                                    className="flex size-5 shrink-0 items-center justify-center rounded-full bg-nevo-navy"
                                  >
                                    <Check
                                      className="size-[11px] text-nevo-cream"
                                      strokeWidth={2.8}
                                    />
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                        <button
                          type="button"
                          onClick={() => sendPicked(id)}
                          className={cn(SEND, "mt-3.5")}
                        >
                          Send
                        </button>
                        {nudged === id && <SendNudge>{PICK_FIRST}</SendNudge>}
                      </>
                    )}
                    {expanded && options.length === 0 && (
                      <>
                        <input
                          ref={field}
                          value={text}
                          onChange={(e) => {
                            const typed = e.target.value;
                            write(id, () => typed);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") sendWritten(id);
                          }}
                          // The Nevo keyboard below drives entry on touch; a
                          // hardware keyboard still types on desktop.
                          inputMode="none"
                          autoComplete="off"
                          aria-label={p.prompt}
                          placeholder="Type your answer"
                          className={cn(
                            "mt-3 min-h-12 w-full rounded-[10px] border-[1.5px] bg-nevo-cream px-3.5 py-3 text-[13.5px] leading-[1.4] text-nevo-near-black outline-none placeholder:text-nevo-near-black/40",
                            text
                              ? "border-nevo-violet/60"
                              : "border-nevo-near-black/18",
                          )}
                        />
                        <button
                          type="button"
                          onClick={() => sendWritten(id)}
                          className={cn(SEND, "mt-3")}
                        >
                          Send
                        </button>
                        {nudged === id && <SendNudge>{TYPE_FIRST}</SendNudge>}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            {/* 38's ending: Nevo's line in navy, then the one way on. */}
            {ending && (
              <>
                <p
                  role="status"
                  className="mt-2 rounded-[10px] bg-nevo-navy px-4 py-3.5 text-[13.5px] leading-[1.5] text-nevo-cream"
                >
                  {ending.line}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    closePanel();
                    ending.go();
                  }}
                  className={cn(SEND, "mt-3.5")}
                >
                  {ending.action}
                </button>
              </>
            )}
            {/* Inside the sheet, edge to edge at its foot, and never the
                device's own keyboard. It hides itself where a real keyboard
                exists, and stays in reach when the sheet scrolls. */}
            {writingIn && (
              <NevoKeyboard
                layout="qwerty"
                onKey={(c) => write(writingIn, (t) => t + c)}
                onBackspace={() => write(writingIn, (t) => t.slice(0, -1))}
                onReturn={() => sendWritten(writingIn)}
                className="sticky bottom-0 -mx-[22px] mt-3.5 -mb-[22px]"
              />
            )}
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
