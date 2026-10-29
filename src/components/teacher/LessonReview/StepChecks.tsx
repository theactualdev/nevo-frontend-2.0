"use client";

import { useState } from "react";
import type {
  CalculationPartsReviewItem,
  CheckAnswerKey,
  CheckOption,
  GuidedCheckStep,
} from "@/lib/api/lessons";
import { cn } from "@/lib/utils";
import { answerText, type CheckRow, type ChecksView } from "./reviewModel";

/**
 * C07k step 3, the checks (SCRUM-291).
 *
 * WHAT THE LESSON ASKS, READ BEFORE THE VARIANTS (Lydia, 25 Oct: "A teacher
 * reads what the lesson says, then what it asks, then the variants"). Each
 * check opens to its question, its choices with the answer marked, and the
 * guiding questions Nevo asks a child who misses it, each with its own
 * answer. Lydia, 24 Oct: a question and its answer have to be READ - so they
 * are here to open, and one press accepts them, as on the key points.
 *
 * BUILT ON THE KEY-POINTS STEP'S PATTERN (Lydia, 26 Oct: "It is the same
 * shape and a new frame would not teach us anything"):
 *  - what wants a look sits at the top: a guiding question whose explanation
 *    may give the answer away, by the server's own test;
 *  - the rest are listed to open, five then "+ N more";
 *  - one press at the foot, held only by what the server holds it on.
 *
 * NOTHING HERE DECIDES WHAT NEEDS A TEACHER. Which checks the press signs,
 * which came with their answer in the file, and which cannot be marked are
 * the server's answers (`teacherReviewed`, `markable`), sorted by
 * `checksView`. A check whose answer was written in the lesson is shown and
 * never signed: nothing generated it (Lydia, 26 Oct).
 */

const SHOWN = 5;

const EYEBROW =
  "block font-mono text-[11px] font-bold tracking-[0.1em] text-nevo-violet uppercase";
const SECTION_LABEL =
  "font-mono text-[11px] font-bold tracking-[0.08em] text-nevo-near-black/50 uppercase";
const H2 =
  "mt-3 text-[20px] font-semibold tracking-[-0.012em] text-nevo-near-black xl:text-[24px]";
const SUB = "text-[13.5px] leading-[1.55] text-nevo-near-black/62 xl:text-[14.5px]";
const ROW_TEXT = "text-[14px] leading-[1.5] text-nevo-near-black xl:text-[15px]";
const CARD = "rounded-[12px] bg-nevo-cream-elevated shadow-elevation-1";
const MINI_PRIMARY =
  "inline-flex h-9 cursor-pointer items-center rounded-[10px] bg-nevo-navy px-[15px] text-[13px] font-semibold text-nevo-cream transition-[filter] hover:brightness-104 disabled:cursor-default disabled:opacity-55";
const TAG = "block font-mono text-[10px] font-bold tracking-[0.1em] text-nevo-violet uppercase";
const DETAIL = "text-[13.5px] leading-[1.6] text-nevo-near-black/72 xl:text-[14px]";

