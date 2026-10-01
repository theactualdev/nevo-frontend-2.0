import Link from "next/link";
import {
  DOOR_HREF,
  DOOR_LABEL,
  type ConsoleDoor,
} from "@/lib/auth/consoleDoor";

/**
 * What the student doors say to an account that is not a student's.
 *
 * The PIN door used to cast `session.role` straight into the session, so a
 * non-student account that got through was stored, shown "Welcome back", and
 * pushed at the student app - where `proxy.ts` bounced it back to sign-in. The
 * admin and teacher doors stopped doing that on 23 Sep with `roleBelongsAt`;
 * this is the student lane catching up, in the same words those doors use.
 *
 * It is only ever read by someone who is NOT a child: the login succeeded, and
 * the account says so. Telling them their own role is not a disclosure - they
 * have just proved the account is theirs.
 */
export function WrongDoorNote({ door }: { door: ConsoleDoor | null }) {
  if (!door || door === "student") {
    // A role no door serves - a parent account, or one this build has never
    // heard of. There is nowhere to send them, so say that plainly.
    return (
      <>
        Those details are right, but this account can&rsquo;t be used to sign
        in here. Check with whoever set up your Nevo account.
      </>
    );
  }
  return (
    <>
      Those details are right, but this is the student sign-in. Your account is
      a {DOOR_LABEL[door]} account -{" "}
      <Link
        href={DOOR_HREF[door]}
        className="cursor-pointer font-semibold text-nevo-navy underline underline-offset-2"
      >
        sign in as a {DOOR_LABEL[door]}
      </Link>
      .
    </>
  );
}
