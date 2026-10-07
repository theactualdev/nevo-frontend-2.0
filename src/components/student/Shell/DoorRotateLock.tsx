"use client";

import { usePathname } from "next/navigation";
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
 */
export function DoorRotateLock({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (!isStudentDoor(pathname)) return <>{children}</>;
  return <RotateLock className="contents">{children}</RotateLock>;
}
