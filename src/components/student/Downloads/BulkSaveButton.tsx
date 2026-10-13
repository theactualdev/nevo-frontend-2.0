"use client";

import { useState } from "react";

/**
 * Downloads' one bulk control, for the signed-out walkthrough and a signed-in
 * child alike.
 *
 * FINISHED, NOT BLOCKED, SO NEVER GREY (D211, 13 Oct): "The last one is not
 * blocked, it is finished. It still stays pressable and still says so rather
 * than going grey." With everything saved it reads the ruling's "All lessons
 * saved for offline", and pressed it answers in place, in the ruling's one
 * line, inside the same card - never a modal.
 *
 * The line belongs to that one finished state. Once something is unsaved
 * again it goes, and it waits for another press before it comes back.
 */
export function BulkSaveButton({
  finished,
  label,
  onSave,
}: {
  /** Everything is already saved. */
  finished: boolean;
  /** What the control says while something is still unsaved. */
  label: string;
  onSave: () => void;
}) {
  const [explained, setExplained] = useState(false);
  // Adjusted while rendering, React's way of resetting state on a prop
  // change: leaving the finished state clears the line it was pressed for.
  const [wasFinished, setWasFinished] = useState(finished);
  if (wasFinished !== finished) {
    setWasFinished(finished);
    setExplained(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={finished ? () => setExplained(true) : onSave}
        className="mt-5 h-[52px] w-full cursor-pointer rounded-[12px] bg-nevo-navy text-[15px] font-medium text-nevo-cream transition-[filter] hover:brightness-110"
      >
        {finished ? "All lessons saved for offline" : label}
      </button>
      {finished && explained && (
        <p
          role="status"
          className="mt-3 rounded-[10px] bg-nevo-violet/14 px-[15px] py-[13px] text-[14px] leading-[1.5] text-nevo-near-black/80"
        >
          Everything&apos;s already saved.
        </p>
      )}
    </>
  );
}
