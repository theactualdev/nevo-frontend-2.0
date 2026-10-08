"use client";

import { useEffect, useRef, useState } from "react";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import type { StudentProfileData } from "@/lib/mocks/teacherStudents";
import { cn } from "@/lib/utils";

/**
 * C08c Recommend a Lesson - the primary action on a student's profile. Nevo
 * suggests a fitting lesson and says why in a colleague's voice; the teacher
 * confirms which version and adds an optional note. Confirmation is warm and
 * matter-of-fact, never celebratory.
 *
 * Tablet drops the "Which lesson" label and the note field entirely (frame),
 * so the note is a desktop-only affordance - flagged to design.
 *
 * The success sentence is templated rather than hardcoded: the third option
 * has no version qualifier, and the note clause only earns its place when a
 * note was actually written.
 */

const optionTitle = (o: { lesson: string; version?: string }) =>
  o.version ? `${o.lesson} - ${o.version}` : o.lesson;

export function RecommendSheet({
  student,
  onClose,
}: {
  student: StudentProfileData;
  onClose: () => void;
}) {
  const rec = student.recommend!;
  const [choice, setChoice] = useState(
    rec.options.find((o) => o.suggested)?.id ?? rec.options[0].id,
  );
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const firstName = student.name.split(" ")[0];
  const chosen = rec.options.find((o) => o.id === choice)!;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !sent) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, sent]);

  /*
   * THE NAME, NEVER A PRONOUN.
   *
   * This read `student.pronoun` and interpolated "her" and "She" into copy a
   * teacher reads about a named child. Frontend section 6: no pronoun is stored
   * for any child and there is no field that could make it right - and the
   * deployed spec carries no pronoun property on any schema, so the field this
   * read was a fixture invention with nothing behind it. It is deleted.
   *
   * The gate could not see this one: it matches pronoun string LITERALS, and
   * these arrived through a variable.
   *
   * `LiveRecommendSheet` - the sheet a signed-in teacher actually gets - had
   * already solved it the right way, with the child's name. This is the same
   * shape, so the two now read alike.
   */
  const lessonClause = chosen.version
    ? `"${chosen.lesson}" - the ${chosen.version} version - is now waiting in ${firstName}'s lessons.`
    : `"${chosen.lesson}" is now waiting in ${firstName}'s lessons.`;
  const noteClause = note.trim() ? " Your note went with it." : "";

  // The desktop reason bolds the lesson-and-version run, per the frame.
  const [before, after] = rec.suggestDesktop.split(rec.suggestStrong);

  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-nevo-near-black/28 backdrop-blur-[1.5px] p-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
      onClick={() => !sent && onClose()}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Recommend a lesson to ${firstName}`}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "w-full rounded-[16px] bg-nevo-cream shadow-[0_8px_32px_rgba(0,0,0,0.16)] motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:duration-200",
          sent
            ? "flex max-w-[420px] flex-col items-center p-8 text-center xl:p-9"
            : "max-w-[520px] p-7 xl:max-w-[560px] xl:p-[30px]",
        )}
      >
        {sent ? (
          <>
            <span className="flex size-[58px] items-center justify-center rounded-full bg-nevo-navy text-nevo-cream motion-safe:animate-nevo-pop xl:size-[60px]">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="xl:size-[30px]">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </span>
            <h2 className="mt-[18px] text-xl font-semibold tracking-[-0.01em] text-nevo-near-black xl:mt-5 xl:text-[21px]">
              {`That's sent to ${firstName}`}
            </h2>
            <p className="mt-[9px] text-[14.5px] leading-[1.55] text-nevo-near-black/68 xl:mt-2.5 xl:text-[15px]">
              {`${lessonClause}${noteClause}`}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 flex h-[46px] cursor-pointer items-center rounded-[10px] bg-nevo-navy px-6 text-[14.5px] font-semibold text-nevo-cream transition-[filter] hover:brightness-93 xl:mt-[22px] xl:h-12 xl:px-[26px] xl:text-[15px]"
            >
              {`Back to ${firstName}'s profile`}
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-[-0.01em] text-nevo-near-black xl:text-[22px]">
                {`Recommend a lesson to ${firstName}`}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex size-8 cursor-pointer items-center justify-center rounded-[9px] text-nevo-near-black/50 transition-colors hover:bg-nevo-near-black/5 xl:size-[34px]"
              >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="xl:size-5">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <div className="mt-4 rounded-[12px] border-l-[3px] border-nevo-violet bg-nevo-violet/16 px-4 py-3.5 xl:mt-[18px] xl:px-[18px] xl:py-4">
              <span className="text-[11.5px] font-semibold tracking-[0.04em] text-nevo-navy uppercase xl:text-xs">
                Nevo suggests
              </span>
              <p className="mt-[7px] text-sm leading-[1.55] text-nevo-near-black/82 xl:mt-2 xl:text-[15px]">
                <span className="xl:hidden">{rec.suggestTablet}</span>
                <span className="hidden xl:inline">
                  {before}
                  <strong className="font-semibold text-nevo-near-black">
                    {rec.suggestStrong}
                  </strong>
                  {after}
                </span>
              </p>
            </div>

            <span className="mt-5 hidden text-[13px] font-semibold text-nevo-near-black/70 xl:block">
              Which lesson
            </span>
            <div className="mt-4 flex flex-col gap-[9px] xl:mt-2">
              {rec.options.map((o) => {
                const on = o.id === choice;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setChoice(o.id)}
                    aria-pressed={on}
                    className={cn(
                      // A constant 1px border keeps rows from shifting on select.
                      "flex w-full cursor-pointer items-center gap-[13px] rounded-[11px] border bg-nevo-cream-elevated px-4 py-3.5 text-left",
                      on
                        ? "border-transparent outline-2 -outline-offset-2 outline-nevo-navy"
                        : "border-nevo-near-black/8",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-[22px] shrink-0 items-center justify-center rounded-full",
                        on ? "bg-nevo-navy" : "border-2 border-nevo-near-black/24",
                      )}
                    >
                      {on && (
                        <span className="size-2.5 rounded-full bg-nevo-cream" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-semibold text-nevo-near-black xl:text-[15px]">
                        {optionTitle(o)}
                      </span>
                      <span className="mt-0.5 block text-[12.5px] text-nevo-near-black/58 xl:text-[13px]">
                        {o.meta}
                      </span>
                    </span>
                    {o.suggested && (
                      <span className="shrink-0 rounded-full bg-nevo-violet/24 px-2 py-[3px] text-[10.5px] font-semibold text-nevo-navy xl:px-[9px] xl:text-[11px]">
                        Suggested
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Desktop-only note field (the tablet frame omits it). */}
            <label className="mt-[18px] hidden text-[13px] font-semibold text-nevo-near-black/70 xl:block">
              {`Add a note for ${firstName} `}
              <span className="font-normal text-nevo-near-black/50">
                (optional)
              </span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={"Try this one - I think it'll click…"}
                className="mt-2 h-[76px] w-full resize-none rounded-[10px] border-[1.5px] border-nevo-near-black/16 bg-nevo-cream-elevated px-3.5 py-3 text-[14.5px] leading-[1.5] font-normal text-nevo-near-black transition-colors focus:border-nevo-navy focus:outline-none"
              />
            </label>

            <div className="mt-[18px] flex gap-3 xl:mt-5">
              <button
                type="button"
                onClick={onClose}
                className="flex h-12 flex-1 cursor-pointer items-center justify-center rounded-[10px] border-[1.5px] border-nevo-navy/30 text-[14.5px] font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6 xl:h-[50px] xl:text-[15px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setSent(true)}
                className="flex h-12 flex-[2] cursor-pointer items-center justify-center rounded-[10px] bg-nevo-navy text-[14.5px] font-semibold text-nevo-cream transition-[filter] hover:brightness-93 xl:h-[50px] xl:text-[15px]"
              >
                Recommend this lesson
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
