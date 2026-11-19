/**
 * BELOW 768, THE ADMIN CONSOLE SAYS PLAINLY THAT IT ISN'T SUPPORTED (Lydia,
 * 16 Nov, SCRUM-347): "Admin's minimum is 768; below that it says plainly that
 * it isn't supported."
 *
 * The admin set has no phone frame at all, so unlike the teacher console
 * (C19's "needs a bigger screen" on the pages without a phone layout) this
 * stands in for EVERY admin screen. It replaces the console rather than
 * sitting over it, and it offers no route onward - there is no admin page a
 * phone can use.
 *
 * WORDS ARE A DRAFT, from design's own teacher state (C19 D1: "This page
 * needs a bigger screen" / "Open Nevo on a tablet or computer to use this
 * part of the console."), adapted to a whole console. Lydia gave none; the hub
 * is asking her. Change them here when she does.
 */
export const TOO_NARROW_HEADING = "The admin console needs a bigger screen";
export const TOO_NARROW_BODY =
  "It isn't supported on a phone. Open Nevo on a tablet or computer to use it.";

export function TooNarrow() {
  return (
    <div
      data-admin-too-narrow
      className="flex min-h-dvh flex-col items-center justify-center bg-nevo-cream px-[34px] py-10 text-center md:hidden"
    >
      <span className="flex size-[66px] shrink-0 items-center justify-center rounded-[12px] bg-nevo-cream-elevated text-nevo-navy shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <rect x="2" y="4" width="20" height="13" rx="2" />
          <path d="M8 21h8" />
          <path d="M12 17v4" />
        </svg>
      </span>
      <h1 className="mt-6 text-[22px] font-semibold tracking-[-0.015em] text-nevo-near-black">
        {TOO_NARROW_HEADING}
      </h1>
      <p className="mt-[11px] max-w-[34ch] text-[15px] leading-[1.55] text-nevo-near-black/66">
        {TOO_NARROW_BODY}
      </p>
    </div>
  );
}
