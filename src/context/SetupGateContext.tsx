"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
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
 * NOTHING HERE IS DERIVED, AND THE FIELD IT READS CHANGED ON 24 Sep.
 *
 * This branched on `stage !== "activated"`. Backend then found the read route
 * shared a helper with the writes, and that helper CREATED a record when it
 * found none - so every established school's first admin page load wrote a row
 * saying it was back at the uploading stage, and this gate held that school's
 * console read-only on the strength of its own page load.
 *
 * It reads `inOnboarding` now, which is what backend added and told us to
 * branch on: *"not on the stage and not on a status this route cannot
 * return."* The confirmation status is read the same way.
 *
 * The principle survives the correction and is worth keeping: the server
 * decides which step a school is on, *"rather than a console inferring it from
 * which arrays happen to be empty."* We were not inferring - we were reading
 * the wrong field, which is the quieter version of the same mistake.
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
     * ~~A 404 from onboarding is not a failure...~~ **THAT BRANCH IS GONE, and
     * the TODO it carried was answered in a way worth recording.** It asked
     * what this route returns for a long-active school. The answer: it never
     * 404'd, and the read was CREATING the record it claimed to be reading -
     * see `inOnboarding`. The guess was harmless only because the thing it
     * guarded against could not happen; the real defect was one layer under it.
     */
    const confirmation = emailConfirmationApi
      .read()
      .then((s) => s)
      .catch(() => null);

    const onboarding = onboardingApi
      .get()
      .then((s) => ({ inOnboarding: s.inOnboarding === true }))
      .catch(() => null);

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
      /*
       * `inOnboarding`, NOT THE STAGE - and the difference was a live defect.
       *
       * This read `stage !== "activated"`. Backend then found that the read
       * route shared a helper with the writes, and that helper CREATED a record
       * when it found none: every established school's first admin page load
       * wrote a row saying it was back at the uploading stage. Our gate read
       * that and held the whole console read-only - **on the strength of its
       * own page load**.
       *
       * The read only looks now, and backend's instruction with the new
       * boolean was exact: branch on it, *"not on the stage and not on a status
       * this route cannot return."*
       */
      const notActive = onb?.inOnboarding === true;

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
