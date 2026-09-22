"use client";

import { useState } from "react";
import type { KeyPoint, KeyPointConfidence } from "@/lib/api/lessons";
import { cn } from "@/lib/utils";
import type { KeyPointAction } from "@/hooks/useLessonReview";

/**
 * One key point a teacher can open, check and settle (SCRUM-153, LR-02).
 *
 * "Key points are extracted and shown as cards, but a card cannot be clicked
 * or expanded. There is no way to see what Nevo drew from." Expandable was the
 * missing piece, and without it the product demanded a review it gave no means
 * to perform.
 *
 * WHAT THE EXPANDED CARD SHOWS, and the order is the argument. The document's
 * own words come FIRST, then what Nevo made of them, because the question a
 * teacher is answering is "is that a fair reading of this" - and putting the
 * reading first invites them to check it against their memory instead.
 *
 * AN AMENDMENT SITS BESIDE WHAT NEVO READ, NEVER OVER IT. Backend asked for
 * that by name, and both fields exist for it. A teacher who rewrote a point
 * last week and comes back to it can still see what they were correcting -
 * and a screen that had overwritten it would leave them re-deciding from
 * nothing.
 *
 * THE MARKER KEYS OFF `outstanding`, NOT OFF CONFIDENCE. The server decides
 * what needs a teacher; confidence only explains why once the card is open.
 * Reading `low` as "needs attention" here would be this console deciding a
 * threshold the engine owns - and it would be wrong the moment backend
 * changes what grounds a point.
 *
 * Violet and quiet, per LR-03: a key point Nevo could not ground is an
 * ordinary outcome of reading a document, not a fault.
 */

/**
 * Why this one is being asked about, in the teacher's terms.
 *
 * The contract's confidence is MEASURED - the share of the key point's words
 * found in the segment it came from - so these say what was measured rather
 * than naming a grade. "LOW" on a card tells a teacher nothing they can act
 * on; "Nevo could not find this wording in the text" tells them where to look.
 */
const WHY: Record<KeyPointConfidence, string> = {
  low: "Nevo couldn’t find this wording in the text it came from, so it may have gone further than the document does.",
  medium:
    "Only part of this wording appears in the text it came from. Worth a read against the source below.",
  high: "This closely matches the text it came from.",
};

const Field = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <>
    <h4 className="mt-4 text-[11px] font-bold tracking-[0.12em] text-nevo-near-black/50 uppercase">
      {label}
    </h4>
    {children}
  </>
);

