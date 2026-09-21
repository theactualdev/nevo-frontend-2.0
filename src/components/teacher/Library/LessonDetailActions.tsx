import Link from "next/link";

/**
 * Lesson-detail header actions (C06b).
 *
 * "Assign to a class" opens the C07i assignment takeover with this lesson
 * preselected. "Review variants" (C16d) is the entry the frame never drew -
 * flagged.
 *
 * ASSIGN IS INACTIVE WHILE A REVIEW IS OUTSTANDING (SCRUM-153, LR-04), and
 * says how many are left rather than simply refusing. The gate is real: the
 * backend answers 409 `lesson_not_approved` at both assignment doors, so a
 * pressable button here was an invitation to a failure the screen already
 * knew about. One line, no modal, no wizard.
 *
 * EDIT IS GONE, and this is the part to put back first. LR-06 wants it to
 * open the lesson itself - title, key points, how Nevo should treat it - and
 * there is no endpoint that edits any of those. What it did instead was
 * route into the upload flow and ask the teacher for a different file, which
 * is the defect SCRUM-153 reports as item 4. A control that does the wrong
 * thing is worse than an absent one, so it waits for the endpoint. Design
 * draws Assign and Edit as a pair; that pair returns with LR-06.
 */
export function LessonDetailActions({
  lessonId,
  variantsHref,
  compact = false,
  outstanding = 0,
}: {
  lessonId: string;
  variantsHref?: string;
  compact?: boolean;
  /** Sections still waiting for this teacher. */
  outstanding?: number;
}) {
  const h = compact ? "h-[42px] text-sm" : "h-11 text-[14.5px]";
  const blocked = outstanding > 0;

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2.5">
        {variantsHref && (
          <Link
            href={variantsHref}
            className={`inline-flex cursor-pointer items-center rounded-[10px] px-3.5 font-medium text-nevo-navy transition-[background-color,transform] hover:bg-nevo-navy/6 active:scale-[0.99] ${h}`}
          >
            Review variants
          </Link>
        )}
        {blocked ? (
          <span
            aria-disabled="true"
            className={`inline-flex items-center rounded-[10px] bg-nevo-navy/30 px-5 font-semibold text-nevo-cream ${h}`}
          >
            Assign to a class
          </span>
        ) : (
          <Link
            href={`/teacher/lessons/assign?lesson=${lessonId}`}
            className={`inline-flex cursor-pointer items-center rounded-[10px] bg-nevo-navy px-5 font-semibold text-nevo-cream transition-[filter,transform] hover:brightness-93 active:scale-[0.99] ${h}`}
          >
            Assign to a class
          </Link>
        )}
      </div>
      {blocked && (
        <span className="max-w-[260px] text-right text-[13px] leading-[1.5] text-nevo-near-black/62">
          {`${outstanding} ${outstanding === 1 ? "section" : "sections"} still to check below.`}
        </span>
      )}
    </div>
  );
}