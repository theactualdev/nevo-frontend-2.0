"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ApiError } from "@/lib/api/client";
import { emailConfirmationApi } from "@/lib/api/emailConfirmation";
import { onboardingApi } from "@/lib/api/onboarding";

/**
 * WHY THE ADMIN CONSOLE IS READ-ONLY, when it is.
 *
 * Two frames arrive at the same behaviour by different routes, which is the
 * whole reason this is one mechanism rather than two:
 *
 *  - **D01b AC-05** - the address is not confirmed yet. *"You can look around,
 *    but changes are paused until you confirm."*
 *  - **D24 OB-00** - the school has not been paid for. *"You can look around
 *    the rest of your console - Classes, Teachers, Reports, Billing. You can't
 *    make any changes until Brightgate is active."*
 *
 * Same read-only console, different sentence. Building it twice would have
 * produced two, and they would have disagreed the first time either changed.
 *
 * ============================================================================
 * THIS IS AN EXPLANATION LAYER, NOT A SECURITY BOUNDARY.
 *
 * The server enforces. Every write this pauses would be refused anyway, and a
 * console that could be talked out of pausing cannot let anybody do anything
 * they could not already do. That matters because it decides how to fail:
 *
 *   **An unresolved gate pauses nothing.** If either read fails, controls keep
 *   the behaviour they have. Failing closed would turn a transient 500 into a
 *   whole console telling a school it is not active - the most alarming
 *   sentence available, on the least evidence.
 *
 * It is the same position `PermissionContext` takes two files away: *"An
 * unreachable backend is NOT 'this admin has no scopes'."*
 *
 * ============================================================================
 * NOTHING HERE IS DERIVED. `stage` is read, never composed out of counts;
 * backend's own schema note says the stage is typed *"so the server decides
 * which step a school is on, rather than a console inferring it from which
 * arrays happen to be empty."* The confirmation status is read the same way.
 */

/** Why writes are paused. Ordered: the one a school can act on first wins. */
export type SetupPause = "email_unconfirmed" | "not_active";

export interface SetupGateValue {
  /** True only when we KNOW writes are paused. Never true on a failed read. */
  writesPaused: boolean;
  /** Which reason, for the sentence beside a paused control. */
  pause: SetupPause | null;
  /** False while either read is outstanding, or after one failed. */
  resolved: boolean;
  /** The address the confirmation link went to, when the server named one. */
  email: string | null;
  refresh: () => void;
}

export const SetupGateContext = createContext<SetupGateValue | undefined>(
  undefined,
);

/**
 * The sentence a paused control shows, in each frame's own words.
 *
 * A function rather than a map on the control, so the two screens cannot drift
 * into describing the same pause differently.
 */
export function pauseNote(pause: SetupPause): string {
  return pause === "email_unconfirmed"
    ? "Paused until your email is confirmed."
    : "Paused until your school is active.";
}

export function SetupGateProvider({ children }: { children: ReactNode }) {
  const [pause, setPause] = useState<SetupPause | null>(null);
  const [resolved, setResolved] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let live = true;

    /*
     * Both reads run together, and EITHER is enough to answer with. Knowing
     * the address is unconfirmed while the stage read failed still pauses;
     * knowing neither does not.
     *
     * `null` means the read did not land. It is deliberately distinct from
     * every real answer either endpoint can give, so nothing downstream can
     * mistake a failure for a state.
     *
     * A 404 from onboarding is NOT a failure: it is a school with no
     * onboarding record, which is not a school mid-setup. Treating it as "not
     * active" would put every school predating the flow into read-only.
     * TODO(api): confirm what `GET /onboarding` returns for a long-active
     * school. If it is a 200 with `stage: "activated"`, `missing` is dead
     * weight and should go.
     */
    const confirmation = emailConfirmationApi
      .read()
      .then((s) => s)
      .catch(() => null);

    const onboarding = onboardingApi
      .get()
      .then((s) => ({ stage: s.stage }))
      .catch((err: unknown) =>
        err instanceof ApiError && err.status === 404
          ? { stage: "activated" as const, missing: true }
          : null,
      );

    Promise.all([confirmation, onboarding]).then(([conf, onb]) => {
      if (!live) return;

      if (conf) setEmail(conf.email ?? null);

      // Neither landed: say nothing rather than guess in either direction.
      if (!conf && !onb) {
        setResolved(false);
        setPause(null);
        return;
      }

      const unconfirmed =
        !!conf && conf.status !== "confirmed" && conf.status !== "already_confirmed";
      const notActive = !!onb && onb.stage !== "activated";

      /*
       * EMAIL FIRST WHEN BOTH ARE TRUE. It is the one the person in front of
       * the screen can do something about in the next thirty seconds; "your
       * school isn't active yet" is true but not actionable until the address
       * is confirmed anyway. D01b AC-05 makes the same choice.
       */
      setPause(unconfirmed ? "email_unconfirmed" : notActive ? "not_active" : null);
      setResolved(true);
    });

    return () => {
      live = false;
    };
  }, [nonce]);

  const value = useMemo<SetupGateValue>(
    () => ({
      writesPaused: resolved && pause !== null,
      pause: resolved ? pause : null,
      resolved,
      email,
      refresh,
    }),
    [resolved, pause, email, refresh],
  );

  return (
    <SetupGateContext.Provider value={value}>
      {children}
    </SetupGateContext.Provider>
  );
}
