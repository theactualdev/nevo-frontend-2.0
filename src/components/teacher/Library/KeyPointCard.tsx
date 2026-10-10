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
 * DRAWN AGAINST C06b, WHICH THIS DID NOT HAVE WHEN IT WAS BUILT. The review
 * shipped on 22 Sep against the SCRUM-153 ticket; the frame landed in the
 * design drop of 20 Sep and was not pulled until after. Every difference found
 * in that diff is corrected here, and they were not all cosmetic - see the
 * three marks below.
 *
 * THREE MARKS, NOT TWO, and this is the one that changed meaning. The first
 * build drew a violet edge on anything outstanding and nothing at all on
 * everything else, so a point NEVO was confident about looked identical to one
 * the TEACHER had just settled. The frame separates them: an open ring for a
 * point that wants a look, a filled tick for one a teacher has dealt with, and
 * a quiet grey ring for one that never needed them. A teacher working down a
 * list can see what they have done.
 *
 * WHAT THE EXPANDED CARD SHOWS, and the order is the argument. The document's
 * own words come FIRST - "From your file" - then what Nevo made of them,
 * because the question being answered is "is that a fair reading of this", and
 * putting the reading first invites them to check it against their memory
 * instead.
 *
 * AN AMENDMENT SITS BESIDE WHAT NEVO READ, NEVER OVER IT. Backend asked for
 * that by name, and both fields exist for it. A teacher who rewrote a point
 * last week and comes back to it can still see what they were correcting -
 * and a screen that had overwritten it would leave them re-deciding from
 * nothing.
 *
 * THE MARK KEYS OFF `outstanding`, NOT OFF CONFIDENCE. The server decides what
 * needs a teacher; confidence only explains why once the card is open. Reading
 * `low` as "needs attention" here would be this console deciding a threshold
 * the engine owns - and it would be wrong the moment backend changes what
 * grounds a point.
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

/**
 * Which of C06b's three marks this point wears.
 *
 * `outstanding` is the server's own answer and decides the first one. The
 * other two are a display distinction the contract already carries:
 * `accepted` and `amended` are things a TEACHER did, `settled` is a point
 * Nevo could ground on its own. A `removed` point should not be in the list
 * at all; if one arrives it reads as quiet rather than as settled work.
 */
function markOf(kp: KeyPoint): "flag" | "done" | "ok" {
  if (kp.outstanding) return "flag";
  if (kp.reviewState === "accepted" || kp.reviewState === "amended") {
    return "done";
  }
  return "ok";
}

