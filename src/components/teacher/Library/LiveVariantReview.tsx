"use client";

import Link from "next/link";
import { useState } from "react";
import { lessonsApi } from "@/lib/api/lessons";
import { AudioVariantPlayer } from "./AudioVariantPlayer";
import { IllustrationWrapper } from "@/components/shared/IllustrationWrapper";
import type { LessonSegment } from "@/lib/api/lessons";
import {
  VARIANT_ORIENTATION,
  VARIANT_TABS,
  type VariantTab,
} from "@/lib/mocks/teacherIntelligence";
import { reasonCopy } from "@/lib/constants/reviewReasons";
import { cn } from "@/lib/utils";

/**
 * Variant review, on the teacher's OWN lesson (C16d).
 *
 * The designed screen next door (`VariantReview.tsx`) renders hand-written
 * preview paragraphs, and this one reads the real thing.
 *
 * THE FIELDS WERE NEVER MISSING, which is not what this console believed.
 * Backend, 11 Sep: both `GET /api/content/lessons/{id}` and
 * `GET /api/v1/lessons/{id}` have carried `textVariant`, `visualVariant`,
 * `audioVariant`, `interactiveVariant`, `calculationVariant` and
 * `comprehensionCheckpoints` on every segment THROUGHOUT. What was missing was
 * CONTENT: the parse was silently falling back to deterministic text on every
 * lesson for weeks, so the fields were present and always null - and we read
 * "always null" as "not in the contract" and wrote that down as a contract
 * fact. `docs/BUILD_STATUS.md` then carried it as a backend blocker.
 *
 * The lesson worth keeping: a field that is always null is not evidence of a
 * missing field. Check the schema, not the payload.
 *
 * So this screen asks for nothing new - it reads what `useLessonDetail` had
 * already loaded for the lesson page and thrown away.
 *
 * FIVE TABS AS OF 21 SEP. This said four was deliberate: `calculationVariant`
 * is the fifth variant on the contract, C16d drew no tab for it, and adding
 * one "would mean inventing a tab, its label and its layout". Right to raise,
 * wrong to leave sitting - design had already ruled it on 14 Sep in SCRUM-136,
 * and the ruling answers all three: show it, label it "Calculation", follow
 * the shape of the other tabs, steps in sequence, completion statement
 * beneath them.
 *
 * Nothing below is invented. What is NOT rendered is listed where it is not
 * rendered, with the same care as what is.
 *
 * WHAT IS NOT RENDERED, and why:
 *  - `interactiveVariant.answerKey`. The frame draws nothing for it, and a
 *    teacher reviewing whether a variant reads well does not need the answer to
 *    do that. Easy to add if design asks.
 *  - ~~An audio PLAYER.~~ BUILT 17 Sep. The reason it was deferred expired:
 *    `POST /api/content/media/url` is deployed, `contentApi.mediaUrl` was
 *    already wrapped, and nothing called it. `AudioVariantPlayer` recovers a
 *    dead URL through it once, on the element's own error, which is the only
 *    reliable signal that a signed URL has aged out.
 */

/**
 * DEVIATION FROM THE FRAME, flagged rather than hidden: C16d draws no review
 * banner, because when it was drawn there was nothing to put in one.
 * `needsReview` and `reviewReasons` are now required fields on every segment,
 * and the contract's own description of the reason enum says the console is
 * meant to render copy per reason - "Enumerated so the console can render its
 * own copy per reason instead of printing the raw token with underscores
 * swapped for spaces."
 *
 * A screen called variant review that hides the backend's own "this needs
 * review, and here is why" would be the wrong reading of the frame's silence.
 * Design to confirm the placement and wording.
 */
/*
 * THE REASON COPY MOVED (SCRUM-153) to `lib/constants/reviewReasons.ts`.
 *
 * It lived here because this was the only screen with anywhere to put it.
 * The lesson page now runs the review itself, and two registers describing
 * the same section to the same teacher is how two wordings drift - the
 * mistake the roster observations already avoided by sharing one file.
 */

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[13.5px] leading-[1.6] text-nevo-near-black/55 italic">
      {children}
    </p>
  );
}

