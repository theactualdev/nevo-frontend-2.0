"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { KeyPoint, LessonReview } from "@/lib/api/lessons";
import type { LessonReviewFlowState } from "@/hooks/useLessonReviewFlow";
import { cn } from "@/lib/utils";
import { StepMedia } from "./StepMedia";
import {
  approvalLines,
  keyPointRows,
  mediaView,
  plural,
  rewriteRows,
  rowResolved,
  signoffLine,
  WHY_FLAGGED,
  type AttentionRow,
  type RewriteKind,
  type RewriteRow,
} from "./reviewModel";

/**
 * C07k, "Send a lesson in four calm steps" (Lydia, 19 Oct; design 534ba31).
 *
 * FOUR SCREENS, NOT ONE PAGE WITH SECTIONS. Her words: "the whole fix is that
 * a teacher knows what they are being asked for and when each part is
 * finished." So each step is its own body under one stepper, with one primary
 * action pinned at the foot, and the stepper says which are done.
 *
 * ONE PRESS PER STEP. "Accept all" signs every key point, then every rewrite,
 * through Teslim's lesson-wide routes. Nobody has to open anything. What does
 * stop a teacher is only what the SERVER flagged or could not find, at the top
 * of its step, and every one of those carries the action that settles it.
 *
 * WHAT THIS DOES NOT DECIDE. Which points are flagged, which sections have no
 * point, whether the lesson is complete: all three are the review's own
 * answers. The counts on the buttons and the needs-a-look line are counts of
 * those answers, and nothing else on these screens carries a number (Lydia:
 * "counts only on the accept buttons and the needs-a-look line"). That rule
 * is followed over two counts the frame draws, in step 2's title and step 1's
 * identity line.
 */

const STEPS = ["What I made", "Key points", "Rewrites", "Live"] as const;
type Step = 1 | 2 | 3 | 4;

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
const MINI_GHOST =
  "inline-flex h-9 cursor-pointer items-center rounded-[10px] border-[1.5px] border-nevo-navy/30 px-3.5 text-[13px] font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6 disabled:cursor-default disabled:opacity-55";
const PRIMARY =
  "inline-flex h-[42px] shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-nevo-navy px-[18px] text-[13.5px] font-semibold whitespace-nowrap text-nevo-cream transition-[filter] hover:brightness-104 disabled:cursor-default disabled:opacity-55 xl:h-[46px] xl:px-[22px] xl:text-[14.5px]";
const GHOST =
  "inline-flex h-[42px] shrink-0 cursor-pointer items-center justify-center rounded-[10px] border-[1.5px] border-nevo-navy/30 px-[15px] text-[13px] font-medium whitespace-nowrap text-nevo-navy transition-colors hover:bg-nevo-navy/6 xl:h-[46px] xl:px-[18px] xl:text-[14px]";
const SPINNER_BTN =
  "inline-flex h-[42px] shrink-0 cursor-default items-center justify-center gap-[9px] rounded-[10px] bg-nevo-navy/55 px-[18px] text-[13.5px] font-semibold whitespace-nowrap text-nevo-cream xl:h-[46px] xl:px-[22px] xl:text-[14.5px]";
const SPINNER =
  "size-4 shrink-0 animate-spin rounded-full border-2 border-solid border-nevo-cream/40 border-t-nevo-cream motion-reduce:animate-none";
const TEXTAREA =
  "min-h-[62px] w-full resize-y rounded-[10px] border-[1.5px] border-nevo-navy bg-nevo-cream px-3 py-2.5 text-[14px] leading-[1.5] text-nevo-near-black outline-none xl:text-[15px]";

/** How many of a long list are drawn before "+ N more". C07k draws five. */
const SHOWN = 5;