function Tick({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("transition-transform duration-150", open && "rotate-180")}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/**
 * PLACEHOLDER WORDS for the calculation reveal parts (8c4ccef), proposed to
 * Lydia as question 16 (29 Oct) and held until she answers. One place, so
 * her words replace these and nothing else.
 */
export const PARTS_COPY = {
  label: "When a child slows down, these steps arrive in pieces",
  waiting: "A child gets these pieces only once you accept them. Until then, each step arrives whole.",
  accepted: "Accepted. A child who slows down gets these pieces in this order.",
  press: "Accept the pieces",
  pressing: "Accepting…",
} as const;

export function StepChecks({
  view,
  signed,
  readLeaks,
  onReadLeak,
  parts = [],
  onAcceptParts,
  acceptingParts = false,
  partsRefusal = null,
}: {
  view: ChecksView;
  /** Nothing in this step waits for a sign-off any more. */
  signed: boolean;
  readLeaks: ReadonlySet<string>;
  onReadLeak: (key: string) => void;
  /** A calculation step's reveal parts, waiting or accepted (8c4ccef). */
  parts?: CalculationPartsReviewItem[];
  onAcceptParts?: () => void;
  acceptingParts?: boolean;
  partsRefusal?: string | null;
}) {
  const hasGuided = [...view.toSign, ...view.reviewed, ...view.guidedOnly].some((r) => r.guided);
  const sub = !view.exists
    ? "This lesson has no checks, so there is nothing to accept here."
    : !signed
      ? hasGuided
        ? "Each check shows the answer Nevo marks it against, and the guiding questions it asks a child who misses it. Read any you like - Accept keeps them all."
        : "Each check shows the answer Nevo marks it against. Read any you like - Accept keeps them all."
      : view.signoff
        ? "Accepted. Open any to read it again."
        : "Every check here came with its answer in your file, so there is nothing to accept.";

  return (
    <div>
      <span className={EYEBROW}>Step 3 of 5 · the checks</span>
      <h2 className={H2}>The checks, and the answers they&rsquo;re marked against</h2>
      <p className={cn(SUB, "mt-2")}>{sub}</p>

      {view.leaks.length > 0 && !signed && (
        <div className="mt-[22px]">
          <span className={SECTION_LABEL}>Nevo wants your eyes on these</span>
          <div className="mt-3 flex flex-col gap-2.5">
            {view.leaks.map((leak) => (
              <LeakCard
                key={leak.key}
                prompt={leak.row.prompt}
                step={leak.step}
                read={readLeaks.has(leak.key)}
                onRead={() => onReadLeak(leak.key)}
              />
            ))}
          </div>
        </div>
      )}

      {view.toSign.length > 0 && (
        <CheckList label="Answers Nevo wrote - yours to accept" rows={view.toSign} />
      )}
      {view.reviewed.length > 0 && (
        <CheckList
          label={
            view.signoff?.kind === "checks" ? "The checks" : "Answers from your file - nothing to accept"
          }
          rows={view.reviewed}
        />
      )}
      {view.guidedOnly.length > 0 && <CheckList label="Guiding questions" rows={view.guidedOnly} />}

      {view.unmarkable.length > 0 && (
        <div className="mt-6">
          <span className={SECTION_LABEL}>Nevo can&rsquo;t mark these</span>
          <div className="mt-3 flex flex-col gap-2.5">
            {view.unmarkable.map((row) => (
              <div key={row.key} className={cn(CARD, "px-[17px] py-[15px]")}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <span className="block text-[12px] text-nevo-near-black/50">{row.label}</span>
                    <p className={cn(ROW_TEXT, "mt-0.5")}>{row.prompt || "A check with no question."}</p>
                    <span className="mt-1 block text-[12.5px] leading-[1.45] text-nevo-violet-text">
                      Nevo has no answer to mark this against, so it never stops a child.
                    </span>
                  </div>
                  <span className="shrink-0 rounded-full bg-nevo-navy/10 px-2.5 py-[3px] text-[11px] font-semibold whitespace-nowrap text-nevo-near-black/60">
                    Can&rsquo;t mark
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {parts.length > 0 && (
        <RevealParts
          items={parts}
          onAccept={onAcceptParts}
          accepting={acceptingParts}
          refusal={partsRefusal}
        />
      )}
    </div>
  );
}

/**
 * A calculation step's reveal parts (8c4ccef), with their own press.
 *
 * ITS OWN PRESS, not the checks': the parts never hold back Assign, so the
 * step's footer and the last step say nothing of them. ALL OR NONE, because
 * the server has no per-step route - a teacher who disagrees with one step
 * cannot accept the rest (raised with Lydia, 29 Oct).
 */
function RevealParts({
  items,
  onAccept,
  accepting,
  refusal,
}: {
  items: CalculationPartsReviewItem[];
  onAccept?: () => void;
  accepting: boolean;
  refusal: string | null;
}) {
  const waiting = items.some((item) => item.reviewStatus === "pending_review");
  return (
    <div className="mt-6">
      <span className={SECTION_LABEL}>{PARTS_COPY.label}</span>
      <p className={cn(SUB, "mt-1.5")}>{waiting ? PARTS_COPY.waiting : PARTS_COPY.accepted}</p>
      <div className="mt-3 flex flex-col gap-2.5">
        {items.map((item) => (
          <div key={`${item.segmentId}:${item.stepId}`} className={cn(CARD, "px-[17px] py-[15px]")}>
            {item.segmentTitle && (
              <span className="block text-[12px] text-nevo-near-black/50">{item.segmentTitle}</span>
            )}
            <p className={cn(ROW_TEXT, "mt-0.5")}>{item.prompt}</p>
            <ol className="mt-2.5 flex list-none flex-col gap-1.5 p-0">
              {item.parts.map((part, i) => (
                <li key={i} className={cn(DETAIL, "flex gap-2.5")}>
                  <span className="w-4 shrink-0 text-right font-semibold text-nevo-navy">{i + 1}</span>
                  <span className="min-w-0">{part}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
      {waiting && onAccept && (
        <div className="mt-3.5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onAccept}
            disabled={accepting}
            className={cn(MINI_PRIMARY, accepting ? "cursor-wait opacity-70" : "cursor-pointer")}
          >
            {accepting ? PARTS_COPY.pressing : PARTS_COPY.press}
          </button>
          {refusal && <span className="text-[13px] leading-[1.5] text-nevo-violet-text">{refusal}</span>}
        </div>
      )}
    </div>
  );
}

/** One group of checks, five shown, each opening to its answer. */
function CheckList({ label, rows }: { label: string; rows: CheckRow[] }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, SHOWN);
  return (
    <div className="mt-6">
      <span className={SECTION_LABEL}>{label}</span>
      <div className={cn(CARD, "mt-3 overflow-hidden")}>
        {shown.map((row) => {
          const isOpen = open.has(row.key);
          return (
            <div key={row.key} className="border-b border-nevo-near-black/6">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() =>
                  setOpen((s) => {
                    const next = new Set(s);
                    if (isOpen) next.delete(row.key);
                    else next.add(row.key);
                    return next;
                  })
                }
                className="flex w-full cursor-pointer items-center gap-3 border-none bg-transparent px-[17px] py-[13px] text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] text-nevo-near-black/50">{row.label}</span>
                  <span className={cn(ROW_TEXT, "mt-0.5 block leading-[1.45]")}>{row.prompt}</span>
                </span>
                <span className="shrink-0 text-nevo-near-black/40">
                  <Chevron open={isOpen} />
                </span>
              </button>
              {isOpen && (
                <div className="flex flex-col gap-4 px-[17px] pb-4">
                  {row.type && <Answer type={row.type} options={row.options} answerKey={row.answerKey} />}
                  {row.guided && row.guided.steps.length > 0 && (
                    <div>
                      <span className={TAG}>If a child misses it, Nevo asks</span>
                      <ol className="mt-2 flex list-none flex-col gap-3 p-0">
                        {row.guided.steps.map((step, i) => (
                          <li key={step.id} className="flex gap-2.5">
                            <span className="w-4 shrink-0 text-[13px] text-nevo-near-black/45 tabular-nums">
                              {i + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className={cn(DETAIL, "text-nevo-near-black")}>{step.prompt}</p>
                              <div className="mt-1.5">
                                <Answer
                                  type={step.answerType}
                                  options={step.options ?? []}
                                  answerKey={step.answerKey}
                                  compact
                                />
                              </div>
                              {step.explanation && (
                                <p className="mt-1.5 text-[13px] leading-[1.55] text-nevo-near-black/60">
                                  {`If they get it wrong: ${step.explanation}`}
                                </p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {rows.length > SHOWN && !all && (
          <button
            type="button"
            onClick={() => setAll(true)}
            className="w-full cursor-pointer border-none bg-transparent px-[17px] py-3 text-left text-[12.5px] text-nevo-near-black/55 hover:text-nevo-navy"
          >
            {`+ ${rows.length - SHOWN} more`}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The answer a check is marked against: its choices with the right ones
 * ticked, or the answer itself where there are no choices.
 */
function Answer({
  type,
  options,
  answerKey,
  compact = false,
}: {
  type: string;
  options: CheckOption[];
  answerKey: CheckAnswerKey;
  compact?: boolean;
}) {
  // True-or-false with labelled options reads as a choice too.
  const choice =
    (type === "single_choice" || type === "multiple_choice" || type === "boolean") &&
    options.length > 0;
  if (!choice) {
    const answer = answerText(type, options, answerKey);
    return (
      <p className={compact ? "text-[13px] leading-[1.55] text-nevo-near-black/72" : DETAIL}>
        <span className="font-semibold text-nevo-near-black">The answer: </span>
        {answer ?? "none given"}
      </p>
    );
  }
  const right = new Set(
    answerKey === null ? [] : Array.isArray(answerKey) ? answerKey : [answerKey],
  );
  return (
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
      {options.map((o) => {
        const isRight = right.has(o.value);
        return (
          <li
            key={String(o.value)}
            className={cn(
              "flex items-center gap-2.5 rounded-[10px] px-3 py-2",
              compact ? "text-[13px]" : "text-[13.5px] xl:text-[14px]",
              isRight ? "bg-nevo-violet/16 font-medium text-nevo-near-black" : "text-nevo-near-black/70",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "flex size-[18px] shrink-0 items-center justify-center rounded-full",
                isRight ? "bg-nevo-navy text-nevo-cream" : "border-[1.5px] border-nevo-navy/25",
              )}
            >
              {isRight && <Tick size={11} />}
            </span>
            <span className="min-w-0 flex-1">{o.label}</span>
            {isRight && <span className="shrink-0 text-[11.5px] font-semibold text-nevo-navy">The answer</span>}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A guiding question whose wrong-answer explanation may state the answer -
 * the server's own test (`answerLeakageStepIds`). "Looks right" writes
 * nothing; the one press is the write. It does not hold the press: as for a
 * flagged key point, handle or accept, your call.
 */
function LeakCard({
  prompt,
  step,
  read,
  onRead,
}: {
  prompt: string;
  step: GuidedCheckStep;
  read: boolean;
  onRead: () => void;
}) {
  return (
    <div
      className={cn(
        CARD,
        !read && "outline-[1.5px] -outline-offset-[1.5px] outline-nevo-violet/50 outline-solid",
      )}
    >
      <div className="flex items-start gap-3 px-[17px] py-[15px]">
        <span
          aria-hidden
          className={cn(
            "mt-px flex size-[26px] shrink-0 items-center justify-center rounded-full",
            read ? "bg-nevo-navy text-nevo-cream" : "border-2 border-nevo-violet",
          )}
        >
          {read && <Tick />}
        </span>
        <div className="min-w-0 flex-1">
          <span className="block text-[12px] text-nevo-near-black/50">{`A guiding question for: ${prompt}`}</span>
          <p className={cn(ROW_TEXT, "mt-0.5")}>{step.prompt}</p>
          {step.explanation && (
            <p className="mt-1.5 text-[13px] leading-[1.55] text-nevo-near-black/68">
              {`If they get it wrong: ${step.explanation}`}
            </p>
          )}
          <span className="mt-1 block text-[12.5px] leading-[1.45] text-nevo-violet-text">
            {read
              ? "You read this one."
              : "This explanation may give the answer away before the child has worked it out."}
          </span>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-[3px] text-[11px] font-semibold whitespace-nowrap",
            read ? "bg-nevo-navy/10 text-nevo-near-black/60" : "bg-nevo-violet/28 text-nevo-violet-text",
          )}
        >
          {read ? "Done" : "Worth a check"}
        </span>
      </div>
      {!read && (
        <div className="flex flex-wrap items-center gap-[9px] pr-[17px] pb-[15px] pl-[51px]">
          <button type="button" onClick={onRead} className={MINI_PRIMARY}>
            Looks right
          </button>
        </div>
      )}
    </div>
  );
}