function Mark({ kind }: { kind: "flag" | "done" | "ok" }) {
  if (kind === "done") {
    return (
      <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-nevo-navy">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f7f1e6" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </span>
    );
  }
  return (
    <span
      className={cn(
        "box-border size-[22px] shrink-0 rounded-full border-2",
        kind === "flag" ? "border-nevo-violet" : "border-nevo-near-black/18",
      )}
      aria-hidden
    />
  );
}

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <span className="mt-4 block font-mono text-[10.5px] font-bold tracking-[0.1em] text-nevo-violet uppercase">
    {children}
  </span>
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
  /*
   * A CARD THAT HAS BEEN DEALT WITH FOLDS ITSELF AWAY. QA, 22 Sep: accepted
   * points should minimise "so the list shortens as you work down it".
   *
   * C06b draws a checked card as a COLLAPSED row with a tick, not a hidden
   * one, so it closes rather than disappears - a teacher can reopen it and
   * see what they accepted.
   *
   * DERIVED, NOT AN EFFECT. What is remembered is the version of the point a
   * teacher opened; the card is open while that is still the version on
   * screen. When the server answers, the version changes and the card closes
   * on its own - no `useEffect` reaching in to set state after the fact,
   * which this repo's lint refuses and is right to.
   *
   * Both halves of the stamp earn their place: `reviewState` catches an
   * accept, and `text` catches an amendment to an already-amended point where
   * the state does not move. A REFUSAL changes neither, so a card whose
   * action failed stays open with its failure line where the teacher is
   * looking.
   */
  const version = `${keyPoint.reviewState}:${keyPoint.text}`;
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const [editingAt, setEditingAt] = useState<string | null>(null);
  const [removingAt, setRemovingAt] = useState<string | null>(null);
  const [draft, setDraft] = useState(keyPoint.text);

  const open = openedAt === version;
  const editing = editingAt === version;
  const confirmingRemove = removingAt === version;
  const setOpen = (next: boolean) => setOpenedAt(next ? version : null);
  const setEditing = (next: boolean) => setEditingAt(next ? version : null);
  const setConfirmingRemove = (next: boolean) =>
    setRemovingAt(next ? version : null);

  const busy = working !== null;
  const mark = markOf(keyPoint);

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
        open && "outline-[1.5px] -outline-offset-[1.5px] outline-nevo-navy/40",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-[11px] px-[17px] py-[15px] text-left transition-[filter] hover:brightness-[0.985] xl:gap-[13px] xl:px-[20px] xl:py-[17px]"
      >
        <Mark kind={mark} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm leading-[1.45] text-nevo-near-black xl:text-[15.5px] xl:leading-[1.5]">
            {keyPoint.text}
          </span>
          {/*
            WHICH SECTION THIS CAME FROM. C06b draws neither the collapsed nor
            the expanded card with it, and the first build followed the frame
            and said so rather than reinstating it quietly. Design ruled on
            23 Sep: show it. A teacher checking six points across four sections
            is reconciling them against the lesson they wrote, and without the
            section name they are doing that from memory.

            Quiet, per the ruling - it is context for the point above, not a
            heading of its own. Named where the parse named it and numbered
            where it did not, never a title invented on this side.
          */}
          <span className="mt-1 block text-[12.5px] leading-[1.4] text-nevo-near-black/50">
            {keyPoint.segmentTitle ?? `Section ${keyPoint.position}`}
          </span>
        </span>
        {mark === "flag" && (
          <span className="shrink-0 rounded-full bg-nevo-violet/34 px-2.5 py-[3px] text-[11px] font-semibold whitespace-nowrap text-nevo-navy">
            Worth a check
          </span>
        )}
        {mark === "done" && (
          <span className="shrink-0 rounded-full bg-nevo-navy/10 px-2.5 py-[3px] text-[11px] font-semibold whitespace-nowrap text-nevo-near-black/60">
            Checked
          </span>
        )}
        <span
          className={cn(
            "shrink-0 text-nevo-near-black/40 transition-transform",
            open && "rotate-180 text-nevo-near-black/55",
          )}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="xl:size-[18px]">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="border-t border-nevo-near-black/7 pt-0.5 pr-[17px] pb-[18px] pl-[45px] xl:pr-[20px] xl:pb-5 xl:pl-[55px]">
          {keyPoint.outstanding && (
            <p className="mt-3 max-w-[68ch] text-[13.5px] leading-[1.55] text-nevo-near-black/72">
              {WHY[keyPoint.confidence]}
            </p>
          )}

          <Eyebrow>
            {`From your file · ${keyPoint.segmentTitle ?? `Section ${keyPoint.position}`}`}
          </Eyebrow>
          {keyPoint.sourceText.trim() ? (
            <p className="mt-[7px] max-w-[68ch] rounded-[10px] bg-nevo-navy/5 px-3.5 py-3 text-[14px] leading-[1.6] text-nevo-near-black/66">
              {keyPoint.sourceText}
            </p>
          ) : (
            <p className="mt-[7px] text-[13.5px] text-nevo-near-black/55 italic">
              Nevo didn&rsquo;t keep the passage this came from.
            </p>
          )}

          <Eyebrow>What Nevo read</Eyebrow>
          <p className="mt-[7px] max-w-[68ch] text-[15px] leading-[1.55] text-nevo-near-black">
            {keyPoint.extractedText}
          </p>

          {keyPoint.amendedText !== null && (
            <>
              <Eyebrow>Your wording</Eyebrow>
              <p className="mt-[7px] max-w-[68ch] text-[15px] leading-[1.55] text-nevo-near-black">
                {keyPoint.amendedText}
              </p>
            </>
          )}

          {editing ? (
            <div className="mt-[18px]">
              <label className="block font-mono text-[10.5px] font-bold tracking-[0.1em] text-nevo-violet uppercase">
                Your wording
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={3}
                  autoFocus
                  className="nevo-in mt-[7px] box-border w-full resize-none rounded-[10px] border-[1.5px] border-nevo-navy/22 bg-nevo-cream/50 px-3.5 py-3 text-[15px] leading-[1.55] font-normal tracking-normal text-nevo-near-black normal-case outline-none focus:border-nevo-navy focus:bg-nevo-cream"
                />
              </label>
              <p className="mt-1.5 text-[12.5px] text-nevo-near-black/55">
                {/* Said out loud because it is the consequence: an amendment
                    reaches the child, it is not a note to self. */}
                This is what a student will be taught. What Nevo read stays
                above it.
              </p>
              <div className="mt-[18px] flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={saveAmendment}
                  disabled={busy}
                  className="inline-flex h-10 cursor-pointer items-center rounded-[10px] bg-nevo-navy px-[18px] text-sm font-semibold text-nevo-cream transition-[filter] hover:brightness-93 disabled:cursor-default disabled:opacity-55"
                >
                  Save this wording
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="inline-flex h-10 cursor-pointer items-center rounded-[10px] border-[1.5px] border-nevo-navy/35 px-4 text-sm font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : confirmingRemove ? (
            <div className="mt-[18px]">
              <p className="max-w-[60ch] text-[13.5px] leading-[1.55] text-nevo-near-black/78">
                {/* There is no undo on this route, so the screen says so
                    rather than letting a teacher discover it. */}
                Students won&rsquo;t be taught this point. You can&rsquo;t put
                it back from here.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={onRemove}
                  disabled={busy}
                  className="inline-flex h-10 cursor-pointer items-center rounded-[10px] bg-nevo-navy px-[18px] text-sm font-semibold text-nevo-cream transition-[filter] hover:brightness-93 disabled:cursor-default disabled:opacity-55"
                >
                  {working === "remove" ? "Removing…" : "Yes, remove it"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingRemove(false)}
                  className="inline-flex h-10 cursor-pointer items-center rounded-[10px] border-[1.5px] border-nevo-navy/35 px-4 text-sm font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6"
                >
                  Keep it
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-[18px] flex flex-wrap items-center gap-2.5">
              {/* C06b's three actions. Accept is offered only where there is
                  something to accept - a point Nevo could ground has nothing
                  waiting on it, and a button that settles what is already
                  settled is a click for its own sake. */}
              {keyPoint.outstanding && (
                <button
                  type="button"
                  onClick={onAccept}
                  disabled={busy}
                  className="inline-flex h-10 cursor-pointer items-center gap-[7px] rounded-[10px] bg-nevo-navy px-[18px] text-sm font-semibold text-nevo-cream transition-[filter] hover:brightness-93 disabled:cursor-default disabled:opacity-55"
                >
                  {working === "accept" ? "Accepting…" : "Accept"}
                </button>
              )}
              <button
                type="button"
                onClick={startEditing}
                disabled={busy}
                className="inline-flex h-10 cursor-pointer items-center rounded-[10px] border-[1.5px] border-nevo-navy/35 px-4 text-sm font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6 disabled:cursor-default disabled:opacity-55"
              >
                {working === "amend" ? "Saving…" : "Edit wording"}
              </button>
              {/* Pushed to the far end and kept quiet, per the frame: it is
                  the one action here that cannot be undone. */}
              <button
                type="button"
                onClick={() => setConfirmingRemove(true)}
                disabled={busy}
                className="ml-auto inline-flex h-10 cursor-pointer items-center rounded-[10px] px-3.5 text-sm font-medium text-nevo-near-black/55 transition-colors hover:bg-nevo-near-black/6 disabled:cursor-default disabled:opacity-55"
              >
                Remove
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
