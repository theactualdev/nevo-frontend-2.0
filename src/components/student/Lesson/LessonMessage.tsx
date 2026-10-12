"use client";

/**
 * The calm, child-worded stand-in for a screen that cannot be drawn.
 *
 * Lifted out of `LessonRoute` so the after-lesson screens share it rather than
 * copying it. That matters beyond tidiness: a child who cannot open their
 * summary should meet the same words as a child who cannot open the lesson, and
 * two copies drift.
 *
 * It exists because the app's own `not-found` page is written for a developer -
 * "This page doesn't exist", when the child tapped a lesson, not a page - and
 * its only button calls `router.back()`, which on a reload or a QR arrival
 * leaves the site entirely.
 */
export function LessonMessage({
  title,
  body,
  actionLabel,
  onAction,
  onBack,
}: {
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
  onBack?: () => void;
}) {
  return (
    <div className="flex min-h-[calc(100dvh/var(--nevo-text-zoom,1))] flex-col items-center justify-center bg-nevo-cream px-6 text-nevo-near-black">
      <div className="w-full max-w-[420px] rounded-[16px] bg-nevo-cream-elevated p-[26px] shadow-elevation-1">
        <h1 className="text-[20px] font-semibold tracking-[-0.01em]">
          {title}
        </h1>
        <p className="mt-2.5 text-[15.5px] leading-[1.55] text-nevo-near-black/70">
          {body}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onAction}
            className="h-12 cursor-pointer rounded-[10px] bg-nevo-navy px-6 text-[15px] font-semibold text-nevo-cream transition-[filter,transform] hover:brightness-109 active:scale-[0.985]"
          >
            {actionLabel}
          </button>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="h-12 cursor-pointer rounded-[10px] px-5 text-[15px] font-medium text-nevo-navy transition-colors hover:bg-nevo-near-black/[0.05]"
            >
              Back to my lessons
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