function Check({ size = 13 }: { size?: number }) {
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

export function LessonReviewFlow({
  flow,
  initialStep,
}: {
  flow: LessonReviewFlowState & {
    lesson: NonNullable<LessonReviewFlowState["lesson"]>;
    review: LessonReview;
  };
  initialStep?: Step;
}) {
  const { lesson, review, modules } = flow;
  const segments = useMemo(
    () => [...lesson.segments].sort((a, b) => a.sequenceOrder - b.sequenceOrder),
    [lesson.segments],
  );
  const complete = review.reviewComplete === true;
  const media = mediaView(review, segments);
  /*
   * WHAT THE KEY-POINT PRESS ALSO SIGNS. Since Teslim's 10c6bf8 it approves
   * every picture and recording waiting in its snapshot. So while one is still
   * waiting, the review opens on step 1, where they are shown, and step 2's
   * press is held until they are approved there.
   */
  const mediaWaiting = media.awaiting.length > 0;
  const [step, setStep] = useState<Step>(
    initialStep ?? (complete && !mediaWaiting ? 4 : 1),
  );
  const [flaggedMedia, setFlaggedMedia] = useState<Set<string>>(() => new Set());
  const [confirmed, setConfirmed] = useState<Set<string>>(() => new Set());
  const [edited, setEdited] = useState<Set<string>>(() => new Set());

  const points = keyPointRows(review, segments, confirmed, edited);
  const flagsLeft = points.attention.filter((r) => r.kind === "flag" && !rowResolved(r)).length;
  const missingLeft = points.attention.filter((r) => r.kind === "missing" && !rowResolved(r)).length;
  const needLook = flagsLeft + missingLeft;
  const rewrites = rewriteRows(segments);
  const pointsSigned = review.keyPointApproval?.current === true;
  const rewritesSigned = review.rewriteApproval?.current === true;
  const noRewrites = (review.rewriteCount ?? rewrites.length) === 0;

  const done = (n: Step) =>
    n === 1
      ? step > 1
      : n === 2
        ? pointsSigned
        : n === 3
          ? rewritesSigned || (noRewrites && step > 3)
          : complete && step === 4;

  const back = () => setStep((s) => Math.max(1, s - 1) as Step);
  const refusedHere = (work: string) =>
    flow.refused?.work === work
      ? (flow.refused.message ?? "That didn’t go through, and nothing has changed. Try again in a moment.")
      : null;

  let footer: {
    back: React.ReactNode;
    note: string;
    alert?: boolean;
    primary: React.ReactNode;
  } | null = null;
  if (step === 1) {
    const refusal = refusedHere("media");
    const approving = flow.working === "media";
    const remake = media.awaiting.filter((m) => flaggedMedia.has(m.id)).map((m) => m.id);
    const approve = media.awaiting.filter((m) => !flaggedMedia.has(m.id)).map((m) => m.id);
    const kinds = new Set(media.awaiting.map((m) => m.kind));
    const shown = media.pictures.length + media.recordings.length;
    const next =
      needLook > 0
        ? `${needLook} ${needLook === 1 ? "key point wants" : "key points want"} a look next.`
        : null;
    footer = {
      back: (
        <Link href={`/teacher/lessons/${lesson.id}`} className={GHOST}>
          Cancel
        </Link>
      ),
      note:
        refusal ??
        (approving
          ? "Saving your approval."
          : mediaWaiting
            ? remake.length > 0
              ? `${remake.length} flagged - Nevo will remake ${remake.length === 1 ? "it" : "those"}; the rest go as they are.`
              : "One press approves everything here."
            : !media.exists
              ? next
                ? `Text only. ${next}`
                : "Text only - nothing to approve here."
              : shown === 0
                ? "Nevo is still making the pictures and narration."
                : next
                  ? `Media approved. ${next}`
                  : "Media approved. Nothing else needs you."),
      alert: Boolean(refusal),
      primary: approving ? (
        <span className={SPINNER_BTN} aria-live="polite">
          <span aria-hidden className={SPINNER} />
          Approving
        </span>
      ) : mediaWaiting ? (
        <button
          type="button"
          disabled={flow.working !== null}
          onClick={() => {
            void flow.approveMedia(approve, remake).then((ok) => {
              if (ok) setFlaggedMedia(new Set());
            });
          }}
          className={PRIMARY}
        >
          {kinds.size > 1
            ? "Approve pictures and narration"
            : kinds.has("image")
              ? "Approve the pictures"
              : "Approve the narration"}
        </button>
      ) : (
        <button type="button" onClick={() => setStep(2)} className={PRIMARY}>
          Continue to key points
        </button>
      ),
    };
  } else if (step === 2) {
    const refusal = refusedHere("keyPoints");
    const working = flow.working === "keyPoints";
    footer = {
      back: (
        <button type="button" onClick={back} className={GHOST}>
          Back
        </button>
      ),
      note:
        refusal ??
        (pointsSigned
          ? signoffLine(review.keyPointApproval!)
          : mediaWaiting
            ? "Approve the pictures and narration in step 1 first. Accepting the key points approves them too."
            : missingLeft > 0
            ? `Decide the ${plural(missingLeft, "section", "sections")} with no key point first: add one or leave it out.`
            : flagsLeft > 0
              ? `${flagsLeft} flagged above - handle or accept, your call.`
              : "One press keeps every key point."),
      alert: Boolean(refusal),
      primary: pointsSigned ? (
        <button type="button" onClick={() => setStep(3)} className={PRIMARY}>
          Continue
        </button>
      ) : (
        <button
          type="button"
          disabled={mediaWaiting || missingLeft > 0 || flow.working !== null}
          onClick={() => {
            void flow.approveKeyPoints().then((ok) => ok && setStep(3));
          }}
          className={PRIMARY}
        >
          {working
            ? "Accepting…"
            : points.kept === 1
              ? "Accept the key point"
              : `Accept all ${points.kept} key points`}
        </button>
      ),
    };
  } else if (step === 3) {
    const refusal = refusedHere("rewrites");
    footer = {
      back: (
        <button type="button" onClick={back} className={GHOST}>
          Back
        </button>
      ),
      note:
        refusal ??
        (noRewrites
          ? "Nothing to accept here."
          : rewritesSigned
            ? signoffLine(review.rewriteApproval!)
            : "One press keeps every rewrite."),
      alert: Boolean(refusal),
      primary:
        noRewrites || rewritesSigned ? (
          <button type="button" onClick={() => setStep(4)} className={PRIMARY}>
            {noRewrites ? "Continue" : "Finish"}
          </button>
        ) : (
          <button
            type="button"
            disabled={flow.working !== null}
            onClick={() => {
              void flow.approveRewrites().then((ok) => ok && setStep(4));
            }}
            className={PRIMARY}
          >
            {flow.working === "rewrites" ? "Accepting…" : "Accept all rewrites"}
          </button>
        ),
    };
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The stepper. Every step can be opened; a step is done when the
          server holds its sign-off, not when it was last on screen. */}
      <nav
        aria-label="Lesson review steps"
        className="flex-none border-b border-nevo-near-black/9 px-[22px] py-3.5 xl:px-8 xl:py-[18px]"
      >
        <ol className="m-0 flex list-none flex-wrap items-center gap-[7px] p-0 xl:gap-2.5">
          {STEPS.map((label, i) => {
            const n = (i + 1) as Step;
            const current = n === step;
            const isDone = done(n) && !current;
            return (
              <li key={label} className="flex items-center gap-[7px] xl:gap-2.5">
                <button
                  type="button"
                  onClick={() => setStep(n)}
                  aria-current={current ? "step" : undefined}
                  className="flex cursor-pointer items-center gap-[9px] border-none bg-transparent p-0"
                >
                  <span
                    className={cn(
                      "inline-flex size-[26px] shrink-0 items-center justify-center rounded-full text-[12px] font-semibold",
                      isDone || current
                        ? "bg-nevo-navy text-nevo-cream"
                        : "border-[1.5px] border-nevo-navy/30 text-nevo-near-black/50",
                      current && "shadow-[0_0_0_4px_rgba(59,63,110,0.16)]",
                    )}
                  >
                    {isDone ? <Check /> : n}
                  </span>
                  <span
                    className={cn(
                      "text-[12px] whitespace-nowrap xl:text-[13px]",
                      current ? "font-semibold text-nevo-near-black" : "font-medium text-nevo-near-black/50",
                    )}
                  >
                    {label}
                    {isDone && <span className="sr-only"> (done)</span>}
                  </span>
                </button>
                {n < 4 && (
                  <span aria-hidden className="h-[1.5px] w-3 shrink-0 bg-nevo-near-black/16 xl:w-[26px]" />
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto px-7 py-6 xl:px-10 xl:py-8",
          step === 4 && "flex flex-col justify-center",
        )}
      >
        <div className="mx-auto w-full max-w-[640px] xl:max-w-[760px]">
          {flow.changed && (
            <p role="status" className="mb-5 rounded-[12px] bg-nevo-violet/16 px-[17px] py-3.5 text-[13.5px] leading-[1.55] text-nevo-near-black/78 xl:text-[14px]">
              The lesson changed while you had it open. What you see now is the
              latest version, so look it over before you accept.
            </p>
          )}

          {step === 1 && (
            <StepMade
              title={lesson.title}
              subject={lesson.subject ?? null}
              needLook={needLook}
              mediaLine={
                mediaWaiting
                  ? `Nevo made ${[
                      media.pictures.length > 0 ? plural(media.pictures.length, "picture", "pictures") : "",
                      media.recordings.length > 0 ? plural(media.recordings.length, "recording", "recordings") : "",
                    ].filter(Boolean).join(" and ")} for this lesson. Have a look, then approve.`
                  : null
              }
              media={
                <StepMedia
                  media={media}
                  flagged={flaggedMedia}
                  onFlag={(id) =>
                    setFlaggedMedia((f) => {
                      const next = new Set(f);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    })
                  }
                  approved={!mediaWaiting}
                  working={flow.working === "media"}
                  onRetry={(id) => void flow.retryMedia(id)}
                  retrying={flow.working?.startsWith("retry:") ? flow.working.slice(6) : null}
                  retryRefusal={(id) => refusedHere(`retry:${id}`)}
                />
              }
              modules={modules}
              segments={segments}
            />
          )}

          {step === 2 && (
            <StepKeyPoints
              flow={flow}
              attention={points.attention}
              rest={points.rest}
              onConfirm={(id) => setConfirmed((s) => new Set(s).add(id))}
              onEdited={(id) => {
                setEdited((s) => new Set(s).add(id));
                setConfirmed((s) => {
                  const next = new Set(s);
                  next.delete(id);
                  return next;
                });
              }}
              refusedHere={refusedHere}
            />
          )}

          {step === 3 && (
            <StepRewrites lessonId={lesson.id} flow={flow} rows={rewrites} refusedHere={refusedHere} />
          )}

          {step === 4 && (
            <StepLive
              lessonId={lesson.id}
              review={review}
              pointsSigned={pointsSigned}
              rewritesSigned={rewritesSigned || noRewrites}
              onGo={setStep}
            />
          )}
        </div>
      </div>

      {footer && (
        <div className="flex flex-none items-center gap-3.5 border-t border-nevo-near-black/10 bg-nevo-cream px-6 py-3 xl:px-8 xl:py-3.5">
          {footer.back}
          <span
            role={footer.alert ? "alert" : undefined}
            className={cn(
              "min-w-0 flex-1 text-[12.5px] leading-[1.45]",
              footer.alert ? "font-medium text-nevo-navy" : "text-nevo-near-black/60",
            )}
          >
            {footer.note}
          </span>
          {footer.primary}
        </div>
      )}
    </div>
  );
}

/* --------------------------------- STEP 1 --------------------------------- */

function StepMade({
  title,
  subject,
  needLook,
  mediaLine,
  media,
  modules,
  segments,
}: {
  title: string;
  subject: string | null;
  needLook: number;
  /** Step 1's own line while media waits; otherwise the step names what is next. */
  mediaLine: string | null;
  media: React.ReactNode;
  modules: LessonReviewFlowState["modules"];
  segments: { id: string; title?: string | null }[];
}) {
  const [open, setOpen] = useState(false);
  const rows =
    modules.length > 0
      ? modules.map((m, i) => ({
          key: m.id,
          kicker: `Section ${i + 1}`,
          title: m.title,
          count: plural(m.segmentIds.length, "segment", "segments"),
        }))
      : segments.map((s, i) => ({
          key: s.id,
          kicker: `Section ${i + 1}`,
          title: s.title?.trim() || `Section ${i + 1}`,
          count: "",
        }));
  return (
    <div>
      <span className={EYEBROW}>Step 1 of 4 · what Nevo made of it</span>
      {/* THE header: one plain status line, and the only one on the step. */}
      <h2 className="mt-3 text-[22px] leading-[1.2] font-semibold tracking-[-0.014em] text-pretty text-nevo-near-black xl:text-[26px]">
        {mediaLine ??
          (needLook > 0
            ? `${needLook} ${needLook === 1 ? "thing needs" : "things need"} a look in the next steps.`
            : "This looks ready. Nothing needs you.")}
      </h2>
      <p className={cn(SUB, "mt-2.5 text-nevo-near-black/60")}>
        {subject ? `${title} · ${subject}` : title}
      </p>

      <div className={cn(CARD, "mt-[26px] overflow-hidden")}>
        <div className="flex items-center justify-between gap-3 border-b border-nevo-near-black/8 px-[18px] py-3.5">
          <span className="text-[13.5px] font-semibold text-nevo-near-black xl:text-[14.5px]">
            How it&rsquo;s broken up
          </span>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="shrink-0 cursor-pointer border-none bg-transparent text-[13px] font-semibold text-nevo-navy underline underline-offset-[3px]"
          >
            {open ? "Hide" : "See how it’s broken up"}
          </button>
        </div>
        {open && (
          <ul className="m-0 list-none p-0">
            {rows.map((row) => (
              <li
                key={row.key}
                className="flex items-center gap-3 border-b border-nevo-near-black/6 px-[18px] py-3 last:border-b-0"
              >
                <span className="shrink-0 font-mono text-[10px] font-bold tracking-[0.08em] text-nevo-violet uppercase">
                  {row.kicker}
                </span>
                <span className="min-w-0 flex-1 text-[13.5px] font-medium text-nevo-near-black xl:text-[14.5px]">
                  {row.title}
                </span>
                {row.count && (
                  <span className="shrink-0 text-[12px] text-nevo-near-black/50">{row.count}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {media}
    </div>
  );
}

/* --------------------------------- STEP 2 --------------------------------- */

function StepKeyPoints({
  flow,
  attention,
  rest,
  onConfirm,
  onEdited,
  refusedHere,
}: {
  flow: LessonReviewFlowState;
  attention: AttentionRow[];
  rest: KeyPoint[];
  onConfirm: (id: string) => void;
  onEdited: (id: string) => void;
  refusedHere: (work: string) => string | null;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [all, setAll] = useState(false);
  const shown = all ? rest : rest.slice(0, SHOWN);
  return (
    <div>
      <span className={EYEBROW}>Step 2 of 4 · the key points</span>
      <h2 className={H2}>The key points, pulled from what you uploaded</h2>
      <p className={cn(SUB, "mt-2")}>
        Read any you like. You don&rsquo;t have to open them - Accept keeps them all.
      </p>

      {attention.length > 0 && (
        <div className="mt-[22px]">
          <span className={SECTION_LABEL}>Nevo wants your eyes on these</span>
          <div className="mt-3 flex flex-col gap-2.5">
            {attention.map((row) => (
              <AttentionCard
                key={`${row.kind}:${row.id}`}
                row={row}
                flow={flow}
                onConfirm={onConfirm}
                onEdited={onEdited}
                refusedHere={refusedHere}
              />
            ))}
          </div>
        </div>
      )}

      {rest.length > 0 && (
        <div className="mt-6">
          <span className={SECTION_LABEL}>The rest - clear as read</span>
          <div className={cn(CARD, "mt-3 overflow-hidden")}>
            {shown.map((p) => {
              const isOpen = open.has(p.id);
              return (
                <div key={p.id} className="border-b border-nevo-near-black/6">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() =>
                      setOpen((s) => {
                        const next = new Set(s);
                        if (isOpen) next.delete(p.id);
                        else next.add(p.id);
                        return next;
                      })
                    }
                    className="flex w-full cursor-pointer items-center gap-3 border-none bg-transparent px-[17px] py-[13px] text-left"
                  >
                    <span className={cn(ROW_TEXT, "min-w-0 flex-1 leading-[1.45]")}>{p.text}</span>
                    <span className="shrink-0 text-nevo-near-black/40">
                      <Chevron open={isOpen} />
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-[17px] pb-3.5">
                      <span className="block font-mono text-[10px] font-bold tracking-[0.1em] text-nevo-violet uppercase">
                        From your file
                      </span>
                      <p className="mt-[7px] text-[13.5px] leading-[1.6] text-nevo-near-black/72 xl:text-[14px]">
                        {p.sourceText}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
            {rest.length > SHOWN && !all && (
              <button
                type="button"
                onClick={() => setAll(true)}
                className="w-full cursor-pointer border-none bg-transparent px-[17px] py-3 text-left text-[12.5px] text-nevo-near-black/55 hover:text-nevo-navy"
              >
                {`+ ${rest.length - SHOWN} more, all read cleanly`}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One thing Nevo is unsure of, and the action that settles it.
 *
 * A FLAGGED point offers "Looks right" and "Edit wording". The first writes
 * nothing by itself: the one-press acceptance is the write, and the per-point
 * accept route is deprecated by it. The second amends the point there and
 * then. A SECTION WITH NO POINT offers "Add one myself" and "Leave it out",
 * both written straight back, so the decision survives a reload. Each settled
 * row stays where it was, marked done, with the way back: "Edit again", or
 * "Add one after all" for one left out.
 */
function AttentionCard({
  row,
  flow,
  onConfirm,
  onEdited,
  refusedHere,
}: {
  row: AttentionRow;
  flow: LessonReviewFlowState;
  onConfirm: (id: string) => void;
  onEdited: (id: string) => void;
  refusedHere: (work: string) => string | null;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const resolved = rowResolved(row);
  const work = row.kind === "flag" ? `point:${row.id}` : `missing:${row.segmentId}`;
  const busy = flow.working === work;
  const refusal = refusedHere(work);

  let text: string;
  let reason: string;
  if (row.kind === "flag") {
    text = row.point.text;
    reason =
      row.resolved === "confirmed"
        ? "You confirmed the wording."
        : row.resolved === "edited"
          ? "You changed the wording."
          : WHY_FLAGGED[row.point.confidence];
  } else if (row.decided === null) {
    text = `${row.label} - no key point found.`;
    reason = "Nevo couldn’t pull a clear point from this part.";
  } else if (row.decided.omitted) {
    text = `Left out - ${row.label} has no key point.`;
    reason = "You chose to leave it out.";
  } else {
    text = row.decided.point.text;
    reason = "You added this one.";
  }

  const save = () => {
    const value = (draft ?? "").trim();
    if (!value) return;
    const call =
      row.kind === "flag"
        ? flow.amendPoint(row.id, value).then((ok) => {
            if (ok) onEdited(row.id);
            return ok;
          })
        : flow.resolveMissing(row.segmentId, { action: "add", text: value });
    void call.then((ok) => ok && setDraft(null));
  };

  const editing = draft !== null;
  const notFound = row.kind === "missing";

  return (
    <div
      className={cn(
        CARD,
        !resolved && "outline-[1.5px] -outline-offset-[1.5px] outline-nevo-violet/50 outline-solid",
      )}
    >
      <div className="flex items-start gap-3 px-[17px] py-[15px]">
        <span
          aria-hidden
          className={cn(
            "mt-px flex size-[26px] shrink-0 items-center justify-center rounded-full",
            resolved ? "bg-nevo-navy text-nevo-cream" : "border-2 border-nevo-violet",
          )}
        >
          {resolved && <Check />}
        </span>
        <div className="min-w-0 flex-1">
          {editing ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={400}
              autoFocus
              aria-label={notFound ? `Key point for ${row.label}` : "Key point wording"}
              placeholder={notFound ? "Type the key point for this section" : "Edit the wording"}
              className={TEXTAREA}
            />
          ) : (
            <>
              <p className={ROW_TEXT}>{text}</p>
              <span className="mt-1 block text-[12.5px] leading-[1.45] text-nevo-violet-text">{reason}</span>
            </>
          )}
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-[3px] text-[11px] font-semibold whitespace-nowrap",
            resolved ? "bg-nevo-navy/10 text-nevo-near-black/60" : "bg-nevo-violet/28 text-nevo-violet-text",
          )}
        >
          {resolved ? "Done" : notFound ? "Nothing found" : "Worth a check"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-[9px] pr-[17px] pb-[15px] pl-[51px]">
        {editing ? (
          <>
            <button type="button" onClick={save} disabled={busy || !draft.trim()} className={MINI_PRIMARY}>
              {busy ? "Saving…" : notFound ? "Add this key point" : "Save wording"}
            </button>
            <button type="button" onClick={() => setDraft(null)} disabled={busy} className={MINI_GHOST}>
              Cancel
            </button>
          </>
        ) : !resolved ? (
          notFound ? (
            <>
              <button type="button" onClick={() => setDraft("")} disabled={flow.working !== null} className={MINI_PRIMARY}>
                Add one myself
              </button>
              <button
                type="button"
                onClick={() => void flow.resolveMissing(row.segmentId, { action: "omit" })}
                disabled={flow.working !== null}
                className={MINI_GHOST}
              >
                {busy ? "Saving…" : "Leave it out"}
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => onConfirm(row.id)} className={MINI_PRIMARY}>
                Looks right
              </button>
              <button
                type="button"
                onClick={() => setDraft(row.kind === "flag" ? row.point.text : "")}
                disabled={flow.working !== null}
                className={MINI_GHOST}
              >
                Edit wording
              </button>
            </>
          )
        ) : (
          <button
            type="button"
            onClick={() =>
              setDraft(
                row.kind === "flag"
                  ? row.point.text
                  : row.decided && !row.decided.omitted
                    ? row.decided.point.text
                    : "",
              )
            }
            disabled={flow.working !== null}
            className={MINI_GHOST}
          >
            {row.kind === "missing" && row.decided?.omitted ? "Add one after all" : "Edit again"}
          </button>
        )}
        {refusal && (
          <span role="alert" className="basis-full text-[12.5px] font-medium text-nevo-navy">
            {refusal}
          </span>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- STEP 3 --------------------------------- */

const VERSION_NAME: Record<RewriteKind, string> = {
  simplified: "Simpler version",
  expanded: "Longer version",
};

/**
 * The simpler and the longer version of each part.
 *
 * C07k draws a format chip per variant and a Flag on each row. Neither is
 * what this step signs: the one press approves exactly the simplified and
 * expanded rewrites, so those are the chips and what a row opens to. And Flag
 * has no write behind it - a flag that records nothing reports a problem and
 * leaves the teacher looking at it, which is the one state Lydia ruled out -
 * so the row offers the action the contract does have: change the wording.
 */
function StepRewrites({
  lessonId,
  flow,
  rows,
  refusedHere,
}: {
  lessonId: string;
  flow: LessonReviewFlowState;
  rows: RewriteRow[];
  refusedHere: (work: string) => string | null;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, SHOWN);
  return (
    <div>
      <span className={EYEBROW}>Step 3 of 4 · the rewrites</span>
      <h2 className={H2}>A simpler and a longer version of each part</h2>
      <p className={cn(SUB, "mt-2")}>
        {rows.length > 0
          ? "Children don’t get these until you accept them. Open any to read; change one if something feels off. Accept keeps them all."
          : "Nevo didn’t write a simpler or a longer version of any part of this lesson, so there is nothing to accept here."}
      </p>

      {rows.length > 0 && (
        <div className="mt-[22px] flex flex-col gap-2.5">
          {shown.map((r) => {
            const isOpen = open.has(r.segmentId);
            return (
              <div key={r.segmentId} className={cn(CARD, "overflow-hidden")}>
                <div className="flex items-center gap-3 px-[17px] py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold text-nevo-near-black xl:text-[15px]">{r.label}</div>
                    <div className="mt-[7px] flex flex-wrap gap-1.5">
                      {r.versions.map((v) => (
                        <span
                          key={v.kind}
                          className="inline-flex h-[22px] items-center rounded-full bg-nevo-navy/9 px-[9px] text-[11px] font-medium text-nevo-near-black/70"
                        >
                          {v.kind === "simplified" ? "Simpler" : "Longer"}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-label={`${isOpen ? "Close" : "Open"} the rewrites of ${r.label}`}
                    onClick={() =>
                      setOpen((s) => {
                        const next = new Set(s);
                        if (isOpen) next.delete(r.segmentId);
                        else next.add(r.segmentId);
                        return next;
                      })
                    }
                    className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[10px] border-none bg-nevo-navy/8 text-nevo-navy"
                  >
                    <Chevron open={isOpen} />
                  </button>
                </div>
                {isOpen && (
                  <div className="flex flex-col gap-4 border-t border-nevo-near-black/7 px-[17px] pt-3 pb-4">
                    {r.versions.map((v) => (
                      <RewriteVersion
                        key={v.kind}
                        segmentId={r.segmentId}
                        kind={v.kind}
                        body={v.body}
                        edited={v.edited}
                        flow={flow}
                        refusal={refusedHere(`rewrite:${r.segmentId}:${v.kind}`)}
                      />
                    ))}
                    {/* C16d: every format of this section, read-only, with the
                        orientation line above its tabs. */}
                    <Link
                      href={`/teacher/lessons/${lessonId}/variants?section=${r.section}`}
                      className="self-start text-[13px] font-semibold text-nevo-navy underline underline-offset-[3px]"
                    >
                      See every format of this section
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
          {rows.length > SHOWN && !all && (
            <button
              type="button"
              onClick={() => setAll(true)}
              className="cursor-pointer border-none bg-transparent px-0.5 py-1 text-left text-[12.5px] text-nevo-near-black/55 hover:text-nevo-navy"
            >
              {`+ ${rows.length - SHOWN} more ${rows.length - SHOWN === 1 ? "section" : "sections"}, each rewritten the same way`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function RewriteVersion({
  segmentId,
  kind,
  body,
  edited,
  flow,
  refusal,
}: {
  segmentId: string;
  kind: RewriteKind;
  body: string;
  edited: boolean;
  flow: LessonReviewFlowState;
  refusal: string | null;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const busy = flow.working === `rewrite:${segmentId}:${kind}`;
  return (
    <div>
      <span className="block font-mono text-[10px] font-bold tracking-[0.1em] text-nevo-violet uppercase">
        {VERSION_NAME[kind]}
      </span>
      {draft !== null ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          aria-label={`${VERSION_NAME[kind]} wording`}
          className={cn(TEXTAREA, "mt-[7px] min-h-[120px]")}
        />
      ) : (
        <p className="mt-[7px] text-[14px] leading-[1.6] whitespace-pre-line text-nevo-near-black/82 xl:text-[15px]">
          {body}
        </p>
      )}
      {edited && draft === null && (
        <span className="mt-1 block text-[12.5px] text-nevo-violet-text">
          You changed this wording. Nevo&rsquo;s own is kept.
        </span>
      )}
      <div className="mt-2.5 flex flex-wrap items-center gap-[9px]">
        {draft !== null ? (
          <>
            <button
              type="button"
              disabled={busy || !draft.trim()}
              onClick={() => {
                void flow
                  .editRewrite(segmentId, kind, draft.trim())
                  .then((ok) => ok && setDraft(null));
              }}
              className={MINI_PRIMARY}
            >
              {busy ? "Saving…" : "Save wording"}
            </button>
            <button type="button" disabled={busy} onClick={() => setDraft(null)} className={MINI_GHOST}>
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={flow.working !== null}
            onClick={() => setDraft(body)}
            className={MINI_GHOST}
          >
            Edit wording
          </button>
        )}
        {refusal && (
          <span role="alert" className="basis-full text-[12.5px] font-medium text-nevo-navy">
            {refusal}
          </span>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- STEP 4 --------------------------------- */

/**
 * Live, and who made it so.
 *
 * C07k's line under "This lesson is ready" reads "Each student sees the
 * version that suits how they learn." Not rendered: it is the learning-styles
 * claim Lydia ruled off the product on 17 Oct (SCRUM-253) and rule 1 of the
 * architecture. Raised with her and design; the line here says only what
 * happens next.
 */
function StepLive({
  lessonId,
  review,
  pointsSigned,
  rewritesSigned,
  onGo,
}: {
  lessonId: string;
  review: LessonReview;
  pointsSigned: boolean;
  rewritesSigned: boolean;
  onGo: (step: Step) => void;
}) {
  if (review.reviewComplete !== true) {
    return (
      <div className="flex flex-col items-center pt-2.5 text-center">
        <h2 className="text-[21px] font-semibold tracking-[-0.012em] text-nevo-near-black xl:text-[24px]">
          Not live yet
        </h2>
        <p className={cn(SUB, "mt-[11px] max-w-[460px] text-nevo-near-black/66")}>
          {!pointsSigned && !rewritesSigned
            ? "Accept the key points and the rewrites, and it goes into your library ready to assign."
            : !pointsSigned
              ? "Accept the key points, and it goes into your library ready to assign."
              : "Accept the rewrites, and it goes into your library ready to assign."}
        </p>
        <div className="mt-[26px] flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => onGo(pointsSigned ? 3 : 2)} className={PRIMARY}>
            {pointsSigned ? "Go to the rewrites" : "Go to the key points"}
          </button>
        </div>
      </div>
    );
  }
  const lines = approvalLines(review);
  return (
    <div className="flex flex-col items-center pt-2.5 text-center">
      <span className="nevo-pop inline-flex size-14 items-center justify-center rounded-full bg-nevo-navy text-nevo-cream xl:size-16">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </span>
      <h2 className="mt-[22px] text-[21px] font-semibold tracking-[-0.012em] text-nevo-near-black xl:text-[24px]">
        This lesson is ready
      </h2>
      <p className={cn(SUB, "mt-[11px] max-w-[460px] leading-[1.6] text-pretty text-nevo-near-black/66")}>
        It&rsquo;s in your library. Assign it to a class and it&rsquo;ll open
        for students at the time you choose.
      </p>
      {lines.length > 0 && (
        <div className="mt-5 flex flex-col items-center gap-2">
          {lines.map((line) => (
            <div
              key={line}
              className="inline-flex items-center gap-[9px] rounded-full bg-nevo-violet/16 px-[15px] py-2"
            >
              <span className="inline-flex text-nevo-navy">
                <Check />
              </span>
              <span className="text-[13px] font-medium text-nevo-near-black">{line}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-[26px] flex flex-wrap justify-center gap-3">
        <Link href={`/teacher/lessons/assign?lesson=${lessonId}`} className={PRIMARY}>
          Assign to classes
        </Link>
        <Link href="/teacher/lessons" className={GHOST}>
          Back to My Lessons
        </Link>
      </div>
    </div>
  );
}
