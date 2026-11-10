"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  attentionApi,
  type AttentionAction,
  type AttentionReport,
} from "@/lib/api/attention";
import { ApiError, apiErrorCode } from "@/lib/api/client";
import { usableSession } from "@/lib/auth/doorSession";
import { randomId } from "@/lib/utils";

/**
 * FOCUS EVENTS FOR THE SECTION ON SCREEN (Teslim, 8ab10c5; Lydia's rollout
 * order, 1 Nov): `return` when a section is first visible and again after an
 * away, `away` when it stops being visible - the page hidden, the app
 * switched, the tab closed or the lesson left - always with the sitting's id
 * and the section's own. See `attentionApi`.
 *
 * THE SERVER CLOSES AN AWAY ONLY WITH ITS OWN SECTION. A return naming
 * another section leaves the interval open, and an open interval makes every
 * later timing in the sitting unestablished. So the section that went away is
 * remembered - on the child's own shelf in storage, through a reload or a
 * closed tab - and its return goes first, before the section now on screen.
 *
 * ONE COHERENT SITTING, however the events travel:
 * - in order, one at a time, so a return never lands before its away;
 * - each event's id made once, so a retry is the same event to the server;
 * - a network failure or a server error is tried again, sooner when the
 *   device comes back online; a refusal is not;
 * - what is unsent survives the page in storage, and goes first next time.
 *
 * THE LENGTH OF EVERY ABSENCE THIS PAGE SAW BEGIN (Teslim, e5a0544 and
 * 9 Nov). The server stamps each transition as it arrives, so an away that
 * left late or travelled slowly shortened the absence it opened: on the
 * 9 Nov desktop run a 17.2 s absence was recorded as 1.4 s, and a 68.6 s one
 * as 61.8 s. So every return that closes an absence this page saw begin
 * carries its length, measured with `performance.now()` (rule 4) from the
 * moment the page went away to the moment it came back - taken as the return
 * is queued, not when it can go - and the server uses it whenever it is
 * there. Never on an away (the server refuses it there), and never for an
 * absence a reload split: the new page has a clock of its own, so nothing is
 * sent. Over the server's bound, nothing either.
 *
 * HOW LONG THE SECTION HAS BEEN ON SCREEN as each return goes (Teslim, 9 Nov:
 * "I'll date the return as arrival minus that"; live 10 Nov). After a reload
 * or a reopen the return waited 8 to 12 s for the sitting to be known, and
 * the server stamped it then. Measured from when the section came on screen
 * - or the page came back, whichever is later - to each try at sending it,
 * and sent on the return as `clientVisibleForMs`. Never on an away (the
 * server refuses it there), never for a return the last page queued, and
 * nothing over the bound.
 *
 * THE SITTING ENDS WHEN THE PLAYER SAYS SO. "Leave for now" ends the sitting,
 * and the lesson then sent one more event for it as it went (9 Nov, 404
 * `active_session_not_found`). The player ends it here too - the function
 * `useAttentionReports` returns - and nothing more goes for it from this page.
 *
 * NOTHING ELSE. No other time is sent (the server stamps each transition),
 * nothing is read back, and nothing a child sees changes. No away while no section is
 * on screen - the after-lesson questions, or a finished lesson - because an
 * away nothing will close would leave the rest of the sitting unestablished.
 */

/** What one sitting still owes the server, on its child's shelf. */
interface Held {
  /** The section that went away, until its return is queued. */
  open?: { segmentId: string };
  queue: AttentionReport[];
}

const SHELF = "nevo.attention.v1";
/** More than any sitting queues; only a bound on what storage keeps. */
const MAX_QUEUED = 100;
/** Between tries after a network failure or a server error, then the last. */
const RETRY_MS = [1_000, 3_000, 10_000, 30_000];
/**
 * The longest absence the server takes a length for (e5a0544): ten hours.
 * The time on screen has the same bound (10 Nov).
 */
const MAX_DEVICE_MS = 36_000_000;

/** A length measured on this page that the server will take, or none. */
function bounded(ms: number): number | undefined {
  const rounded = Math.round(ms);
  return rounded >= 0 && rounded <= MAX_DEVICE_MS ? rounded : undefined;
}

const shelfKey = (owner: string) => `${SHELF}.${owner}`;

function readShelf(owner: string): Record<string, Held> {
  try {
    const raw = window.localStorage.getItem(shelfKey(owner));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, Held>)
      : {};
  } catch {
    return {};
  }
}

