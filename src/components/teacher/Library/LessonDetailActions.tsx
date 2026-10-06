import Link from "next/link";

/**
 * The line under an Assign that cannot go yet: what is left, from the
 * server's counts, or the one true thing when it cannot be itemised. Shared
 * with the upload finish screen so the two places Assign waits cannot drift.
 */
export function stillToCheck(keyPoints: number, sections: number): string {
  const plural = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`;
  const left = [
    ...(keyPoints > 0 ? [plural(keyPoints, "key point", "key points")] : []),
    ...(sections > 0 ? [plural(sections, "section", "sections")] : []),
  ].join(" and ");
  return left ? `${left} still to check` : "Still being checked.";
}

/**
 * Lesson-detail header actions (C06b).
 *
 * "Assign to a class" opens the C07i assignment takeover with this lesson
 * preselected. "Review variants" (C16d) is the entry the frame never drew -
 * flagged.
 *
 * ASSIGN IS INACTIVE WHILE A REVIEW IS OUTSTANDING (SCRUM-153, LR-04), and
 * says what is left rather than simply refusing. The gate is real: the
 * backend answers 409 `lesson_not_approved` at both assignment doors, so a
 * pressable button here was an invitation to a failure the screen already
 * knew about. One line, no modal, no wizard.
 *
 * `ready` IS THE SERVER'S ANSWER AND THE COUNTS ARE ONLY THE SENTENCE.
 * Backend asked for that split by name - *"enable Assign on `readyToAssign`,
 * not by counting the list yourself; client and server disagreeing about
 * ready is how this started"* - so this takes the verdict and the numbers
 * separately, and a caller cannot accidentally make the numbers the gate.
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
  ready = true,
  checking = false,
  outstandingKeyPoints = 0,
  outstandingSections = 0,
}: {
  lessonId: string;
  variantsHref?: string;
  compact?: boolean;
  /**
   * The SERVER's verdict on whether this lesson can go to a class.
   *
   * Defaults to true, which is what every other caller of this component
   * wants: they draw the actions for a lesson that is not under review, and
   * a default of false would silently disable Assign across the console.
   */
  ready?: boolean;
  /**
   * The verdict has not arrived. Assign waits, and says nothing - there is no
   * refusal to explain yet, and "Still being checked." is a sentence about
   * the lesson, not about our read of it.
   */
  checking?: boolean;
  /** Key points Nevo could not ground, still waiting. */
  outstandingKeyPoints?: number;
  /** Flagged sections nobody has approved. */
  outstandingSections?: number;
}) {
  const h = compact ? "h-[42px] text-sm" : "h-11 text-[14.5px]";
  const blocked = !ready || checking;

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
      {blocked && !checking && (
        <span className="text-right text-[13px] font-medium text-nevo-navy">
          {/* The server says it is not ready and we do not always know why -
              a refusal we cannot itemise still has to say something true. */}
          {/* C06b: "2 key points still to check". The "below" this used to
              carry was true on the lesson page and false everywhere else
              this component is drawn. */}
          {stillToCheck(outstandingKeyPoints, outstandingSections)}
        </span>
      )}
    </div>
  );
}