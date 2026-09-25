"use client";

import Link from "next/link";
import type { Assignment } from "@/lib/api/assignments";
import { AssignmentSchedule } from "./AssignmentSchedule";
import type {
  LessonClass,
  LessonClassProgress,
  LessonContentType,
  LessonDetailResponse,
  LessonModule,
  LessonSegment,
  SegmentProgress,
} from "@/lib/api/lessons";
import { cn } from "@/lib/utils";
import { LessonDetailActions } from "./LessonDetailActions";
import { KeyPointCard } from "./KeyPointCard";
import { SplitSourceNotice } from "./SplitSourceNotice";
import { ReviewSection } from "./ReviewSection";
import { useSystemMessages } from "@/components/shared/SystemMessages";
import { useLessonReview } from "@/hooks/useLessonReview";
import { useSegmentReview } from "@/hooks/useSegmentReview";

/**
 * Lesson detail for a real lesson (C06b), built from what
 * `GET /api/content/lessons/{id}` actually returns.
 *
 * WHAT IS REAL. The segments: their order, their kind, their titles, the
 * modalities Nevo can offer each one in, and - the useful part - which of them
 * the parser wants a human to confirm, with its reasons.
 *
 * WHAT IS NOT HERE, and why. C06b's assigned layout leads with three stat
 * cards (assigned to, finished, opened) and two written notes about where the
 * class slowed. None of that has a source: the lesson carries no progress, and
 * no endpoint reports per-segment completion. Rather than draw empty bars, the
 * screen reports what it knows - who the lesson is assigned to, from the
 * assignments list - and leaves the rest out. The frame's principle for a
 * quiet week applies: the section simply is not there.
 *
 * Segments are grouped into the parser's modules when it made any, with each
 * module's preview and recap. That grouping only exists on the v1 lesson
 * alias, whose own segments drop the review flags - so the screen asks both
 * routes and joins them here rather than trading one for the other.
 *
 * PER-SEGMENT PROGRESS is live where the lesson was assigned to a class
 * (`GET /api/v1/lessons/{id}/class-progress`), which restores C06b's progress
 * rows and its "where the class slowed" note - the note is written
 * server-side, so it is quoted rather than composed here. A lesson assigned
 * only to individuals has no class to report on and simply has no progress.
 * Design drew C06b's needs-review treatment on 31 Aug and it is built: the
 * eye badge beside the title, the violet reason line above the meta, and the
 * inline chip on the flagged section. The reason line names the SECTION and
 * not the parser’s codes - `reviewReasons` is enumerated now, but its six
 * values are engine vocabulary (`deterministic_parse_used`,
 * `fewer_than_two_modalities`, ...) and none is a sentence for a teacher.
 */

const SECTION_H =
  "text-[13.5px] font-semibold tracking-[0.04em] text-nevo-near-black/55 uppercase xl:text-sm";

/** The spec's content types, in the frame's own vocabulary. */
const TYPE_LABEL: Record<LessonContentType, string> = {
  explanatory_text: "Explanatory",
  worked_example: "Worked example",
  practice_question: "Practice",
  visual_diagram: "Diagram",
  definition: "Definition",
  summary: "Summary",
  calculation: "Calculation",
};

function typeLabel(t: string): string {
  return TYPE_LABEL[t as LessonContentType] ?? t.replace(/_/g, " ");
}

/** `needs_media_review` -> "needs media review". */
function TypeTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 rounded-full bg-nevo-navy/9 px-[9px] py-0.5 text-[11px] font-semibold whitespace-nowrap text-nevo-near-black/55">
      {children}
    </span>
  );
}

