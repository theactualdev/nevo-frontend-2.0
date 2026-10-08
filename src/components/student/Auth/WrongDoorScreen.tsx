import Link from "next/link";
import { Wordmark } from "@/components/shared/BrandMarks";

/** D128, frame `Nevo Wrong Door Frame` state `parent`, verbatim. */
export const WRONG_DOOR_PARENT_COPY = {
  heading: "This is the student door",
  line: "This is where students sign in. Parents have their own door.",
  go: "Go to the parent portal",
  back: "Back to sign in",
} as const;

/** D128, frame `Nevo Wrong Door Frame` state `unrecognised`, verbatim. */
export const WRONG_DOOR_UNRECOGNISED_COPY = {
  heading: "We couldn't sign you in",
  line: "We couldn't sign you in with those details.",
  retry: "Try again",
} as const;

/** The parent portal's own door (D03 Parent Sign-In). */
export const PARENT_DOOR_HREF = "/parent-sign-in";

const PRIMARY =
  "inline-flex h-[52px] w-full cursor-pointer items-center justify-center rounded-[10px] bg-nevo-navy text-base font-semibold text-nevo-cream transition-[filter] hover:brightness-108 sm:h-[54px]";
const SECONDARY =
  "h-[46px] w-full cursor-pointer bg-transparent text-[15px] font-medium text-nevo-near-black/60 transition-colors hover:text-nevo-navy";

/**
 * D128, the wrong-door lines (8 Oct): a parent at a student PIN door, or an
 * account whose role we do not recognise.
 *
 * "Both say the same thing in different registers: this is not your door, and
 * here is the one that is." The frame draws each as a STANDALONE SCREEN in an
 * adult register, at three sizes - not as a line in the PIN door's tinted box,
 * which stays 28c-8's for staff (`WrongDoorNote`).
 *
 * THE UNRECOGNISED ONE OFFERS NO OTHER DOOR. "Nothing about whether the
 * account exists, no suggestion to try a different door, because we do not
 * know which one would be theirs." Its one action goes back to the door it is
 * on.
 *
 * Both are reached only after a sign-in the server accepted and the door then
 * ended, so neither says the details were wrong or right.
 */
export function WrongDoorScreen({
  kind,
  onBack,
}: {
  kind: "parent" | "unrecognised";
  /** Back to this door's sign-in: "Back to sign in", or "Try again". */
  onBack: () => void;
}) {
  const parent = kind === "parent";
  const copy = parent ? WRONG_DOOR_PARENT_COPY : WRONG_DOOR_UNRECOGNISED_COPY;
  return (
    <main className="flex min-h-dvh w-full flex-col items-center justify-center bg-nevo-cream px-8 py-14 text-center text-nevo-near-black sm:px-12">
      <Wordmark size="form" className="mb-10" />
      <span
        aria-hidden="true"
        className="flex size-16 shrink-0 items-center justify-center rounded-full bg-nevo-violet/22 sm:size-[72px]"
      >
        {parent ? (
          // The frame's own door glyph.
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-[44%] text-nevo-navy"
          >
            <path d="M3 21h18" />
            <path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
            <path d="M14 12h.01" />
          </svg>
        ) : (
          <span className="block h-[3px] w-6 rounded-full bg-nevo-navy sm:w-[27px]" />
        )}
      </span>
      <h1 className="mt-6 text-[23px] leading-[1.25] font-semibold tracking-[-0.01em] sm:text-[27px]">
        {copy.heading}
      </h1>
      <p className="mt-3 max-w-[300px] text-[15.5px] leading-[1.5] text-pretty text-nevo-near-black/68 sm:max-w-[360px] sm:text-[16.5px]">
        {copy.line}
      </p>
      <div className="mt-8 flex w-full max-w-[320px] flex-col items-stretch gap-3">
        {parent ? (
          <>
            <Link href={PARENT_DOOR_HREF} className={PRIMARY}>
              {WRONG_DOOR_PARENT_COPY.go}
            </Link>
            <button type="button" onClick={onBack} className={SECONDARY}>
              {WRONG_DOOR_PARENT_COPY.back}
            </button>
          </>
        ) : (
          <button type="button" onClick={onBack} className={PRIMARY}>
            {WRONG_DOOR_UNRECOGNISED_COPY.retry}
          </button>
        )}
      </div>
    </main>
  );
}
