"use client";

import { useEffect, useRef } from "react";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import type { SessionRow } from "@/lib/mocks/teacherStudents";

/**
 * C08d Session Detail - a calm right-edge side panel over the student
 * profile: what happened in that one sitting, section by section, in plain
 * language. Where a section ran long it is marked "took her time" with a
 * violet clock - never flagged red, never scored.
 *
 * There are no timings, no modality chips, no affect or scaffold markers and
 * no percentages anywhere in this panel by design; the only per-section
 * signal is steady (navy check) vs took-her-time (violet clock).
 *
 * The scrim spans the whole viewport including the nav rail, exactly as the
 * frame draws it. Dismiss is Esc or scrim click (the frame gives the close X
 * only; the other two are ports of the drawer convention already in use).
 */

const CheckMark = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

const ClockMark = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export function SessionPanel({
  session,
  studentName,
  onClose,
  onRecommend,
  onMessage,
}: {
  session: SessionRow;
  studentName: string;
  onClose: () => void;
  onRecommend: () => void;
  /** Opens compose in Connect, addressed to this student. */
  onMessage: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const firstName = studentName.split(" ")[0];

  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef);
  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className="fixed inset-0 z-40 bg-nevo-near-black/28 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
      />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`${session.lesson} - session detail`}
        className="fixed inset-y-0 right-0 z-50 flex w-[440px] max-w-full flex-col bg-nevo-cream shadow-[-8px_0_32px_rgba(0,0,0,0.16)] motion-safe:animate-in motion-safe:slide-in-from-right motion-safe:duration-300 xl:w-[460px]"
      >
        {/* Header */}
        <div className="shrink-0 border-b border-nevo-near-black/8 px-[26px] pt-[22px] pb-4 xl:px-[30px] xl:pt-[26px] xl:pb-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-[0.04em] text-nevo-navy uppercase xl:text-[12.5px]">
              {/* One template expression - a JSX boundary drops the space. */}
              {`${session.dateLong} · Session`}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close session detail"
              className="flex size-8 cursor-pointer items-center justify-center rounded-[9px] text-nevo-near-black/50 transition-colors hover:bg-nevo-near-black/5 xl:size-[34px]"
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="xl:size-5">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <h2 className="mt-2.5 text-xl font-semibold tracking-[-0.01em] text-nevo-near-black xl:mt-3 xl:text-[22px]">
            {session.lesson}
          </h2>
          <span className="mt-1 block text-[13.5px] text-nevo-near-black/60 xl:text-sm">
            {session.sitting ? `${studentName} · ${session.sitting}` : studentName}
          </span>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-[26px] py-5 xl:px-[30px] xl:py-[22px]">
          <div className="rounded-[12px] border-l-[3px] border-nevo-violet bg-nevo-violet/16 px-4 py-3.5 xl:px-[18px] xl:py-4">
            <p className="text-sm leading-[1.55] text-nevo-near-black/82 xl:text-[14.5px]">
              {session.summary ? (
                <>
                  <span className="xl:hidden">{session.summary.tablet}</span>
                  <span className="hidden xl:inline">{session.summary.desktop}</span>
                </>
              ) : (
                session.note
              )}
            </p>
          </div>

          {session.steps && session.steps.length > 0 && (
            <>
              <h3 className="mt-5 text-[12.5px] font-semibold tracking-[0.04em] text-nevo-near-black/55 uppercase xl:mt-6 xl:text-[13px]">
                Section by section
              </h3>
              <div className="mt-3 flex flex-col gap-0.5 xl:mt-3.5">
                {session.steps.map((s) => (
                  <div
                    key={s.title}
                    className="flex gap-3 border-b border-nevo-near-black/7 py-3 xl:gap-3.5 xl:py-3.5"
                  >
                    <span
                      className={`mt-px flex size-6 shrink-0 items-center justify-center rounded-full text-nevo-navy ${
                        s.took ? "bg-nevo-violet/28" : "bg-nevo-navy/12"
                      }`}
                      /*
                       * Describes what the software observed, not what the
                       * child is. Frontend section 6 on both counts: no
                       * gendered pronoun (nothing stores one, and no field
                       * could make it right), and "Took her time" / "Steady"
                       * characterise a person where "spent longer on this
                       * section" reports a session.
                       */
                      title={
                        s.took
                          ? "Spent longer on this section"
                          : "Moved straight through"
                      }
                    >
                      {s.took ? ClockMark : CheckMark}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-semibold text-nevo-near-black xl:text-[14.5px]">
                        {s.title}
                      </span>
                      <p className="mt-[3px] text-[13px] leading-[1.45] text-nevo-near-black/66 xl:text-[13.5px]">
                        {s.note}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 gap-2.5 border-t border-nevo-near-black/8 px-[26px] py-4 xl:gap-3 xl:px-[30px] xl:py-[18px]">
          <button
            type="button"
            onClick={onRecommend}
            className="flex h-[46px] flex-1 cursor-pointer items-center justify-center rounded-[10px] bg-nevo-navy text-sm font-semibold text-nevo-cream transition-[filter] hover:brightness-93 xl:h-12 xl:text-[14.5px]"
          >
            Recommend a follow-up
          </button>
          <button
            type="button"
            onClick={onMessage}
            className="flex h-[46px] cursor-pointer items-center rounded-[10px] border-[1.5px] border-nevo-navy/30 px-4 text-sm font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6 xl:h-12 xl:px-[18px] xl:text-[14.5px]"
          >
            <span className="xl:hidden">Message</span>
            <span className="hidden xl:inline">{`Message ${firstName}`}</span>
          </button>
        </div>
      </div>
    </>
  );
}
