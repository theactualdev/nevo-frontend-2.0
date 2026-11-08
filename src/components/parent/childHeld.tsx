/*
 * D01e, A CHILD HELD AFTER CONSENT - LYDIA'S WORDS (SCRUM-321, 7 Nov).
 *
 * The frame said the school was getting the class ready, that there was
 * nothing more the parent needed to do, and that the link stays active. None
 * of that is true:
 *  - the server has no "getting the class ready" state; the cause is dropped;
 *  - a held date-of-birth check clears only once the school has re-checked AND
 *    the parent has confirmed again (`apply_check`, "once held, even agreeing
 *    corrected dates require both adults' fresh checks") - from their account;
 *  - the link works for 30 days from when it was sent.
 *
 * "Held" is the server's `ageCheck: "mismatch"` - the only state that stops a
 * child (`age_check_blocks`).
 */

export const LINK_LIFETIME_LINE = "This link works for 30 days from the day it was sent.";

/** What's left for the parent, on its own (SCRUM-321). */
export const CONFIRM_ONCE_MORE = "You’ll need to confirm once more, signed in to your account.";

export function isHeld(ageCheck: string | null | undefined): boolean {
  return ageCheck === "mismatch";
}

/** "{child} can't start yet." and what's left for the parent. */
export function ChildHeldLines({ child, className }: { child: string; className: string }) {
  return (
    <>
      <p className={className}>{child} can&rsquo;t start yet.</p>
      <p className={className}>{CONFIRM_ONCE_MORE}</p>
    </>
  );
}
