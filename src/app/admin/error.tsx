"use client";

import { useRouter } from "next/navigation";

/**
 * The admin console's error boundary.
 *
 * Without one, a render failure anywhere under /admin fell through to the
 * app-wide screen and dropped the admin out of the console - the rail, their
 * name, the way back - over one card that failed to draw. This sits inside the
 * admin layout, so the shell stays and only the page is replaced.
 *
 * The voice is the console's own: it owns the failure, never alarms, never
 * shows a stack. "Try again" re-fetches the page (`unstable_retry`, which the
 * Next 16 docs prefer to `reset` because it reloads the segment's data too);
 * "Back" goes to the console's door, which opens the admin's own home.
 */
export default function AdminError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const router = useRouter();

  return (
    <div className="flex flex-1 items-center justify-center px-8 py-12 text-center">
      <div className="flex max-w-[420px] flex-col items-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-nevo-violet/20 text-nevo-navy">
          <svg
            width="30"
            height="30"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8h.01M11 12h1v4h1" />
          </svg>
        </span>
        <h2 className="mt-6 text-[22px] font-semibold tracking-[-0.01em] text-nevo-near-black">
          This part of the console stalled
        </h2>
        <p className="mt-2.5 text-[15px] leading-[1.55] text-nevo-near-black/66">
          Nothing you did, and nothing is lost. Try it again, or head back to
          the start of your console.
        </p>
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="mt-7 h-[52px] w-full max-w-[300px] cursor-pointer rounded-[10px] bg-nevo-navy text-[15.5px] font-semibold text-nevo-cream transition-[filter,transform] hover:brightness-93 active:scale-[0.99]"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin")}
          className="mt-2 h-12 w-full max-w-[300px] cursor-pointer rounded-[10px] text-[15px] font-medium text-nevo-navy transition-[background-color,transform] hover:bg-nevo-navy/6 active:scale-[0.99]"
        >
          Back to my console
        </button>
      </div>
    </div>
  );
}