export function KeyPointCard({
  keyPoint,
  working,
  failed,
  onAccept,
  onAmend,
  onRemove,
}: {
  keyPoint: KeyPoint;
  /** The action in flight on THIS card, if any. */
  working: KeyPointAction | null;
  failed: boolean;
  onAccept: () => void;
  onAmend: (text: string) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(keyPoint.text);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const busy = working !== null;
  const outstanding = keyPoint.outstanding;

  const startEditing = () => {
    // Seeded from what is IN FORCE, which is the amendment where there is
    // one - a teacher refining their own wording should not have to retype it.
    setDraft(keyPoint.text);
    setEditing(true);
  };

  const saveAmendment = () => {
    const text = draft.trim();
    // An empty box is not an amendment, and it is not a removal either -
    // there is a control for that, and guessing between them would delete
    // something a teacher only meant to clear.
    if (text.length === 0 || text === keyPoint.text) {
      setEditing(false);
      return;
    }
    onAmend(text);
    setEditing(false);
  };

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[12px] bg-nevo-cream-elevated shadow-elevation-1",
        outstanding && "border-l-[3px] border-nevo-violet",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-start gap-3 px-[20px] py-4 text-left transition-[filter] hover:brightness-[0.985]"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] leading-[1.5] font-medium text-nevo-near-black">
            {keyPoint.text}
          </span>
          <span className="mt-1 block text-[13px] leading-[1.5] text-nevo-near-black/58">
            {/* Which part of the lesson this came from, named where the parse
                named it and numbered where it did not. */}
            {keyPoint.segmentTitle ?? `Section ${keyPoint.position}`}
            {keyPoint.amendedText !== null && " · you changed this"}
          </span>
        </span>
        {outstanding && (
          <span className="mt-0.5 shrink-0 rounded-full bg-nevo-violet/18 px-2.5 py-1 text-[11.5px] font-medium whitespace-nowrap text-nevo-near-black/72">
            Worth a look
          </span>
        )}
        <span
          className={cn(
            "mt-px shrink-0 text-nevo-navy transition-transform",
            open && "rotate-180",
          )}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="border-t border-nevo-near-black/7 px-[20px] py-4">
          {outstanding && (
            <p className="max-w-[68ch] text-[13.5px] leading-[1.55] text-nevo-near-black/72">
              {WHY[keyPoint.confidence]}
            </p>
          )}

          <Field label="What the document says">
            {keyPoint.sourceText.trim() ? (
              <p className="mt-2 max-w-[68ch] border-l-2 border-nevo-near-black/12 pl-3 text-[14px] leading-[1.6] text-nevo-near-black/82">
                {keyPoint.sourceText}
              </p>
            ) : (
              <p className="mt-2 text-[13.5px] text-nevo-near-black/55 italic">
                Nevo didn&rsquo;t keep the passage this came from.
              </p>
            )}
          </Field>

          <Field label="What Nevo read">
            <p className="mt-2 max-w-[68ch] text-[14px] leading-[1.6] text-nevo-near-black/82">
              {keyPoint.extractedText}
            </p>
          </Field>

          {keyPoint.amendedText !== null && (
            <Field label="Your wording">
              <p className="mt-2 max-w-[68ch] text-[14px] leading-[1.6] text-nevo-near-black/82">
                {keyPoint.amendedText}
              </p>
            </Field>
          )}

          {editing ? (
            <div className="mt-4">
              <label className="block text-[11px] font-bold tracking-[0.12em] text-nevo-near-black/50 uppercase">
                Your wording
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={3}
                  autoFocus
                  className="nevo-in mt-2 box-border w-full resize-none rounded-[9px] border-[1.5px] border-nevo-navy/22 bg-nevo-cream/50 px-3 py-[9px] text-[14px] leading-[1.55] font-normal tracking-normal text-nevo-near-black normal-case outline-none focus:border-nevo-navy focus:bg-nevo-cream"
                />
              </label>
              <p className="mt-1.5 text-[12.5px] text-nevo-near-black/55">
                {/* Said out loud because it is the consequence: an amendment
                    reaches the child, it is not a note to self. */}
                This is what a student will be taught. What Nevo read stays
                above it.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={saveAmendment}
                  disabled={busy}
                  className="inline-flex h-[42px] cursor-pointer items-center rounded-[10px] bg-nevo-navy px-[18px] text-[14px] font-semibold text-nevo-cream transition-[filter] hover:brightness-93 disabled:cursor-default disabled:opacity-55"
                >
                  Save this wording
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="inline-flex h-[42px] cursor-pointer items-center rounded-[10px] border-[1.5px] border-nevo-near-black/18 px-[15px] text-[14px] font-semibold text-nevo-near-black transition-colors hover:bg-nevo-near-black/5"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : confirmingRemove ? (
            <div className="mt-5">
              <p className="max-w-[60ch] text-[13.5px] leading-[1.55] text-nevo-near-black/78">
                {/* There is no undo on this route, so the screen says so
                    rather than letting a teacher discover it. */}
                Students won&rsquo;t be taught this point. You can&rsquo;t put
                it back from here.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onRemove}
                  disabled={busy}
                  className="inline-flex h-[42px] cursor-pointer items-center rounded-[10px] bg-nevo-navy px-[18px] text-[14px] font-semibold text-nevo-cream transition-[filter] hover:brightness-93 disabled:cursor-default disabled:opacity-55"
                >
                  {working === "remove" ? "Removing…" : "Yes, remove it"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingRemove(false)}
                  className="inline-flex h-[42px] cursor-pointer items-center rounded-[10px] border-[1.5px] border-nevo-near-black/18 px-[15px] text-[14px] font-semibold text-nevo-near-black transition-colors hover:bg-nevo-near-black/5"
                >
                  Keep it
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {/* LR-02's three actions. Accept is offered only where there is
                  something to accept - a point Nevo could ground has nothing
                  waiting on it, and a button that settles what is already
                  settled is a click for its own sake. */}
              {outstanding && (
                <button
                  type="button"
                  onClick={onAccept}
                  disabled={busy}
                  className="inline-flex h-[42px] cursor-pointer items-center rounded-[10px] bg-nevo-navy px-[18px] text-[14px] font-semibold text-nevo-cream transition-[filter] hover:brightness-93 disabled:cursor-default disabled:opacity-55"
                >
                  {working === "accept" ? "Accepting…" : "Accept as it is"}
                </button>
              )}
              <button
                type="button"
                onClick={startEditing}
                disabled={busy}
                className="inline-flex h-[42px] cursor-pointer items-center rounded-[10px] border-[1.5px] border-nevo-near-black/18 px-[15px] text-[14px] font-semibold text-nevo-near-black transition-colors hover:bg-nevo-near-black/5 disabled:cursor-default disabled:opacity-55"
              >
                {working === "amend" ? "Saving…" : "Change the wording"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingRemove(true)}
                disabled={busy}
                className="inline-flex h-[42px] cursor-pointer items-center rounded-[10px] px-3 text-[14px] font-semibold text-nevo-navy transition-colors hover:bg-nevo-navy/6 disabled:cursor-default disabled:opacity-55"
              >
                Remove it
              </button>
            </div>
          )}

          {failed && (
            <p className="mt-3 max-w-[60ch] text-[13.5px] leading-[1.5] text-nevo-near-black/68">
              That didn&rsquo;t go through. Nothing has changed, so you can try
              again.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
