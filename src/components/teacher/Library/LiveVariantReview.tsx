"use client";

import Link from "next/link";
import { useState } from "react";
import { equationsOf, keyTermsOf } from "@/lib/lessons/fromContent";
import { AudioVariantPlayer } from "./AudioVariantPlayer";
import { IllustrationWrapper } from "@/components/shared/IllustrationWrapper";
import type { LessonSegment } from "@/lib/api/lessons";
import {
  VARIANT_ORIENTATION,
  VARIANT_TABS,
  type VariantTab,
} from "@/lib/mocks/teacherIntelligence";
import { reasonCopy } from "@/lib/constants/reviewReasons";
import { isActivity } from "@/lib/api/variants";
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
    /*
     * SCRUM-224: WHAT THE CHILD SEES, THE TEACHER REVIEWS. The text segment
     * now carries key terms and equation callouts beside its body, and the
     * child's lesson draws both - so a teacher approving this section was
     * signing off words they had not seen. Read through the same clean-up the
     * lesson uses, so the two never disagree about what is there.
     *
     * No teacher frame draws them yet; they sit with the key points, in the
     * same quiet register. Raised with design.
     */
    const terms = keyTermsOf(v.keyTerms) ?? [];
    const equations = equationsOf(v.equationCallouts) ?? [];
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
        {terms.length > 0 && (
          <div className="mt-1.5">
            <h4 className="text-[12px] font-semibold tracking-[0.04em] text-nevo-near-black/50 uppercase">
              Key terms
            </h4>
            <dl className="mt-1.5 flex flex-col gap-1.5">
              {terms.map((t) => (
                <div key={t.term} className="text-[13.5px] leading-[1.6] text-nevo-near-black/72">
                  <dt className="inline font-semibold text-nevo-near-black">{t.term}</dt>
                  {t.definition && (
                    <dd className="inline">
                      {" - "}
                      {t.definition}
                    </dd>
                  )}
                </div>
              ))}
            </dl>
          </div>
        )}
        {equations.length > 0 && (
          <div className="mt-1.5 flex flex-col gap-2">
            {equations.map(({ equation, label }, i) => (
              <div key={i} className="rounded-[10px] bg-nevo-violet/8 px-3.5 py-3">
                {/* No label is no heading, as the lesson has it. */}
                {label && (
                  <p className="mb-1.5 font-mono text-[10.5px] tracking-[0.06em] text-nevo-navy uppercase">
                    {label}
                  </p>
                )}
                <p className="text-[14px] leading-[1.6] font-medium text-nevo-near-black">
                  {equation}
                </p>
              </div>
            ))}
          </div>
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
    /*
     * TWO FORMS (Teslim, 14 Oct). A lesson parsed since 13 Oct carries an
     * ACTIVITY; every earlier one carries a QUESTION, and backend keeps both.
     * This tab drew only the question - `v.options.length` - so an activity,
     * which has no options, threw and took the review down with it.
     *
     * The question is drawn as it always was. The activity shows its title,
     * what is needed, the steps in order and the outcome to look for. No frame
     * draws an activity yet, so it is laid out like the other tabs and
     * nothing more; its two labels are ours, raised with design. Both read
     * defensively: a field the server left out is left out here.
     */
    if (!isActivity(v)) {
      const options = Array.isArray(v.options) ? v.options : [];
      return (
        <div className="flex flex-col gap-2.5">
          {v.prompt && <Para>{v.prompt}</Para>}
          {v.instructions && <Para>{v.instructions}</Para>}
          {options.length > 0 && (
            <ul className="mt-0.5 flex flex-col gap-1.5">
              {options.map((o, i) => (
                <li
                  key={`${String(o)}-${i}`}
                  className="rounded-[12px] bg-nevo-cream px-3 py-2 text-[13.5px] leading-[1.5] text-nevo-near-black/72"
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
    const materials = Array.isArray(v.materials) ? v.materials.filter(Boolean) : [];
    const steps = Array.isArray(v.steps) ? v.steps.filter((s) => s?.instruction) : [];
    return (
      <div className="flex flex-col gap-2.5">
        {v.title && (
          <p className="text-[14.5px] font-semibold text-nevo-near-black">{v.title}</p>
        )}
        {materials.length > 0 && (
          <div>
            <p className="text-[12.5px] font-semibold text-nevo-near-black/55">
              What&rsquo;s needed
            </p>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {materials.map((m, i) => (
                <li
                  key={`${m}-${i}`}
                  className="rounded-full bg-nevo-cream px-3 py-1 text-[13px] text-nevo-near-black/72"
                >
                  {m}
                </li>
              ))}
            </ul>
          </div>
        )}
        {steps.length > 0 && (
          <ol className="flex flex-col gap-1.5">
            {steps.map((s, i) => (
              <li
                key={s.id || i}
                className="flex gap-2.5 rounded-[12px] bg-nevo-cream px-3 py-2 text-[13.5px] leading-[1.5] text-nevo-near-black/72"
              >
                <span className="shrink-0 font-semibold text-nevo-navy">{i + 1}</span>
                <span>{s.instruction}</span>
              </li>
            ))}
          </ol>
        )}
        {v.outcome && (
          <p className="text-[12.5px] leading-[1.5] text-nevo-near-black/60">
            {`By the end: ${v.outcome}`}
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
              className="flex gap-3 rounded-[12px] bg-nevo-cream px-3 py-2.5"
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
  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      {/* No cap of its own at tablet - it conforms to its host (C16d, 8 Oct). */}
      <div className="mx-auto xl:max-w-[820px]">
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

        {/*
          C07b-1, PORTED TO C07k (design 534ba31; Lydia, 19 Oct): "C07b's
          per-segment approve step is retired; it keeps its assignment steps."
          The approve control that stood under these tabs is gone, and with it
          the route it called, which backend has deprecated in favour of the
          lesson-wide sign-off. The variants stay readable here.
        */}
        <div className="mt-[22px] rounded-[12px] bg-nevo-cream-elevated px-7 py-[26px] shadow-elevation-1">
          <h2 className="text-[18px] font-semibold text-nevo-near-black">
            Reviewing happens in four calm steps now
          </h2>
          <p className="mt-[9px] text-[14.5px] leading-[1.55] text-pretty text-nevo-near-black/68">
            The rewrites are checked in step 3 of the flow. One press accepts
            them all. You approve the lesson once, then assign it anywhere.
          </p>
          <Link
            href={`/teacher/lessons/${lessonId}/review`}
            className="mt-5 inline-flex h-[46px] cursor-pointer items-center gap-2 rounded-[10px] bg-nevo-navy px-[22px] text-[14.5px] font-semibold text-nevo-cream transition-[filter] hover:brightness-93"
          >
            Open the review flow
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 6l6 6-6 6" />
            </svg>
          </Link>
        </div>

        <p className="mt-4 text-[13px] leading-[1.6] text-nevo-near-black/60 italic xl:mt-[18px]">
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
          className="mt-4 flex gap-1.5 xl:gap-2"
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
                "inline-flex h-[38px] flex-1 basis-0 cursor-pointer items-center justify-center rounded-[10px] px-2 text-[12.5px] transition-[background-color,transform] active:scale-[0.99] xl:h-9 xl:flex-none xl:basis-auto xl:justify-start xl:px-[18px] xl:text-[13px]",
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
            <VariantBody tab={tab} segment={segment} approved={segment.approved} />
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
        </div>

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
