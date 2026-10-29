"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { permissionsApi } from "@/lib/api/permissions";
import { getSession } from "@/lib/auth/session";
import { isAdminRole, PERMISSION_SCOPES } from "@/lib/constants/permissions";
import { useHydrated } from "./useHydrated";

/**
 * WHO THE TEACHER CONSOLE IS FOR (T2/L9; Lydia, 14 Oct).
 *
 * A teacher, and an administrator who holds the Teacher permission - and
 * that one sees only the classes they are given, because "whole-school
 * visibility belongs on the admin side". Backend 6b5d496 lets such an admin
 * be given a class and scopes the console's reads to it.
 *
 * The role cookie cannot say which admins hold the permission, so `proxy.ts`
 * lets every admin through to `/teacher` and this decides, from
 * `GET /api/v1/permissions/me`, before any of the console renders. Without
 * the Teacher scope they go back to the admin console. A teacher is never
 * held: nothing is asked, and nothing waits.
 *
 * - `allowed`: render the console.
 * - `checking`: an admin, and the answer is not back.
 * - `leaving`: an admin without the scope, on the way back.
 * - `failed`: the check could not run; it says so rather than guessing.
 */
export type TeacherConsoleAccess = "allowed" | "checking" | "leaving" | "failed";

/** Where an admin without the Teacher scope is sent back to. */
export const ADMIN_CONSOLE_HOME = "/admin";

export function useTeacherConsoleAccess(): TeacherConsoleAccess {
  const hydrated = useHydrated();
  const router = useRouter();
  // Decided on the client only: the server cannot see the session, and a
  // server render that held a teacher's console would hold everyone's.
  const admin = hydrated && isAdminRole(getSession()?.role);
  const [answer, setAnswer] = useState<"yes" | "no" | "failed" | null>(null);

  useEffect(() => {
    if (!admin) return;
    let current = true;
    permissionsApi
      .me()
      .then((me) => {
        if (!current) return;
        const holds = me.scopes.includes(PERMISSION_SCOPES.TEACHER);
        setAnswer(holds ? "yes" : "no");
        if (!holds) router.replace(ADMIN_CONSOLE_HOME);
      })
      .catch(() => {
        if (current) setAnswer("failed");
      });
    return () => {
      current = false;
    };
  }, [admin, router]);

  if (!admin) return "allowed";
  if (answer === "yes") return "allowed";
  if (answer === "no") return "leaving";
  if (answer === "failed") return "failed";
  return "checking";
}