/**
 * THE ENTRY INTO VARIANT REVIEW, which did not exist until 14 Sep.
 *
 * `/teacher/lessons/{id}/variants?section=N` was built, tested and live, and
 * nothing in the product linked to it - a finished screen reachable only by
 * typing a URL. C16d's breadcrumb ("Lesson Library · Variant review",
 * "Photosynthesis · Segment 2") says it is entered per segment from the lesson,
 * which is what this is.
 *
 * SHOWN ON EVERY SEGMENT, including ones with no variants yet. The screen says
 * plainly which of the four Nevo has not generated, and that is worth reaching;
 * hiding the link on those segments would make the control appear and disappear
 * for reasons a teacher cannot see.
 *
 * TWO THINGS RAISED WITH DESIGN AND BACKEND, not resolved here:
 *  - C07b draws this as ONE screen with segment PILLS, not a URL per section,
 *    and its own back link reads "← My Lessons". The built screen takes
 *    `?section=N`. Both reach the same place; the shapes differ.
 *  - C07b's stated purpose is that "the teacher reviews each segment's variants
 *    and APPROVES them for the class. Approval is manual and deliberate."
 *    There is no approval transport: `approve` appears in none of the 183 paths
 *    and nowhere in the document. The only sign-off field on the contract is
 *    `VisualVariant.reviewedBy`, which is a read. So what is built is review
 *    WITHOUT approval, and the approval half is a backend ask nobody had made.
 */
function SegmentRow({
  segment,
  index,
  lessonId,
  progress,
  slowest,
  outstanding,
}: {
  segment: LessonSegment;
  index: number;
  lessonId: string;
  progress?: SegmentProgress;
  slowest?: boolean;
  /**
   * STILL WAITING FOR A TEACHER - not "was flagged".
   *
   * This row read `segment.needsReview`, and that flag never clears. It is the
   * parser's verdict on the section, and approving it sets `approved` and
   * leaves `needsReview` exactly where it was. So the first real end-to-end
   * run, 25 Sep, ended on a lesson that had been reviewed, approved in full
   * and sent to seven children with every section on this page still marked
   * "Worth a look".
   *
   * The row does not decide this for itself, and that is the point. The review
   * hook already holds the one correct answer - flagged AND not approved,
   * counting what was approved in this session - and the siblings that wrote
   * their own version of it are how this drifted.
   */
  outstanding: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 px-[22px] py-4 xl:flex-row xl:items-start xl:gap-4",
        outstanding && "border-l-[3px] border-nevo-violet",
      )}
    >
      <span className="w-6 shrink-0 text-[13px] text-nevo-near-black/40 tabular-nums">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-[15px] font-semibold text-nevo-near-black">
            {segment.title ?? `Section ${index + 1}`}
          </span>
          <TypeTag>{typeLabel(segment.contentType)}</TypeTag>
          <Link
            href={`/teacher/lessons/${lessonId}/variants?section=${index + 1}`}
            className="cursor-pointer text-[12.5px] font-medium text-nevo-navy underline-offset-2 transition-[filter] hover:underline"
          >
            Variant review
          </Link>
        </div>
        {segment.body && (
          <p className="mt-1.5 line-clamp-2 max-w-[62ch] text-[13.5px] leading-[1.5] text-nevo-near-black/62">
            {segment.body}
          </p>
        )}
        {outstanding && (
          /*
           * "Worth a look", and NOT the reasons.
           *
           * Both this row and the upload result used to append
           * `reviewReasons.map(r => r.replace(/_/g, " ").toLowerCase())` - which
           * is, word for word, the thing `SegmentReviewReason`'s own contract
           * description exists to prevent: "Enumerated so the console can render
           * its own copy per reason instead of printing the raw token with
           * underscores swapped for spaces." A teacher was reading
           * "audio generation failed".
           *
           * The console DOES have that copy, in `LiveVariantReview`, written per
           * reason and in sentences. It is too long for an inline chip, and
           * inventing a second short register for the same six reasons is how
           * two wordings drift. So the row says the one true thing and the
           * variant review link beside it - added the same day - goes to the
           * screen that explains which. Flagged to design.
           */
          <p className="mt-2 text-[13px] leading-[1.5] text-nevo-navy">
            Worth a look
          </p>
        )}
      </div>
      {progress ? (
        <div className="flex shrink-0 items-center gap-3.5">
          <div className="h-1.5 w-[130px] overflow-hidden rounded-full bg-nevo-navy/14">
            <span
              /* Violet where the class slowed - C06b's rule is that a dip is
                 never red, and never reads as a scoreboard. */
              className={cn(
                "block h-full rounded-full",
                slowest ? "bg-nevo-violet" : "bg-nevo-navy",
              )}
              style={{
                width: `${Math.round(Math.max(0, Math.min(1, progress.completionRate)) * 100)}%`,
              }}
            />
          </div>
          <span className="w-[120px] text-right text-sm text-nevo-near-black/68">
            {`${progress.completionCount} of ${progress.assignedStudentCount} done`}
          </span>
        </div>
      ) : (
        segment.availableModalities.length > 0 && (
          <span className="shrink-0 text-[12.5px] text-nevo-near-black/45">
            {segment.availableModalities.join(" · ")}
          </span>
        )
      )}
    </div>
  );
}