function writeHeld(owner: string, sessionId: string, held: Held): void {
  try {
    const shelf = readShelf(owner);
    if (!held.open && held.queue.length === 0) delete shelf[sessionId];
    else shelf[sessionId] = held;
    if (Object.keys(shelf).length === 0) {
      window.localStorage.removeItem(shelfKey(owner));
    } else {
      window.localStorage.setItem(shelfKey(owner), JSON.stringify(shelf));
    }
  } catch {
    // Private mode or a full quota: the page still sends what it can.
  }
}

interface Reporter {
  /**
   * The section now on screen, or null for none. Only while visible. `since`
   * is when it came on screen, on this page's clock.
   */
  show: (segmentId: string | null, since: number) => void;
  /** The page stopped being visible. */
  hide: () => void;
  /** Send now: the device is back online. */
  wake: () => void;
  /** The lesson left this page: an away, a tick later, unless it is back. */
  leave: () => void;
  /** Back before the tick: no away after all. */
  stay: () => void;
  /** The player ended the sitting: nothing more for it from this page. */
  close: () => void;
  /** Stop, with nothing more sent. */
  drop: () => void;
}

/** One per sitting on this page, so a remount never sends anything twice. */
const reporters = new Map<string, Reporter>();

function reporterFor(owner: string, sessionId: string): Reporter {
  const key = `${owner}:${sessionId}`;
  const known = reporters.get(key);
  if (known) return known;

  const stored = readShelf(owner)[sessionId];
  const held: Held = {
    ...(stored?.open ? { open: stored.open } : {}),
    queue: Array.isArray(stored?.queue) ? stored.queue : [],
  };
  /** The section last reported visible on this page. */
  let shown: string | null = null;
  let sending = false;
  let gone = false;
  let tries = 0;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let leaving: ReturnType<typeof setTimeout> | null = null;
  /*
   * WHEN THE ABSENCE THIS PAGE SAW BEGIN BEGAN (`performance.now()`). Never
   * stored: a reload has a clock of its own, so an absence from before one
   * has no length here.
   */
  let awayAt: number | null = null;
  /*
   * WHEN EACH RETURN QUEUED HERE CAME ON SCREEN, by its event id - never
   * stored, for the same reason. A return the last page queued has none.
   */
  const onScreenSince = new Map<string, number>();

  const save = () => writeHeld(owner, sessionId, held);

  const queue = (
    action: AttentionAction,
    segmentId: string,
    extra: { awayMs?: number; since?: number } = {},
  ) => {
    const clientEventId = randomId();
    held.queue.push({
      action,
      segmentId,
      clientEventId,
      ...(extra.awayMs === undefined
        ? {}
        : { clientAwayDurationMs: extra.awayMs }),
    });
    if (extra.since !== undefined) onScreenSince.set(clientEventId, extra.since);
    if (held.queue.length > MAX_QUEUED) held.queue.splice(0, 1);
    save();
  };

  /** The open absence's length, where this page saw it begin. */
  const awayLength = (): number | undefined =>
    awayAt === null ? undefined : bounded(performance.now() - awayAt);

  /** The sitting is not one the server will take anything for. */
  const end = () => {
    gone = true;
    held.queue = [];
    delete held.open;
    onScreenSince.clear();
    save();
    if (retry) clearTimeout(retry);
    retry = null;
  };

  const pump = (keepalive = false) => {
    if (sending || gone) return;
    const next = held.queue[0];
    if (!next) return;
    if (retry) clearTimeout(retry);
    retry = null;
    sending = true;
    // Taken at each try, so a return that waited still dates itself - and
    // never kept with the queued event, nor put on an away (refused there).
    const since =
      next.action === "return"
        ? onScreenSince.get(next.clientEventId)
        : undefined;
    const visibleForMs =
      since === undefined ? undefined : bounded(performance.now() - since);
    const body =
      visibleForMs === undefined
        ? next
        : { ...next, clientVisibleForMs: visibleForMs };
    attentionApi.report(sessionId, body, { keepalive }).then(
      () => {
        sending = false;
        // Ended while it travelled: nothing of this sitting is kept now.
        if (gone) return;
        tries = 0;
        held.queue.shift();
        onScreenSince.delete(next.clientEventId);
        save();
        pump(keepalive);
      },
      (cause: unknown) => {
        sending = false;
        if (gone) return;
        const status = cause instanceof ApiError ? cause.status : 0;
        const refused =
          status >= 400 && status < 500 && status !== 408 && status !== 429;
        if (!refused) {
          // The network, or the server's own trouble: the same event again.
          const wait = RETRY_MS[Math.min(tries, RETRY_MS.length - 1)];
          tries += 1;
          retry = setTimeout(() => pump(), wait);
          return;
        }
        // Refused: the same request would be refused again, so it goes.
        // A sitting that has ended, a section that is not the lesson's, a
        // signed-out or non-student account: nothing more for this sitting
        // but the section that is not the lesson's.
        if (
          status === 404 &&
          apiErrorCode((cause as ApiError).detail) === "lesson_section_not_found"
        ) {
          held.queue.shift();
          onScreenSince.delete(next.clientEventId);
          save();
          pump(keepalive);
          return;
        }
        end();
      },
    );
  };

  const reporter: Reporter = {
    show(segmentId, since) {
      if (gone) return;
      if (held.open) {
        const away = held.open.segmentId;
        delete held.open;
        queue("return", away, { awayMs: awayLength(), since });
        awayAt = null;
        shown = away;
      }
      if (segmentId !== null && segmentId !== shown) {
        queue("return", segmentId, { since });
      }
      shown = segmentId;
      pump();
    },
    hide() {
      if (gone || held.open || shown === null) return;
      held.open = { segmentId: shown };
      awayAt = performance.now();
      queue("away", shown);
      // The page may not run again: let the request outlive it.
      pump(true);
    },
    wake() {
      pump();
    },
    leave() {
      if (leaving) clearTimeout(leaving);
      leaving = setTimeout(() => {
        leaving = null;
        reporter.hide();
        shown = null;
      }, 0);
    },
    stay() {
      if (leaving) clearTimeout(leaving);
      leaving = null;
    },
    close() {
      /*
       * What had not gone yet goes nowhere: the sitting will take nothing
       * more. And it leaves this page's map, so the same sitting opened here
       * again - only if the end never reached the server - reports afresh
       * rather than into a reporter that has stopped.
       */
      end();
      reporter.stay();
      if (reporters.get(key) === reporter) reporters.delete(key);
    },
    drop() {
      gone = true;
      if (retry) clearTimeout(retry);
      if (leaving) clearTimeout(leaving);
      retry = null;
      leaving = null;
    },
  };
  reporters.set(key, reporter);
  return reporter;
}

