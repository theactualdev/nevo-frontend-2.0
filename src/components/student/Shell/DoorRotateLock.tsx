"use client";

import { usePathname } from "next/navigation";
import { Letterbox } from "./Letterbox";
import { RotateLock } from "./RotateLock";

/**
 * The child's doors under `/auth`: the picker and PIN unlock (00, 28c), the
 * full sign-in (00c), Forgot PIN (00a), the SSO callback (00b) and the two
 * session-end screens a child is sent to (28, 28a). The teacher's and the
 * admin's doors live under their own prefixes and are not here.
 */
const STUDENT_DOORS = [
  "/auth/login",
  "/auth/sign-in",
  "/auth/forgot-pin",
  "/auth/sso-callback",
  "/auth/session-expired",
  "/auth/session-ended",
];

export function isStudentDoor(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const path = pathname.replace(/\/+$/, "");
  return STUDENT_DOORS.some((door) => path === door);
}

/**
 * The doors that are letterboxed at desktop width (D207): every screen on
 * them is drawn on the pre-login tablet canvas. The picker and PIN door with
 * their states, 00c, Forgot PIN and the SSO callback.
 *
 * NOT the session-end doors. Their own screens (28, 28a) are drawn on the
 * signed-in canvas with a desktop composition; the two of their states that
 * are the door's, closed and on pause, are letterboxed by the page.
 */
const LETTERBOXED_DOORS = [
  "/auth/login",
  "/auth/sign-in",
  "/auth/forgot-pin",
  "/auth/sso-callback",
];

export function isLetterboxedDoor(
  pathname: string | null | undefined,
): boolean {
  if (!pathname) return false;
  const path = pathname.replace(/\/+$/, "");
  return LETTERBOXED_DOORS.includes(path);
}

/**
 * The rotate prompt over the sign-in doors too (D65, 6 Oct): "The door and the
 * app behave the same way, and a child turning a tablet at sign-in should not
 * meet different behaviour from the one they meet a minute later."
 *
 * The doors were left out by where they live rather than by a decision: the
 * prompt is mounted by the student layout, and the doors sit under `/auth`,
 * whose layout also serves the teacher's and the admin's doors. So the auth
 * layout mounts this, and it holds only a child's door.
 *
 * The prompt's own way through - "continue sideways", remembered per device -
 * comes with it, so a tray-mounted tablet that cannot turn is never walled
 * out of signing in, which was the 4 Oct answer's worry.
 *
 * AND THE DOOR IS MARKED AS THE STUDENT CONSOLE'S (`data-nevo-console`), as
 * `StudentShell` marks the app, so a rule scoped to the student console - the
 * focus ring - reaches the picker, the PIN, 00c, Forgot PIN and the session
 * ends too, which sit outside the shell. Here because this is the one place
 * that already knows which doors are a child's; a staff door is never marked.
 * `contents`, like the lock's own wrapper, so it draws no box.
 *
 * AND THE TABLET FRAME AT DESKTOP WIDTH (D207), for the same reason: this is
 * where a child's door is known. Inside the lock, so the rotate prompt still
 * covers the whole screen rather than the frame.
 */
export function DoorRotateLock({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (!isStudentDoor(pathname)) return <>{children}</>;
  return (
    <div data-nevo-console="student" className="contents">
      <RotateLock className="contents">
        {isLetterboxedDoor(pathname) ? (
          <Letterbox>{children}</Letterbox>
        ) : (
          children
        )}
      </RotateLock>
    </div>
  );
}
