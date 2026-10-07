import type { ConsoleDoor } from "@/lib/auth/consoleDoor";

/** 28c-8 (D68): a staff account on the student door, verbatim. */
export const WRONG_DOOR_STAFF_COPY =
  "This sign-in is for students. Staff sign in with an email address.";

/**
 * What the student doors say to an account that is not a student's.
 *
 * The PIN door used to cast `session.role` straight into the session, so a
 * non-student account that got through was stored, shown "Welcome back", and
 * pushed at the student app - where `proxy.ts` bounced it back to sign-in. The
 * admin and teacher doors stopped doing that on 23 Sep with `roleBelongsAt`;
 * this is the student lane catching up.
 *
 * A TEACHER OR AN ADMIN READS 28c-8's LINE, with no link. It used to name
 * their role and link their own door; the frame draws one line for both, and
 * no link.
 */
export function WrongDoorNote({ door }: { door: ConsoleDoor | null }) {
  if (!door || door === "student") {
    // A role no door serves - a parent account, or one this build has never
    // heard of. There is nowhere to send them, so say that plainly. NOT DRAWN:
    // 28c draws no line for this one (D128), so it keeps the words it had.
    return (
      <>
        Those details are right, but this account can&rsquo;t be used to sign
        in here. Check with whoever set up your Nevo account.
      </>
    );
  }
  return <>{WRONG_DOOR_STAFF_COPY}</>;
}
