import { doorForRole, knownRole } from "@/lib/auth/consoleDoor";
import { USER_ROLES } from "@/lib/constants/permissions";

/** 28c-8 (D68): a staff account on the student door, verbatim. */
export const WRONG_DOOR_STAFF_COPY =
  "This sign-in is for students. Staff sign in with an email address.";

/**
 * Whose account came through a student PIN door, when it was not a student's.
 *
 *  - `staff`: a teacher or an admin. 28c-8's line, in the door's tinted box.
 *  - `parent`: a parent or guardian. D128's screen, with their own door.
 *  - `unrecognised`: a role this build has never heard of. D128's screen,
 *    which says nothing about whether the account exists and offers no other
 *    door, "because we do not know which one would be theirs".
 */
export type StudentDoorRefusal = "staff" | "parent" | "unrecognised";

/**
 * Which of the three an account is, from the role its sign-in returned.
 *
 * The parent is told apart HERE rather than in `doorForRole`, which answers
 * null for them on purpose and which the admin and teacher doors share. Only
 * the student door draws a parent anything of their own (D128).
 */
export function studentDoorRefusal(
  role: string | null | undefined,
): StudentDoorRefusal {
  const door = doorForRole(knownRole(role));
  if (door === "admin" || door === "teacher") return "staff";
  if (role === USER_ROLES.PARENT_GUARDIAN) return "parent";
  return "unrecognised";
}

/**
 * What the student doors say, in the tinted box, to a staff account.
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
 *
 * A PARENT, OR AN ACCOUNT WE DO NOT RECOGNISE, IS NOT A LINE HERE. They read
 * "Those details are right, but this account can't be used to sign in here",
 * which no frame drew and which told whoever typed them that the account
 * exists. D128 (8 Oct) draws each a screen of its own: `WrongDoorScreen`.
 */
export function WrongDoorNote() {
  return <>{WRONG_DOOR_STAFF_COPY}</>;
}
