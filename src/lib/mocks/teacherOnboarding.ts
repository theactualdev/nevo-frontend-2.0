/**
 * Teacher onboarding fixture (C01). The invite arrives pre-filled from the
 * school's setup; the teacher only confirms and adds a light profile. The
 * name lines up with the console fixture teacher (Adunni "Ms." Adeyemi) and
 * the class list is the real TEACHER_CLASSES fixture, exactly as the frame's
 * own mock data has it.
 *
 * IT HAS BEEN REPLACED (verified 11 Sep 2026). `SetPasswordForm.tsx:224`
 * calls `invitesApi.acceptJoin(token, { password })`, so the simulated verify
 * round-trip this comment used to describe is gone, and the two timing
 * constants that drove it went with it - nothing in `src/` referenced them.
 *
 * `TEACHER_INVITE` IS GONE (16 Sep). Its last reader was the SSO callback's
 * "Signing you in through {school}", which meant a teacher of any school was
 * told they were being signed in through the fixture's school. The callback
 * now says "your school", so nothing consumes this fixture.
 *
 * It is deleted rather than left unused on purpose: a fixture identity sitting
 * next to an auth screen is how the last two of these happened. The activate
 * page had already refused it for the same reason - see the comment at
 * `app/auth/teacher/activate/page.tsx:13`.
 *
 * If a screen ever needs the real school name, it comes from `users/me` after
 * sign-in, or from a pre-auth lookup that does not exist yet. Not from here.
 */


const COUNT_WORDS = [
  "No",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
];

/** "Three classes are set up and waiting for you." - derived, not hardcoded. */
export function classCountLine(n: number): string {
  const word = COUNT_WORDS[n] ?? String(n);
  return n === 1
    ? "One class is set up and waiting for you."
    : `${word} classes are set up and waiting for you.`;
}