function Para({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[13.5px] leading-[1.6] text-nevo-near-black/72">
      {children}
    </p>
  );
}

function VariantBody({
  tab,
  segment,
  approved,
}: {
  tab: VariantTab;
  segment: LessonSegment;
  /** This section has been approved, here or before this screen opened. */
  approved: boolean;
}) {
  if (tab === "Text") {
    const v = segment.textVariant;
    if (!v)
      return (
        <Empty>Nevo has not generated a written version of this section.</Empty>
      );
    return (
      <div className="flex flex-col gap-2.5">
        <Para>{v.body}</Para>
        {v.keyPoints.length > 0 && (
          <ul className="mt-0.5 flex flex-col gap-1.5">
            {v.keyPoints.map((point) => (
              <li
                key={point}
                className="flex gap-2 text-[13.5px] leading-[1.6] text-nevo-near-black/72"
              >
                <span aria-hidden className="text-nevo-navy/50">
                  •
                </span>
                {point}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (tab === "Visual") {
    const v = segment.visualVariant;
    if (!v)
      return (
        <Empty>Nevo has not generated a visual version of this section.</Empty>
      );
    return (
      <div className="flex flex-col gap-3">
        {v.imageUrl && (
          <IllustrationWrapper
            src={v.imageUrl}
            alt={v.caption || "Visual version of this section"}
            width={720}
            height={420}
            className="rounded-[10px]"
          />
        )}
        {v.caption && <Para>{v.caption}</Para>}
        {/* The frame draws no sign-off line, but "reviewed by nobody" is the
            thing a reviewer most wants to know on a review screen.

            NOT ONCE IT IS APPROVED (T58). The segment this reads is the one
            the page loaded with, so a teacher who had just approved the
            section was told, under their own approval, that nobody had
            signed the picture off. The name is the server's to give; until
            it does, an approved section claims nothing either way. */}
        {(v.reviewedBy || !approved) && (
          <p className="text-[12.5px] text-nevo-near-black/55">
            {v.reviewedBy
              ? `Signed off by ${v.reviewedBy}.`
              : "No one has signed this picture off yet."}
          </p>
        )}
      </div>
    );
  }

  if (tab === "Audio") {
    const v = segment.audioVariant;
    if (!v)
      return (
        <Empty>
          Nevo has not generated a narrated version of this section.
        </Empty>
      );
    // `durationMs` went nullable on 14 Sep. Behaviour is unchanged - null and 0
    // both give 0 here, and the line below is already gated on `seconds > 0` -
    // but the compiler now sees the null the wire can send.
    const seconds = Math.round((v.durationMs ?? 0) / 1000);
    return (
      <div className="flex flex-col gap-2.5">
        <Para>{v.script}</Para>
        {/*
          THE PLAYER, at last. This screen showed the script alone and its own
          comment explained why: an expiring, sometimes-authenticated URL made a
          bare `<audio src>` a control that could silently fail, and it would
          wait for "a refresh path through POST /api/content/media/url". That
          path is deployed and was uncalled.
          
          A teacher approving narration for a class cannot judge it from a
          transcript - whether the voice is right, whether it stumbles over
          "denominator", whether the pace suits a nine-year-old.
        */}
        <AudioVariantPlayer variant={v} />
        {seconds > 0 && (
          <p className="text-[12.5px] text-nevo-near-black/55">
            {/* Still "about": `durationMs` is un-computed metadata, and the
                element above knows the real length. Kept because it is useful
                before anyone presses play. */}
            {`About ${Math.max(1, Math.round(seconds / 60))} minute${
              seconds >= 90 ? "s" : ""
            } of narration.`}
          </p>
        )}
      </div>
    );
  }

  if (tab === "Interactive") {
    const v = segment.interactiveVariant;
    if (!v)
      return (
        <Empty>
          Nevo has not generated an interactive version of this section.
        </Empty>
      );
    return (
      <div className="flex flex-col gap-2.5">
        <Para>{v.prompt}</Para>
        {v.instructions && <Para>{v.instructions}</Para>}
        {v.options.length > 0 && (
          <ul className="mt-0.5 flex flex-col gap-1.5">
            {v.options.map((o, i) => (
              <li
                key={`${String(o)}-${i}`}
                className="rounded-[8px] bg-nevo-cream px-3 py-2 text-[13.5px] leading-[1.5] text-nevo-near-black/72"
              >
                {String(o)}
              </li>
            ))}
          </ul>
        )}
        {v.expectedInteraction && (
          <p className="text-[12.5px] text-nevo-near-black/55">
            {`Students respond by: ${v.expectedInteraction}.`}
          </p>
        )}
      </div>
    );
  }

  /*
   * THE FIFTH FORM (SCRUM-136). A calculation variant is the one a student
   * WORKS rather than reads, and a teacher could not see it at all.
   *
   * WHAT IS NOT DRAWN, and why - the same list the interactive tab keeps:
   *  - Each step's `answer`, and the variant's own. A teacher reading whether
   *    the steps are right does not need them, and the interactive tab
   *    already withholds its `answerKey` on exactly that reasoning.
   *  - `hint`. It is what a child gets when they are stuck, not part of
   *    judging whether the working is sound, and the ruling does not ask for
   *    it. One line to add if design wants it.
   *  - `scaffoldImage` and `manipulative`. Both nullable, neither drawn in
   *    any frame, and a picture placed here would be a guess at layout.
   */
  const v = segment.calculationVariant;
  if (!v)
    return <Empty>Nevo has not generated worked steps for this section.</Empty>;
  return (
    <div className="flex flex-col gap-3">
      {v.fullEquation && (
        <p className="font-mono text-[15px] tracking-[0.01em] text-nevo-near-black">
          {v.fullEquation}
        </p>
      )}
      {v.steps.length > 0 ? (
        <ol className="flex flex-col gap-2">
          {v.steps.map((step, i) => (
            <li
              key={step.stepId}
              className="flex gap-3 rounded-[8px] bg-nevo-cream px-3 py-2.5"
            >
              <span className="w-5 shrink-0 pt-px text-[12.5px] text-nevo-near-black/45 tabular-nums">
                {/* The server's own numbering, not the row index: a variant
                    may arrive with steps that do not start at one. */}
                {step.stepNumber || i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] leading-[1.5] text-nevo-near-black/82">
                  {step.prompt}
                </span>
                {step.equationState && (
                  /* What the equation reads once this step is done. It is
                     how a teacher checks the working actually works. */
                  <span className="mt-1 block font-mono text-[12.5px] text-nevo-near-black/55">
                    {step.equationState}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <Empty>The worked steps did not come through for this section.</Empty>
      )}
      {v.completionStatement && (
        <p className="text-[13.5px] leading-[1.55] text-nevo-near-black/72">
          {v.completionStatement}
        </p>
      )}
    </div>
  );
}

export function LiveVariantReview({
  lessonId,
  lessonTitle,
  segment,
  sectionIndex,
  segmentCount,
}: {
  lessonId: string;
  lessonTitle: string;
  segment: LessonSegment;
  sectionIndex: number;
  /** How many sections this lesson has, for "Section N of M". */
  segmentCount?: number;
}) {
  const [tab, setTab] = useState<VariantTab>("Text");
  /*
   * APPROVAL, which this screen has never had (17 Sep).
   *
   * C07b's stated purpose is that "the teacher reviews each segment's variants
   * and approves them for the class. Approval is manual and deliberate." There
   * was no transport for it, so what shipped was review WITHOUT approval and
   * the frame's purpose went unmet. Backend built it once design settled the
   * question.
   *
   * It is not cosmetic any more: ASSIGNMENT IS GATED on every segment being
   * approved, so without this control a teacher cannot assign a lesson they
   * have just uploaded and has no way to unblock themselves.
   *
   * Local state, seeded from the server's `approved`, because the lesson read
   * that produced `segment` is not refetched when a single segment is approved
   * - and the approval response carries the lesson counts precisely so it does
   * not have to be.
   */
  const [approved, setApproved] = useState(segment.approved);
  const [counts, setCounts] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * WHETHER THE LESSON CAN NOW GO TO A CLASS - the server's `readyToAssign`,
   * read once the last section is approved. Null until it has been read.
   *
   * "Every section approved. This lesson can be assigned." was said on the
   * section count alone. Sections are half of it: a key point Nevo could not
   * ground holds a lesson back too, and that half is only in the review read.
   * A teacher told "can be assigned" went back to a greyed-out Assign.
   */
  const [assignable, setAssignable] = useState<{
    ready: boolean;
    keyPoints: number;
  } | null>(null);

  async function approve() {
    if (approved || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await lessonsApi.approveSegment(lessonId, segment.id);
      setApproved(true);
      setCounts({ done: res.approvedSegmentCount, total: res.segmentCount });
      if (res.approvedSegmentCount === res.segmentCount) {
        // Best-effort: unknown says less, never more. A failed read leaves
        // "Every section approved." standing alone, which is still true.
        void lessonsApi
          .review(lessonId)
          .then((r) =>
            setAssignable({ ready: r.readyToAssign, keyPoints: r.outstandingCount }),
          )
          .catch(() => {});
      }
    } catch {
      // Nothing is approved until the server says so. Claiming otherwise is
      // the shape of bug this console has shipped before.
      setError(
        `We couldn${"’"}t record that just now. Nothing has changed, so you can try again.`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[680px] xl:max-w-[820px]">
        <Link
          href={`/teacher/lessons/${lessonId}`}
          className="inline-flex cursor-pointer items-center gap-[7px] text-[13px] text-nevo-near-black/55 transition-transform active:scale-[0.99] xl:text-[13.5px]"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M15 6l-6 6 6 6" />
          </svg>
          Lesson Library · Variant review
        </Link>

        <h1 className="mt-0.5 text-[22px] font-semibold tracking-[-0.018em] text-nevo-near-black xl:text-[26px]">
          {`${lessonTitle} · Section ${sectionIndex}`}
        </h1>
        {segment.title && (
          <p className="mt-1 text-[14px] text-nevo-near-black/60">
            {segment.title}
          </p>
        )}

        <p className="mt-4 text-[13px] leading-[1.6] text-nevo-near-black/60 italic">
          {VARIANT_ORIENTATION}
        </p>

        {segment.needsReview && (
          <div className="mt-4 rounded-[12px] border border-nevo-violet/35 bg-nevo-violet/10 px-[18px] py-4">
            <p className="text-[13.5px] font-semibold text-nevo-near-black">
              Nevo flagged this section for a look
            </p>
            <div className="mt-1.5 flex flex-col gap-1.5">
              {segment.reviewReasons.map((reason) => (
                <p
                  key={reason}
                  className="text-[13px] leading-[1.55] text-nevo-near-black/72"
                >
                  {reasonCopy(reason)}
                </p>
              ))}
            </div>
          </div>
        )}

        <div
          className="mt-4 flex flex-wrap gap-2 xl:flex-nowrap"
          role="tablist"
          aria-label="Lesson variants"
        >
          {VARIANT_TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "inline-flex h-9 cursor-pointer items-center rounded-[8px] px-[18px] text-[13px] transition-[background-color,transform] active:scale-[0.99]",
                tab === t
                  ? "bg-nevo-navy font-semibold text-nevo-cream"
                  : "bg-nevo-cream-elevated font-medium text-nevo-near-black/70 hover:bg-nevo-navy/8",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-[12px] bg-nevo-cream-elevated p-[22px] xl:p-6">
          <h3 className="text-[14px] font-semibold text-nevo-near-black xl:text-[15px]">
            {`${tab} variant`}
          </h3>
          <div className="mt-3">
            <VariantBody tab={tab} segment={segment} approved={approved} />
          </div>
        </div>

        {/*
          C07b draws "Reviewing segment N of 5" beside the control. `of M` is
          only rendered when the caller knows M - the count is not derivable
          from one segment, and inventing it would be a number we did not
          measure.
        */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-nevo-near-black/60">
            {segmentCount
              ? `Reviewing section ${sectionIndex} of ${segmentCount}`
              : `Reviewing section ${sectionIndex}`}
          </p>

          {approved ? (
            <span className="inline-flex h-11 items-center gap-2 rounded-[10px] border-[1.5px] border-nevo-navy/25 px-4 text-sm font-medium text-nevo-near-black/70">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
              Approved
            </span>
          ) : (
            <button
              type="button"
              onClick={approve}
              disabled={busy}
              className="inline-flex h-[42px] cursor-pointer items-center rounded-[10px] bg-nevo-navy px-[18px] text-[13.5px] font-semibold text-nevo-cream transition-[filter] hover:brightness-93 disabled:cursor-default disabled:opacity-60 xl:h-11 xl:px-5 xl:text-sm"
            >
              {busy ? "Approving…" : "Approve this section"}
            </button>
          )}
        </div>

        {counts && (
          <p className="mt-2.5 text-right text-[13px] text-nevo-near-black/60">
            {counts.done === counts.total
              ? assignable?.ready
                ? "Every section approved. This lesson can be assigned."
                : assignable && assignable.keyPoints > 0
                  ? /* The lesson page's own count, in its own words. */
                    `Every section approved. ${assignable.keyPoints} ${assignable.keyPoints === 1 ? "key point" : "key points"} waiting for you.`
                  : "Every section approved."
              : `${counts.done} of ${counts.total} sections approved.`}
          </p>
        )}
        {/* C07b's end state carries its next step: "Lesson approved", then
            "Assign to classes". Only when the server says it can go - the
            line above is the reason; this is the way there. */}
        {counts && counts.done === counts.total && assignable?.ready && (
          <div className="mt-3 flex justify-end">
            <Link
              href={`/teacher/lessons/assign?lesson=${lessonId}`}
              className="inline-flex h-[42px] cursor-pointer items-center rounded-[10px] bg-nevo-navy px-[18px] text-[13.5px] font-semibold text-nevo-cream transition-[filter] hover:brightness-93 xl:h-11 xl:px-5 xl:text-sm"
            >
              Assign to classes
            </Link>
          </div>
        )}

        {error && (
          <p className="mt-2.5 text-right text-[13px] leading-[1.5] text-nevo-near-black/72">
            {error}
          </p>
        )}

        {/*
          C07b'S SECTION PILLS (T54). Each section was its own URL with no way
          to the next one but back to the lesson and down the list - six
          sections, six round trips. The frame draws a pill per section under
          the review: this one filled, the ones before it tinted, the rest
          plain. Links rather than buttons, because each is still its own
          address and the back button should walk them. "Section", as this
          screen says everywhere else, where the frame says "Segment".
        */}
        {segmentCount !== undefined && segmentCount > 1 && (
          <nav aria-label="Sections" className="mt-4 flex flex-wrap gap-1.5 xl:gap-2">
            {Array.from({ length: segmentCount }, (_, i) => i + 1).map((n) => (
              <Link
                key={n}
                href={`/teacher/lessons/${lessonId}/variants?section=${n}`}
                aria-current={n === sectionIndex ? "page" : undefined}
                className={cn(
                  "inline-flex h-[30px] cursor-pointer items-center rounded-full px-3 text-[11.5px] transition-[filter] xl:h-8 xl:px-3.5 xl:text-[12px]",
                  n === sectionIndex
                    ? "bg-nevo-navy font-semibold text-nevo-cream"
                    : n < sectionIndex
                      ? "bg-nevo-violet/12 font-medium text-nevo-navy hover:brightness-95"
                      : "bg-nevo-cream-elevated font-normal text-nevo-near-black/70 hover:brightness-95",
                )}
              >
                {`Section ${n}`}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}
