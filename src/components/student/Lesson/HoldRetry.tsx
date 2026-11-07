"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/shared";
import { LONG_HOLD_MS } from "@/lib/lessons/verdict";

/**
 * A HOLD LONG ENOUGH TO LOOK BROKEN (SCRUM-315, Lydia, 7 Nov): "one extra
 * state for a hold long enough to look broken: a retry and nothing else".
 *
 * True once the hold named by `hold` has lasted `LONG_HOLD_MS`, and false
 * again the moment a new hold starts or none is held. `hold` is the
 * caller's own count of the holds it has started - each pick, retry or
 * commit a new one - and null while nothing is held.
 */
export function useLongHold(hold: number | null): boolean {
  const [longFor, setLongFor] = useState<number | null>(null);
  useEffect(() => {
    if (hold === null) return;
    const timer = setTimeout(() => setLongFor(hold), LONG_HOLD_MS);
    return () => clearTimeout(timer);
  }, [hold]);
  return hold !== null && longFor === hold;
}

/**
 * The long hold's one offer: send the same answer again. Nothing else - no
 * line, no spinner, no verdict, no way past it - and the pick it holds stays
 * chosen. "Try again" is the app's own word for sending the same thing again.
 * Secondary, never the navy primary: it is not the way on.
 */
export function HoldRetry({ onRetry }: { onRetry: () => void }) {
  return (
    <Button
      variant="secondary"
      className="mt-4 w-full"
      data-hold-retry
      onClick={onRetry}
    >
      Try again
    </Button>
  );
}
