import Link from "next/link";
import { RotateCcw } from "lucide-react";
import type { LearningWork } from "@/lib/api/students";
import { reviewSessionHref } from "@/lib/lessons/reviewHref";
import { cn } from "@/lib/utils";

/**
 * THE REVIEW CARD ON HOME (design 19b, 5 Nov; Lydia, 31 Oct Q1 and 2 Nov Q7).
 *
 * "A card, not a chip. A chip is a label and this is a thing a child starts."
 * One review at a time, as the engine names one (`nextWork`), "since a stack
 * of overdue items is a pile of guilt rather than a prompt". And only when
 * there is one: "The card appears when there is a review, otherwise the list
 * is the page" - so 19b's empty state ("Nothing to look back on just yet ...
 * Nothing to do for now") is not drawn either. "Nothing to do" is also a
 * caught-up claim, which only the server may make (SCRUM-146).
 *
 * 19b'S WORDS, LESS WHAT THE CONTRACT CANNOT MAKE TRUE (rule 10, raised):
 * - Drawn: the "Review" eyebrow and its mark, "A quick look back", the named
 *   pill and "Start a review".
 * - The pill names the CONCEPT the engine sent. 19b's pills name subjects,
 *   and `nextWork` carries no subject - only `conceptName`, which is what the
 *   chip this replaces named. Named, never a bare count.
 * - The line under the heading is Lydia's for one item (19 Nov, L9, settled):
 *   "Something from last week is ready for a quick review." 19b's "A few
 *   things ... Going over them again is what makes them stick." was held:
 *   `nextWork` is one concept, so "a few things" was untrue. Her sentence
 *   alone - the second one is not reworded for one item, so it is not drawn.
 *
 * Start a review opens the review session, whose entry screen still lets the
 * child say "Not now"; ending it comes back Home, where it was opened.
 *
 * SUBJECT DETAIL DRAWS THE SAME CARD, one per concept that is due (Lydia,
 * 25 Nov, L61: "Home's review card as it is"; 19 Nov, L11: "a card each").
 * The props below are only what a second page needs to place it: where the
 * review comes back to, its own heading id, a link name that says which
 * concept (several "Start a review" links side by side), and its spacing.
 * Nothing it draws changes.
 */
export function ReviewCard({
  review,
  back,
  headingId = "home-review",
  linkLabel,
  className = "mt-7",
}: {
  review: Pick<LearningWork, "conceptName" | "lessonId" | "conceptId">;
  /** Where the review's ways out return to; Home when not given. */
  back?: string;
  /** Unique per card where a page draws several. */
  headingId?: string;
  /** The link's accessible name, where several cards share its words. */
  linkLabel?: string;
  className?: string;
}) {
  const name = review.conceptName.trim();
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "rounded-[14px] bg-nevo-cream p-[22px] shadow-[0_2px_10px_rgba(0,0,0,0.06)] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-500 motion-safe:[animation-delay:140ms]",
        className,
      )}
    >
      <span className="inline-flex items-center gap-[7px] text-xs font-semibold tracking-[0.04em] text-nevo-violet uppercase">
        <RotateCcw className="size-[15px]" strokeWidth={2} aria-hidden />
        Review
      </span>
      <h2
        id={headingId}
        className="mt-2.5 text-[19px] font-semibold text-nevo-near-black"
      >
        A quick look back
      </h2>
      <p className="mt-2 text-[14.5px] leading-[1.55] text-pretty text-nevo-near-black/70">
        Something from last week is ready for a quick review.
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        <li className="inline-flex h-[30px] items-center rounded-full bg-nevo-navy/8 px-3 text-[13px] font-medium text-nevo-near-black">
          {name}
        </li>
      </ul>
      <Link
        href={reviewSessionHref(review.lessonId, review.conceptId, back)}
        aria-label={linkLabel}
        className="mt-[18px] flex h-[50px] cursor-pointer items-center justify-center rounded-[10px] bg-nevo-navy text-[15px] font-semibold text-nevo-cream transition-colors hover:bg-nevo-navy/90 active:scale-[0.99]"
      >
        Start a review
      </Link>
    </section>
  );
}
