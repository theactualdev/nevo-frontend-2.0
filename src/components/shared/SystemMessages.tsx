"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  isChild,
  SystemMessage,
  type SystemMessageInput,
} from "./SystemMessage";

/**
 * The queue behind SCRUM-152's bar: SM-05's resolve-in-place and SM-06's
 * stack.
 *
 * ONE COMPONENT, BUILT ONCE. Design asked for that by name - *"build once as a
 * shared component rather than per screen"* - so this lives in `shared/` and
 * the first adopters named on the ticket are class creation and the two bulk
 * imports, in the admin lane. Teacher screens are adopting it here; nothing
 * about it is teacher-specific.
 *
 * SM-05 RESOLVES IN PLACE. `show` hands back an id and `resolve` replaces that
 * message's content where it stands: *"it never vanishes and gets replaced by
 * a second bar."* A caller that showed "Creating twelve classes…" turns it
 * into "Twelve classes created." without the eye having to find a new thing.
 *
 * SM-06 STACKS RATHER THAN COLLAPSES, newest at top, capped at three, and
 * design gave the reason: *"a single count could hide a failure behind a
 * success."* The cap drops the OLDEST, and because anything that stays is a
 * failure or a partial, what survives a busy moment is the thing that needed
 * someone - which is the same argument one level down.
 *
 * WHAT LEAVES AND WHAT STAYS. A confirmation goes on its own; a failure or a
 * partial stays until dismissed, because it is the one kind a person may have
 * looked away from. A progress message stays until it is resolved, since it
 * describes something still running.
 */

/** Long enough to read a short line twice, per design's own worked example. */
const LEAVES_AFTER_MS = 5000;

/** SM-06: "stacked, newest at top, capped at three". */
const MAX_ON_SCREEN = 3;

interface Held {
  id: number;
  message: SystemMessageInput;
}

interface SystemMessagesApi {
  /** Show one. Returns the id, so a progress bar can be resolved in place. */
  show: (message: SystemMessageInput) => number;
  /** SM-05: replace that message's content where it stands. */
  resolve: (id: number, message: SystemMessageInput) => void;
  dismiss: (id: number) => void;
}

const Ctx = createContext<SystemMessagesApi | null>(null);

/** Does this one go on its own, or wait for a person? */
function leavesOnItsOwn(message: SystemMessageInput): boolean {
  if (isChild(message)) return true;
  return message.kind === "confirm" || message.kind === "count";
}

export function SystemMessagesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [held, setHeld] = useState<Held[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setHeld((all) => all.filter((h) => h.id !== id));
  }, []);

  /**
   * A message that leaves on its own gets a timer; one that stays does not.
   *
   * Kept in a ref keyed by id rather than in an effect, so that resolving a
   * progress bar INTO a confirmation starts the confirmation's clock without
   * the bar unmounting and remounting - which is the whole point of SM-05.
   */
  const arm = useCallback(
    (id: number, message: SystemMessageInput) => {
      const existing = timers.current.get(id);
      if (existing) clearTimeout(existing);
      timers.current.delete(id);
      if (!leavesOnItsOwn(message)) return;
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), LEAVES_AFTER_MS),
      );
    },
    [dismiss],
  );

  const show = useCallback(
    (message: SystemMessageInput) => {
      const id = nextId.current++;
      setHeld((all) => {
        // Newest at the top, and the cap drops the OLDEST rather than
        // refusing the newest - the most recent thing that happened is the
        // thing a person is trying to understand.
        const next = [{ id, message }, ...all];
        const dropped = next.slice(MAX_ON_SCREEN);
        dropped.forEach((h) => {
          const t = timers.current.get(h.id);
          if (t) clearTimeout(t);
          timers.current.delete(h.id);
        });
        return next.slice(0, MAX_ON_SCREEN);
      });
      arm(id, message);
      return id;
    },
    [arm],
  );

  const resolve = useCallback(
    (id: number, message: SystemMessageInput) => {
      setHeld((all) =>
        all.map((h) => (h.id === id ? { ...h, message } : h)),
      );
      arm(id, message);
    },
    [arm],
  );

  const api = useMemo(
    () => ({ show, resolve, dismiss }),
    [show, resolve, dismiss],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      {held.length > 0 && (
        /* Top-centre, clear of the sidebar, riding above the content and
           leaving the layout beneath untouched - the frame's own placement.
           `pointer-events-none` on the rail so a bar never swallows a click
           meant for the page behind it; the bars themselves take theirs back. */
        <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4">
          {held.map((h) => (
            <div key={h.id} className="pointer-events-auto">
              <SystemMessage
                message={h.message}
                onDismiss={
                  leavesOnItsOwn(h.message) ? undefined : () => dismiss(h.id)
                }
              />
            </div>
          ))}
        </div>
      )}
    </Ctx.Provider>
  );
}

/**
 * Say what happened.
 *
 * Returns a no-op outside a provider rather than throwing: a screen rendered
 * in a test, or in a console that has not adopted the provider yet, should
 * still render. A missing confirmation is a smaller failure than a blank page,
 * and the page is where the record lives anyway.
 */
export function useSystemMessages(): SystemMessagesApi {
  const ctx = useContext(Ctx);
  const fallback = useMemo<SystemMessagesApi>(
    () => ({ show: () => -1, resolve: () => {}, dismiss: () => {} }),
    [],
  );
  return ctx ?? fallback;
}
