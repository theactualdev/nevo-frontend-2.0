"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { consentsApi, processingWithdrawn } from "@/lib/api/consents";
import type { ConsentGate } from "@/lib/auth/consentAnswer";
import { getSession, onSessionChange } from "@/lib/auth/session";

export {
  consentAnswer,
  type ConsentAnswer,
  type ConsentGate,
} from "@/lib/auth/consentAnswer";

const ASKING: ConsentGate = { withdrawn: false, known: false, unreadable: false };
const NOBODY: ConsentGate = { withdrawn: false, known: false, unreadable: true };

/** When a failed read goes again, with `retry`: then every minute. */
const RETRY_MS = [5_000, 15_000, 30_000, 60_000];

/** Who is signed in: an id, null for nobody, undefined before hydration. */
const whoNow = (): string | null => getSession()?.userId ?? null;
const whoOnServer = (): string | null | undefined => undefined;

/**
 * Whether this child's guardian has withdrawn consent for processing - and,
 * since 19 Oct, whether that could be read at all.
 *
 * `GET /api/v1/students/me/consent-gate` had been deployed for some time while
 * `consentsApi.myConsentGate` had **zero callers**, so a child whose parent
 * withdrew consent kept being profiled. Nothing in the student app ever
 * asked.
 *
 * That is a compliance failure before it is a bug. Withdrawal is the one
 * consent answer the frontend is entitled to act on, and `processingWithdrawn`
 * is where that ruling is written down.
 *
 * `ProfilingFlow` (the onboarding baseline) and `WarmUpRun` (the daily
 * warm-up) read it before they capture anything, and `useSignals` ends a
 * stream on a withdrawal.
 *
 * NOT KNOWING IS NOT PERMISSION (19 Oct browser-storage audit; rule 5). This
 * said withdrawn or not, and a read that failed came back "not withdrawn" -
 * so the baseline's raw capture, taps and their coordinates, went ahead on a
 * device that could not say whether it was allowed. It now says which of the
 * three it is: answered (`known`, and `withdrawn` or not), still asking, or
 * settled with no answer (`unreadable`: nobody signed in to ask for, or the
 * read failed). A capture holds until the answer is in and allows it
 * (`consentAnswer`, in `lib/auth/consentAnswer`).
 *
 * Still only a withdrawal is a refusal. `not_sent` and `pending` are not
 * (SCRUM-121), and a failed read is not one either: it holds a capture and
 * does not stop a child's lessons. What it does stop is the lesson's event
 * stream, which fails closed on it (SCRUM-257, `useSignals`).
 *
 * `retry` is for a reader that stays on screen through a failed read and has
 * no Try again of its own - the event stream, which no child sees. The read
 * goes again after `RETRY_MS`, and at once when the device comes back online,
 * until one answers. It stays `unreadable` meanwhile, never back to asking.
 */
export function useConsentGate({
  retry = false,
}: { retry?: boolean } = {}): ConsentGate {
  /*
   * WHO, not merely whether anyone is: an answer is about one child, and a
   * tablet changes hands. An answer read for one account is never shown for
   * the next - that is still asking until its own read comes back.
   */
  const who = useSyncExternalStore<string | null | undefined>(
    onSessionChange,
    whoNow,
    whoOnServer,
  );
  const [read, setRead] = useState<{ who: string; gate: ConsentGate } | null>(
    null,
  );

  useEffect(() => {
    // A signed-out visitor is on the designed walkthrough, or a child with no
    // account yet. There is nobody to read for, and the endpoint is
    // Bearer-only.
    if (!who) return;
    let cancelled = false;
    /** The next read after a failed one, while one is waiting. */
    let again: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    const ask = () => {
      clearTimeout(again);
      again = undefined;
      void consentsApi.myConsentGate().then(
        (gate) => {
          if (cancelled) return;
          const withdrawn = processingWithdrawn(gate);
          setRead({ who, gate: { withdrawn, known: true, unreadable: false } });
        },
        () => {
          if (cancelled) return;
          // Not a withdrawal. Not permission either: see above.
          setRead((was) =>
            was?.who === who && was.gate === NOBODY ? was : { who, gate: NOBODY },
          );
          if (!retry) return;
          again = setTimeout(
            ask,
            RETRY_MS[Math.min(failures, RETRY_MS.length - 1)],
          );
          failures += 1;
        },
      );
    };
    // Back online is the likeliest moment a failed read will answer.
    const onOnline = () => {
      if (again !== undefined) ask();
    };
    if (retry) window.addEventListener("online", onOnline);
    ask();
    return () => {
      cancelled = true;
      clearTimeout(again);
      window.removeEventListener("online", onOnline);
    };
  }, [who, retry]);

  // Before hydration nothing is known about the session, so nothing is
  // settled: still asking.
  if (who === undefined) return ASKING;
  if (who === null) return NOBODY;
  return read?.who === who ? read.gate : ASKING;
}
