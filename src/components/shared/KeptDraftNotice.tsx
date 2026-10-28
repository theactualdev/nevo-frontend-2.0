"use client";

/**
 * "This is your unsaved work from before" (SCRUM-246, part 2: "The restored
 * draft is clearly the teacher's own unsaved work, not silently merged into a
 * saved version"). Shown where the work belongs, over nothing: the teacher
 * puts it back or lets it go, and until they do the screen shows what is
 * saved. No frame draws it, so the words are ours.
 */
export function KeptDraftNotice({
  onRestore,
  onDiscard,
  className,
}: {
  onRestore: () => void;
  onDiscard: () => void;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={`rounded-[12px] bg-nevo-violet/16 px-[17px] py-3.5 ${className ?? ""}`}
    >
      <p className="text-[13.5px] leading-[1.55] text-nevo-near-black/80 xl:text-[14px]">
        You were signed out before this was saved, so Nevo kept what you had.
        It isn&rsquo;t saved yet.
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={onRestore}
          className="inline-flex h-9 cursor-pointer items-center rounded-[10px] bg-nevo-navy px-[15px] text-[13px] font-semibold text-nevo-cream transition-[filter] hover:brightness-104"
        >
          Put it back
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="inline-flex h-9 cursor-pointer items-center rounded-[10px] border-[1.5px] border-nevo-navy/30 px-3.5 text-[13px] font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6"
        >
          Discard it
        </button>
      </div>
    </div>
  );
}
