/**
 * Rotate Prompt (`Nevo Rotate Prompt` frame) - the portrait-lock overlay (v1).
 * Flow reference 30: "Portrait only (v1) - calm rotate prompt if held landscape."
 *
 * Pure CSS: hidden by default, shown only when a coarse-pointer (touch) device
 * is held landscape - a desktop with a mouse never sees it, whatever its aspect.
 * Calm, no error framing; content resumes untouched underneath when rotated back.
 *
 * Covering the app is not the same as stopping it - see `RotateLock`, which
 * makes the page beneath inert so a child on a keyboard or switch cannot tab
 * into a lesson they have been asked to turn away from.
 */
export function RotatePrompt({
  ref,
  onContinue,
}: {
  ref?: React.Ref<HTMLDivElement>;
  /**
   * Stay in landscape. Absent before hydration, which is deliberate: the
   * prompt is CSS so it appears the instant the device turns, and an offer
   * that cannot yet be acted on is better than no prompt at all.
   */
  onContinue?: () => void;
}) {
  return (
    <div
      ref={ref}
      // Focused by `RotateLock` when the device turns, which is what actually
      // announces it - a `role="status"` region whose content never changes
      // (only its `display`) is not reliably announced by anything.
      tabIndex={-1}
      role="status"
      // `overflow-y-auto` and the vertical padding are the safety net: a
      // landscape phone can be 300px tall, where the icon and copy alone
      // pushed the way out 27px BELOW the fold - measured, not guessed. An
      // escape a child cannot see is not an escape, and it would be missing
      // on exactly the short mounted devices this exists for.
      className="fixed inset-0 z-[100] hidden flex-col items-center justify-center overflow-y-auto bg-nevo-cream px-10 py-8 text-center text-nevo-near-black md:px-14 [@media(orientation:landscape)_and_(pointer:coarse)]:flex"
    >
      {/* Shrinks where there is no room for it, so the words and the way out
          survive on a short landscape screen. */}
      <span className="flex size-[150px] shrink-0 items-center justify-center rounded-[28px] bg-nevo-cream-elevated shadow-[0_8px_32px_rgba(0,0,0,0.10)] md:size-[184px] [@media(max-height:460px)]:size-[84px] [@media(max-height:460px)]:rounded-[18px]">
        <svg
          width="92"
          height="92"
          viewBox="0 0 120 120"
          fill="none"
          role="img"
          aria-label="Rotate your device upright"
        >
          <g
            stroke="#9a9ccb"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 60 A40 40 0 0 1 52 22" />
            <path d="M52 22 l-11 0 M52 22 l0 11" />
          </g>
          <rect
            x="45"
            y="33"
            width="30"
            height="54"
            rx="7"
            stroke="#3b3f6e"
            strokeWidth="3"
            fill="#f7f1e6"
          />
          <circle cx="60" cy="39.5" r="1.6" fill="#3b3f6e" />
          <rect
            x="53"
            y="80"
            width="14"
            height="3"
            rx="1.5"
            fill="rgba(43,43,47,0.4)"
          />
        </svg>
      </span>
      <h2 className="mt-6 text-xl font-semibold tracking-[-0.01em] md:mt-7 md:text-2xl [@media(max-height:460px)]:mt-4 [@media(max-height:460px)]:text-lg">
        Turn your device upright
      </h2>
      <p className="mt-3 max-w-[280px] text-[15px] leading-[1.55] text-nevo-near-black/66 md:max-w-[360px] md:text-[17px]">
        Nevo is designed to stand tall. Rotate your device and we&apos;ll pick
        up right where you were.
      </p>
      {/*
        THE WAY THROUGH. A tablet on a wheelchair tray, a stand, or one with
        rotation locked does not turn, and this screen used to be the end of
        the road for that child - a prompt asking for the one thing they cannot
        do, with nothing else on it.

        Quiet rather than prominent: turning the tablet is still the better
        experience where turning it is possible, so this reads as the second
        option it is. It is a button and not a link because nothing navigates.
      */}
      {onContinue && (
        <button
          type="button"
          onClick={onContinue}
          className="mt-7 shrink-0 cursor-pointer rounded-[10px] px-4 py-2.5 text-[15px] font-medium text-nevo-violet underline decoration-nevo-violet/40 underline-offset-4 transition hover:decoration-nevo-violet md:text-base [@media(max-height:460px)]:mt-4"
        >
          My device doesn&apos;t turn
        </button>
      )}
    </div>
  );
}
