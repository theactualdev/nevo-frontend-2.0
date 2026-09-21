"use client";

import { useState } from "react";
import type { LessonSegment } from "@/lib/api/lessons";
import { reasonCopy } from "@/lib/constants/reviewReasons";
import { cn } from "@/lib/utils";

/**
 * One section a teacher has to settle before the lesson can be assigned
 * (SCRUM-153, LR-02).
 *
 * EXPANDABLE IS THE MISSING PIECE, in the ticket's words. The lesson page
 * listed sections that could not be opened, so a teacher was told parts needed
 * checking and given nothing to check.
 *
 * WHAT IS IN THE EXPANDED CARD, AND WHAT IS NOT. LR-02 asks for the source
 * text, what Nevo read, and three actions - accept, edit, remove. What the
 * contract carries is what Nevo read (`body`, and the key points on the text
 * variant), why it wants a look (`reviewReasons`), and one action: approve.
 * There is no source text on any lesson schema and no endpoint that amends or
 * removes anything. So this card shows what exists and offers the action that
 * exists, and the other two are raised rather than drawn as controls that
 * would have to fail.
 *
 * The marker is violet and quiet, per LR-03 - never an alarm. A section that
 * wants a look is the ordinary outcome of a parse, not a fault.
 */
export function ReviewSection({
  segment,
  index,
  approved,
  approving,
  failed,
  onAccept,
}: {
  segment: LessonSegment;
  /** 1-based, as the lesson lists them. */
  index: number;
  approved: boolean;
  approving: boolean;
  failed: boolean;
  onAccept: () => void;
}) {
  const [open, setOpen] = useState(false);
  const keyPoints = segment.textVariant?.keyPoints ?? [];

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[12px] bg-nevo-cream-elevated shadow-elevation-1",
        !approved && "border-l-[3px] border-nevo-violet",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-start gap-3 px-[20px] py-4 text-left transition-[filter] hover:brightness-[0.985]"
      >
        <span className="w-6 shrink-0 pt-px text-[13px] text-nevo-near-black/40 tabular-nums">
          {index}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-nevo-near-black">
            {segment.title ?? `Section ${index}`}
          </span>
          <span className="mt-1 block text-[13.5px] leading-[1.5] text-nevo-near-black/62">
            {approved
              ? "Checked"
              : /* Quiet, and the same sentence whatever the reason: the
                   reasons themselves are inside, where there is room for
                   them. */
                "Nevo is unsure it read this part correctly"}
          </span>
        </span>
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
          {segment.reviewReasons.length > 0 && (
            <div className="flex flex-col gap-2">
              {segment.reviewReasons.map((reason) => (
                <p
                  key={reason}
                  className="max-w-[68ch] text-[13.5px] leading-[1.55] text-nevo-near-black/72"
                >
                  {reasonCopy(reason)}
                </p>
              ))}
            </div>
          )}

          <h4 className="mt-4 text-[11px] font-bold tracking-[0.12em] text-nevo-near-black/50 uppercase">
            What Nevo read
          </h4>
          {segment.body ? (
            <p className="mt-2 max-w-[68ch] text-[14px] leading-[1.6] text-nevo-near-black/82">
              {segment.body}
            </p>
          ) : (
            <p className="mt-2 text-[13.5px] text-nevo-near-black/55 italic">
              Nothing came through for this section.
            </p>
          )}

          {keyPoints.length > 0 && (
            <>
              <h4 className="mt-4 text-[11px] font-bold tracking-[0.12em] text-nevo-near-black/50 uppercase">
                Key points
              </h4>
              <ul className="mt-2 flex flex-col gap-1.5">
                {keyPoints.map((point) => (
                  <li
                    key={point}
                    className="max-w-[68ch] text-[13.5px] leading-[1.55] text-nevo-near-black/78"
                  >
                    {point}
                  </li>
                ))}
              </ul>
            </>
          )}

          {approved ? (
            <p className="mt-5 text-[13.5px] text-nevo-near-black/60">
              You have checked this section.
            </p>
          ) : (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onAccept}
                disabled={approving}
                className="inline-flex h-[42px] cursor-pointer items-center rounded-[10px] bg-nevo-navy px-[18px] text-[14px] font-semibold text-nevo-cream transition-[filter] hover:brightness-93 disabled:cursor-default disabled:opacity-55"
              >
                {approving ? "Accepting…" : "Accept this section"}
              </button>
              {failed && (
                <span className="text-[13.5px] text-nevo-near-black/68">
                  That didn&rsquo;t go through. Nothing has changed, so you can
                  try again.
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