export function LiveLessonDetail({
  lesson,
  modules,
  assignments,
  progress,
  /**
   * The classes this lesson went to, named.
   *
   * WAS A COUNT, derived by listing every assignment the teacher can see and
   * filtering client-side - which yielded ids and no names, so this screen
   * could say "one of several" and never which. `lesson.classes` is one query
   * and carries the names.
   */
  classes = [],
}: {
  lesson: LessonDetailResponse;
  modules: LessonModule[];
  assignments: Assignment[];
  progress?: LessonClassProgress | null;
  classes?: LessonClass[];
  /** How many classes hold this lesson; >1 means the rows name one of them. */

}) {
  const bySegment = new Map(
    (progress?.segments ?? []).map((p) => [p.segmentId, p]),
  );
  const segments = [...lesson.segments].sort(
    (a, b) => a.sequenceOrder - b.sequenceOrder,
  );
  /*
   * THE SECTIONS A TEACHER HAS TO SETTLE, and the review they do on them.
   *
   * `needsReview` is the parser's own flag and never changes; `approved` is
   * what a teacher has done about it. Both matter: a section that wanted a
   * look and has been checked still belongs in this list, showing as
   * checked, or a teacher who accepts one watches it vanish and wonders
   * what they just did.
   */
  /*
   * TWO THINGS CAN HOLD A LESSON BACK, and backend's ruling of 21 Sep names
   * both: a segment Nevo flagged that nobody approved, OR a key point it
   * could not ground in the text. `readyToAssign` accounts for both; the
   * review payload carries only the second, so both reviews live here.
   *
   * `needsReview` is the parser's own flag and never changes; `approved` is
   * what a teacher has done about it. Both matter: a section that wanted a
   * look and has been checked still belongs in the list, showing as checked,
   * or a teacher who accepts one watches it vanish and wonders what they
   * just did.
   */
  const reviewable = segments.filter((s) => s.needsReview);
  const sections = useSegmentReview(lesson.id, segments);
  /*
   * The rows below mark only what is STILL waiting, from the hook's own list.
   * `reviewable` above is deliberately different - it keeps an approved section
   * in the review list, shown as checked - and the two must not be merged: one
   * is "what did Nevo flag", the other is "what is left to do".
   */
  const waitingIds = new Set(sections.outstanding.map((s) => s.id));
  const say = useSystemMessages();
  /*
   * LR-05: "quiet state change plus the SCRUM-152 system message". The state
   * change on the page is deliberately undramatic - the lesson simply becomes
   * ready - and this is the line that tells a teacher the moment happened
   * without the page having to shout it.
   *
   * Past tense, names the thing, no exclamation mark, no "successfully". It
   * leaves on its own and carries no action, per SM-01: Assign is already on
   * the screen behind it, and a confirmation with somewhere to go is a
   * confirmation asking for something.
   */
  const review = useLessonReview(lesson.id, () =>
    say.show({ kind: "confirm", message: `${lesson.title} is ready to assign.` }),
  );
  /*
   * A segment approval moves `readyToAssign`, and the only thing that knows
   * is the review read. Without this, a teacher settles the last section and
   * Assign stays grey until they reload.
   */
  const onSectionApproved = review.refresh;
  const outstandingSections = sections.remaining;
  const outstandingPoints = review.outstanding;
  /** Anything at all still waiting, from either half. */
  const waiting = outstandingPoints + outstandingSections;
  const hadReview = review.hadReview || reviewable.length > 0;
  /**
   * C06b's reason line names the SECTION, not the parser's reason codes.
   * `reviewReasons` has no vocabulary in the contract - we would be printing
   * backend tokens at a teacher - so the line says which section and leaves
   * the why to the callout below it.
   */
  /**
   * "Total: 12 min (Segment 1: 4 min, Segment 2: 3 min)" - design's own shape.
   * The total is the lesson's pre-summed figure rather than a sum computed
   * here, so the two cannot drift; the breakdown lists only segments that
   * carry an estimate.
   */
  const durationLine = (() => {
    const total = lesson.estimatedMinutes ?? 0;
    if (!total) return "";
    const parts = segments
      .map((seg, i) => ({ n: i + 1, mins: seg.estimatedMinutes ?? 0 }))
      .filter((x) => x.mins > 0)
      .map((x) => `Segment ${x.n}: ${x.mins} min`);
    return parts.length > 0
      ? `Total: ${total} min (${parts.join(", ")})`
      : `Total: ${total} min`;
  })();

  const plural = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`;

  /**
   * LR-04's live count, naming whichever half is actually outstanding.
   *
   * Two numbers rather than one total, because they are settled in different
   * places on this page and a teacher looking for "3 things" would not know
   * which three.
   */
  const waitingLine = [
    ...(outstandingPoints > 0
      ? [plural(outstandingPoints, "key point", "key points")]
      : []),
    ...(outstandingSections > 0
      ? [plural(outstandingSections, "section", "sections")]
      : []),
  ].join(" and ");

  /**
   * C06b's sub-line, verbatim.
   *
   * What stood here named a SECTION and how cleanly it scanned - the old unit
   * and the old complaint, written before a key point could carry anything.
   * The frame names what is actually waiting and what it holds up.
   */
  const reviewLine =
    outstandingPoints > 0
      ? "A few key points need a quick check before you assign."
      : outstandingSections > 0
        ? "A few sections need a quick check before you assign."
        : "";

  // Group by module where the parser made any. A segment the modules do not
  // claim still has to appear - a lesson that silently hid a section would be
  // worse than an ungrouped one - so leftovers land in a trailing group.
  const claimed = new Set(modules.flatMap((m) => m.segmentIds));
  const grouped =
    modules.length === 0
      ? []
      : [
          ...modules.map((m) => ({
            module: m as LessonModule | null,
            segments: segments.filter((s) => m.segmentIds.includes(s.id)),
          })),
          ...(segments.some((s) => !claimed.has(s.id))
            ? [
                {
                  module: null,
                  segments: segments.filter((s) => !claimed.has(s.id)),
                },
              ]
            : []),
        ].filter((g) => g.segments.length > 0);
  const students = new Set(assignments.map((a) => a.studentId)).size;
  const nextDue = assignments
    .map((a) => a.dueAt)
    .filter((d): d is string => Boolean(d))
    .sort()[0];

  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[860px]">
        <Link
          href="/teacher/lessons"
          className="inline-flex cursor-pointer items-center gap-[7px] text-sm text-nevo-near-black/60 transition-transform active:scale-[0.99]"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 6l-6 6 6 6" />
          </svg>
          Lesson Library
        </Link>

        {/* C06b's header actions were mounted ONLY by the fixture component,
            so a signed-in teacher had no way into the assign flow from a real
            lesson - the console's best-wired write had no entry point. */}
        {/* C06b: `display:flex; align-items:flex-start; justify-content:
            space-between; gap:24px; flex-wrap:wrap`. Every part of that was
            here except the wrap, so at a narrow width the title and the
            actions squeezed against each other instead of stacking - which
            is the likeliest thing behind QA's "Assign is off-centre",
            reported twice and not reproducible at desktop width. */}
        <div className="mt-4 flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-[23px] font-semibold tracking-[-0.015em] text-nevo-near-black xl:text-[26px]">
                {lesson.title}
              </h2>
              {waiting > 0 && (
                <span className="inline-flex shrink-0 items-center gap-[5px] rounded-full bg-nevo-violet/34 py-[3px] pr-[11px] pl-2 text-[11.5px] font-semibold whitespace-nowrap text-nevo-navy">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                    <circle cx="12" cy="12" r="2.6" />
                  </svg>
                  Needs review
                </span>
              )}
            </div>
            {/* C06b's violet reason line sits ABOVE the grey meta, so the
                reason is read before the statistics. The section number comes
                from the flagged segment itself - never a parser token. */}
            {waiting > 0 && reviewLine && (
              <p className="mt-2 text-[14.5px] font-medium text-nevo-navy">
                {reviewLine}
              </p>
            )}
            {/* C06b's duration line: the pre-summed total, then the
                per-segment breakdown design annotated on 1 Sep. Only segments
                that actually carry an estimate are listed - a 0 is the
                schema's default, not a measurement. */}
            {durationLine && (
              <p className="mt-1.5 text-[13.5px] text-nevo-near-black/55">
                {durationLine}
              </p>
            )}
            <span className="mt-[5px] block text-[14.5px] text-nevo-near-black/60">
              {/* C06b counts KEY POINTS while a review is open and sections
                  otherwise - the meta line describes the thing the screen is
                  currently about. */}
              {waiting > 0 && review.keyPoints.length > 0
                ? plural(review.keyPoints.length, "key point", "key points")
                : plural(lesson.segmentCount, "section", "sections")}
              {students > 0 &&
                ` · Assigned to ${students} ${students === 1 ? "student" : "students"}`}
              {nextDue &&
                ` · Due ${new Date(nextDue).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`}
            </span>
          </div>
          <LessonDetailActions
            lessonId={lesson.id}
            /* THE GATE IS `readyToAssign`, and the count is only what the
               line says. Backend asked for the split by name: a client that
               decides "ready" for itself is how this ticket started. */
            /*
             * THE SERVER'S VERDICT, AND NOTHING ELSE. QA, 22 Sep: "assign
             * still blocked after approving everything."
             *
             * This read `review.ready && outstandingSections === 0`, and
             * that second clause is the exact thing backend asked for by
             * name not to do - "enable Assign on `readyToAssign`, not by
             * counting the list yourself". `LessonDetailActions` has a test
             * proving IT gates on `ready`; the count was ANDed in here, one
             * line before it was passed, where that test cannot see.
             *
             * What made it bite: the count was of EVERY unapproved segment,
             * while only FLAGGED ones are drawn. A lesson with one flagged
             * section among six left five "outstanding" after the teacher
             * had settled everything on screen - blocked, with nothing left
             * to click.
             */
            ready={review.ready}
            outstandingKeyPoints={outstandingPoints}
            outstandingSections={outstandingSections}
          />
        </div>

        {/*
          THE REVIEW ITSELF, not a sign pointing at one (SCRUM-153).

          This banner used to say sections wanted a look and leave it there,
          and the only control that could settle one lived on another screen,
          behind a link inside a row. A teacher who uploaded a lesson was told
          it needed checking, told to do the checking on a page called "My
          Lessons" that has never existed, and could not assign their own
          lesson. It stopped a demonstration on 19 September.

          LR-03's copy, and LR-04's live count: how many are left, and what
          that means for the one action a teacher came here to take.
        */}
        {/* BEFORE the review, because it changes what the review IS. A
            teacher checking key points drawn from their own pasted text is
            doing something different from checking Nevo's reading of it. */}
        <SplitSourceNotice segments={segments} />

        {waiting > 0 ? (
          <div className="mt-6 flex max-w-[660px] items-start gap-3.5 rounded-[12px] bg-nevo-violet/14 px-[18px] py-4">
            <span className="mt-px shrink-0 text-nevo-navy">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8h.01M11 12h1v4h1" />
              </svg>
            </span>
            <p className="text-[14.5px] leading-[1.55] text-nevo-near-black/78">
              <strong className="font-semibold text-nevo-near-black">
                {`${waitingLine} waiting for you:`}
              </strong>{" "}
              {/* LR-03's copy, verbatim from the ruling. "Nevo wasn't
                  confident it's read this correctly. They are marked below."
                  was the sentence this replaces, and it does not parse. */}
              Nevo is unsure it read these parts correctly. Open each one to
              check it, then accept or change it. Nothing you did is lost.
            </p>
          </div>
        ) : (
          assignments.length === 0 && (
            /*
             * LR-05, and C06b draws it as a STATE rather than a sentence.
             *
             * What stood here was a line of my own - "you have checked
             * everything Nevo was unsure about" - written before the frame
             * was pulled. The frame has no such acknowledgement: a lesson
             * with nothing outstanding simply IS the ready state, whether it
             * was reviewed or arrived clean, and it says what a teacher can
             * do next rather than what they just did.
             *
             * SCRUM-152's system message is the other half of this beat and
             * is not built in this console yet.
             */
            <div className="mt-6 max-w-[660px] rounded-[12px] bg-nevo-navy/6 px-[18px] py-4">
              <p className="text-[15px] font-semibold text-nevo-near-black">
                Ready when you are
              </p>
              <p className="mt-1 text-[14.5px] leading-[1.55] text-nevo-near-black/70">
                {`Nevo has prepared this lesson into ${plural(lesson.segmentCount, "section", "sections")}. Assign it to a class and it'll open for students at the time you choose.`}
              </p>
            </div>
          )
        )}

        {/* The cards themselves, directly under what they are about.

            KEY POINTS FIRST, because they are the ticket's unit and the
            ordinary case; a flagged section is the rarer second reason a
            lesson is held. */}
        {review.keyPoints.length > 0 && (
          <h3 className={cn(SECTION_H, "mt-7")}>Key points Nevo found</h3>
        )}
        {review.keyPoints.length > 0 && (
          <div className="mt-3 flex max-w-[860px] flex-col gap-2.5">
            {review.keyPoints.map((kp) => (
              <KeyPointCard
                key={kp.id}
                keyPoint={kp}
                working={
                  review.working?.id === kp.id ? review.working.action : null
                }
                failed={review.actionFailed === kp.id}
                onAccept={() => review.accept(kp.id)}
                onAmend={(text) => review.amend(kp.id, text)}
                onRemove={() => review.remove(kp.id)}
              />
            ))}
          </div>
        )}

        {review.failed && (
          /* Not "nothing to review" - we could not find out. Assign stays
             open, because refusing a teacher over our own outage is worse
             than letting the server refuse with a reason. */
          <p className="mt-4 max-w-[660px] text-[14.5px] leading-[1.55] text-nevo-near-black/68">
            We couldn&rsquo;t load the key points just now. Nothing is wrong
            with the lesson - try again in a moment.
          </p>
        )}

        {reviewable.length > 0 && (
          <div className="mt-4 flex max-w-[860px] flex-col gap-2.5">
            {reviewable.map((s) => (
              <ReviewSection
                key={s.id}
                segment={s}
                index={s.sequenceOrder}
                approved={sections.isApproved(s)}
                approving={sections.approving === s.id}
                failed={sections.failed === s.id}
                onAccept={() => sections.approve(s.id, onSectionApproved)}
              />
            ))}
          </div>
        )}

        {lesson.confirmationSummary && (
          <p className="mt-4 max-w-[68ch] text-[14.5px] leading-[1.6] text-nevo-near-black/72">
            {lesson.confirmationSummary}
          </p>
        )}

        {progress?.slowdownNote && (
          <p className="mt-5 max-w-[68ch] rounded-[12px] bg-nevo-violet/14 px-[18px] py-4 text-[14.5px] leading-[1.6] text-nevo-near-black/82">
            {progress.slowdownNote}
          </p>
        )}

        {/* Sits ABOVE the lesson's contents, because a teacher who has come
            here to undo a mis-assignment is not looking for the segment list -
            they are looking for the class they got wrong. */}
        <AssignmentSchedule assignments={assignments} />

        {/*
          WHERE THIS LESSON WENT - all of it, per design's ruling of 24 Sep.
          A list rather than tabs: a teacher checking a mis-assignment is
          looking for the class, and one tab at a time hides the answer behind
          a click.

          Absent is not empty. An older deployment sends no `classes` at all,
          and drawing "not assigned to any class" over that would be inventing
          the one fact this section exists to report.
        */}
        {classes.length > 0 && (
          <>
            <h3 className={cn(SECTION_H, "mt-8")}>Where this lesson went</h3>
            <ul className="mt-3 flex list-none flex-col gap-0 overflow-hidden rounded-xl bg-nevo-cream-elevated p-0 shadow-elevation-1">
              {classes.map((c, i) => (
                <li
                  key={c.id}
                  className={cn(
                    "flex items-center gap-3 px-[18px] py-3",
                    i < classes.length - 1 &&
                      "border-b border-nevo-near-black/7",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium text-nevo-near-black">
                    {c.name}
                    {c.yearGroup && (
                      <span className="ml-2 font-normal text-nevo-near-black/50">
                        {c.yearGroup}
                      </span>
                    )}
                  </span>
                  {/* Distinct children, per the contract - not assignment
                      rows. Absent means we were not told, and 0 children is a
                      class the lesson reached nobody in, so neither may be
                      rendered as the other. */}
                  {typeof c.studentCount === "number" && (
                    <span className="shrink-0 text-[13px] whitespace-nowrap text-nevo-near-black/55">
                      {`${c.studentCount} ${c.studentCount === 1 ? "student" : "students"}`}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        <h3 className={cn(SECTION_H, "mt-8")}>
          What&rsquo;s in this lesson
          {progress && classes.length > 1 && (
            /*
             * THE PROGRESS IS STILL ONE CLASS'S, and now it can say whose.
             * `class-progress` takes a single `classId`, so the numbers below
             * describe one class however many appear above - and "progress
             * shown for one class" left a teacher to guess which.
             */
            <span className="ml-2 font-normal tracking-normal text-nevo-near-black/45 normal-case">
              {classes.find((c) => c.id === progress.classId)
                ? `progress for ${classes.find((c) => c.id === progress.classId)!.name}`
                : "progress shown for one class"}
            </span>
          )}
        </h3>
        {segments.length > 0 && grouped.length > 0 ? (
          <div className="mt-3.5 flex flex-col gap-4 xl:mt-4">
            {grouped.map((g) => (
              <div key={g.module?.id ?? "ungrouped"}>
                <h4 className="text-[14.5px] font-semibold text-nevo-near-black">
                  {g.module?.title ?? "Also in this lesson"}
                </h4>
                {g.module?.preview && (
                  <p className="mt-1 max-w-[64ch] text-[13.5px] leading-[1.5] text-nevo-near-black/62">
                    {g.module.preview}
                  </p>
                )}
                <div className="mt-2.5 divide-y divide-nevo-near-black/7 overflow-hidden rounded-[12px] bg-nevo-cream-elevated shadow-elevation-1">
                  {g.segments.map((s) => (
                    <SegmentRow
                      key={s.id}
                      segment={s}
                      index={segments.indexOf(s)}
                      lessonId={lesson.id}
                      progress={bySegment.get(s.id)}
                      slowest={progress?.slowestSegmentId === s.id}
                      outstanding={waitingIds.has(s.id)}
                    />
                  ))}
                </div>
                {g.module?.recap && (
                  <p className="mt-2 max-w-[64ch] text-[13px] leading-[1.5] text-nevo-near-black/55 italic">
                    {g.module.recap}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : segments.length > 0 ? (
          <div className="mt-3.5 divide-y divide-nevo-near-black/7 overflow-hidden rounded-[12px] bg-nevo-cream-elevated shadow-elevation-1 xl:mt-4">
            {segments.map((s, i) => (
              <SegmentRow
                key={s.id}
                segment={s}
                index={i}
                lessonId={lesson.id}
                progress={bySegment.get(s.id)}
                slowest={progress?.slowestSegmentId === s.id}
                outstanding={waitingIds.has(s.id)}
              />
            ))}
          </div>
        ) : (
          <div className="mt-3.5 rounded-[12px] bg-nevo-cream-elevated px-[22px] py-6 shadow-elevation-1">
            <p className="text-[14.5px] leading-[1.55] text-nevo-near-black/68">
              {lesson.status === "failed"
                ? "Nevo couldn’t read this file, so there are no sections to show."
                : "Nevo is still reading this lesson. Sections will appear here once it’s done."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
