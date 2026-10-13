import {
  SIGNAL_EVENT_TYPES,
  type BusyReason,
  type SignalEventType,
} from "@/lib/constants";

/** `TrackEvent` from `useSignals`, spelled out so `lib/` needs no hook. */
type Track = (type: SignalEventType, payload?: Record<string, unknown>) => void;

/**
 * Open one `system_busy` window now. The returned close sends it, once.
 *
 * ONE EVENT PER WINDOW, SENT AS IT CLOSES. The catalogue declares
 * `{ reason, durationMs }` for this type. This client sent the Touch Signal
 * Contract's shape instead - a `{ reason, phase }` pair, start then end - so
 * every wait went up as two events with a key the catalogue does not take and
 * no length on either. Sent at the close, the event's own timestamp is where
 * the wait ended and `durationMs` is how long it ran.
 *
 * Timed on `performance.now()` (rule 4): this length goes to the engine, and a
 * tablet correcting its clock mid-wait would otherwise send a negative.
 *
 * The close is safe to call more than once and sends only the first time, so
 * an effect's cleanup and an unmount can both reach it. A window that never
 * closes - the tab killed mid-wait - sends nothing, because it has no length
 * anyone measured.
 */
export function openBusyWindow(
  track: Track | undefined,
  reason: BusyReason,
): () => void {
  const since = performance.now();
  let open = true;
  return () => {
    if (!open) return;
    open = false;
    track?.(SIGNAL_EVENT_TYPES.SYSTEM_BUSY, {
      reason,
      durationMs: Math.max(0, Math.round(performance.now() - since)),
    });
  };
}