/** Test seam. */
export function resetAttentionReports(): void {
  for (const reporter of reporters.values()) reporter.drop();
  reporters.clear();
}

/**
 * Report the section on screen for a live sitting. `segmentId` is null where
 * no section is (the after-lesson questions, the finished lesson); `on` is
 * false for anything that is not a live, first-time sitting.
 *
 * Returns what the player calls where it ends the sitting itself ("Leave for
 * now"): from then on nothing more goes for it from this page.
 */
export function useAttentionReports({
  on,
  sessionId,
  segmentId,
}: {
  on: boolean;
  sessionId: string | null;
  segmentId: string | null;
}): () => void {
  const reporterRef = useRef<Reporter | null>(null);
  const sectionRef = useRef<string | null>(segmentId);
  /*
   * When the section now on screen came on screen, on this page's clock: as
   * it is drawn, or as the page comes back - null while hidden. Kept before
   * the sitting is known, which is when it matters most: the first return
   * of a sitting, and the one after a reload, wait for it.
   */
  const shownAtRef = useRef<number | null>(null);
  useEffect(() => {
    sectionRef.current = segmentId;
    shownAtRef.current =
      document.visibilityState === "visible" ? performance.now() : null;
  }, [segmentId]);
  useEffect(() => {
    const onVisibility = () => {
      shownAtRef.current =
        document.visibilityState === "visible" ? performance.now() : null;
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (!on || !sessionId) return;
    const owner = usableSession()?.userId;
    if (!owner) return;
    const r = reporterFor(owner, sessionId);
    r.stay();
    reporterRef.current = r;

    const onVisibility = () => {
      if (document.visibilityState === "hidden") r.hide();
      else r.show(sectionRef.current, performance.now());
    };
    // Closing or reloading the tab, and a page restored from the back cache.
    const onPageHide = () => r.hide();
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted && document.visibilityState === "visible") {
        r.show(sectionRef.current, performance.now());
      }
    };
    const onOnline = () => r.wake();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", onOnline);
      reporterRef.current = null;
      r.leave();
    };
  }, [on, sessionId]);

  useEffect(() => {
    if (!on || !sessionId) return;
    if (document.visibilityState !== "visible") return;
    reporterRef.current?.show(
      segmentId,
      shownAtRef.current ?? performance.now(),
    );
  }, [on, sessionId, segmentId]);

  return useCallback(() => {
    reporterRef.current?.close();
  }, []);
}
