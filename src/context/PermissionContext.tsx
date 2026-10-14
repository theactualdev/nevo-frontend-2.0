"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { permissionsApi } from "@/lib/api";
import type { AdminAccessLevel } from "@/lib/api/permissions";
import { getToken } from "@/lib/auth/session";
import { ALL_PERMISSION_SCOPES, type PermissionScope } from "@/lib/constants";

/**
 * Current admin's permission scopes - Admin Layer only (FE Architecture §8).
 *
 * WHY THIS RE-ASKS. The provider used to run its effect once, on `[]`, and
 * swallow every failure into an empty scope list. Two things a real admin hits
 * on day one came out of that:
 *
 * 1. The onboarding wizard mounts the admin layout BEFORE a session exists, so
 *    the first run finds no token, resolves with no scopes, and never asks
 *    again. When the founding admin finishes and clicks through to their
 *    dashboard - a soft navigation, same provider still mounted - the rail
 *    shows a single row and the words "No access yet". Their first sight of
 *    the console says they do not have one.
 * 2. A 500, or the API proxy's 60-second cold-start 502, produced exactly the
 *    same state: an empty rail, no error, no retry, and only a full reload
 *    could recover.
 *
 * So the distinction this file now keeps is between an ANSWER and an ABSENCE.
 * `ready` means the backend told us the scopes - including telling us there
 * are none, which is a real answer and is left alone. `skipped` and `failed`
 * are not answers, and are re-asked.
 *
 * WHEN IT RE-ASKS. On the pathname changing, which is what a soft navigation
 * inside the admin layout gives us, and on `refresh()` for an explicit retry.
 * Same-tab sign-in cannot be observed any other way: the token lives in
 * localStorage and the `storage` event only fires in OTHER tabs, so the
 * session store has nothing to notify us with. Re-asking is cheap and guarded
 * - once a real answer is in, navigation does not refetch.
 */
export type PermissionStatus = "loading" | "ready" | "failed" | "skipped";

export interface PermissionContextValue {
  scopes: PermissionScope[];
  /** Senior or standard; null until known, and for anyone not an admin. */
  adminAccessLevel?: AdminAccessLevel | null;
  /** True once `permissions/me` has answered (or been skipped). */
  resolved: boolean;
  /** Why the scope list looks the way it does. */
  status: PermissionStatus;
  /** Ask again - for a retry control, or after signing in. */
  refresh: () => void;
}

export const PermissionContext = createContext<PermissionContextValue | undefined>(
  undefined,
);

export function PermissionProvider({ children }: { children: ReactNode }) {
  const [scopes, setScopes] = useState<PermissionScope[]>([]);
  const [adminAccessLevel, setAdminAccessLevel] = useState<AdminAccessLevel | null>(null);
  const [status, setStatus] = useState<PermissionStatus>("loading");
  const [nonce, setNonce] = useState(0);
  const pathname = usePathname();
  /**
   * Whether the backend has actually answered.
   *
   * A REF, not the `status` state, and that is the whole point: `status` in the
   * dependency array made the guard double as a trigger - settling to "failed"
   * changed a dep, which re-ran the effect and fired a second request for every
   * failure. The ref is read by the effect without waking it.
   */
  const answered = useRef(false);

  const refresh = useCallback(() => {
    // Clearing the ref is what makes a retry actually retry; without it the
    // guard above would swallow the attempt.
    answered.current = false;
    setStatus("loading");
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const settle = (next: PermissionStatus) => {
      if (!cancelled) setStatus(next);
    };

    // A real answer is final. Navigating around the console must not re-ask,
    // and an admin who genuinely holds no scopes is not asked about again.
    if (answered.current) return;

    // No session yet - the wizard mounts this layout before login completes.
    // Resolution is scheduled, never set synchronously in the effect body
    // (react-hooks/set-state-in-effect).
    if (!getToken()) {
      const t = setTimeout(() => settle("skipped"), 0);
      return () => {
        cancelled = true;
        clearTimeout(t);
      };
    }

    permissionsApi
      .me()
      .then((me) => {
        if (cancelled) return;
        // Keep only scope strings the frontend knows; the constants mirror
        // the backend enum, so this only drops future additions.
        setScopes(
          me.scopes.filter((s): s is PermissionScope =>
            (ALL_PERMISSION_SCOPES as string[]).includes(s),
          ),
        );
        setAdminAccessLevel(me.adminAccessLevel ?? null);
        answered.current = true;
        settle("ready");
      })
      .catch(() => {
        // An unreachable backend is NOT "this admin has no scopes". Scope
        // checks still fail closed, but the state says why, so the rail can
        // offer a retry instead of asserting they have no access.
        settle("failed");
      });

    return () => {
      cancelled = true;
    };
    // `pathname` is the only same-tab signal that a session may have appeared;
    // the `answered` ref above keeps that from costing a request once the
    // backend has told us something real.
  }, [pathname, nonce]);

  const value = useMemo<PermissionContextValue>(
    () => ({ scopes, adminAccessLevel, resolved: status !== "loading", status, refresh }),
    [scopes, adminAccessLevel, status, refresh],
  );
  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
}
