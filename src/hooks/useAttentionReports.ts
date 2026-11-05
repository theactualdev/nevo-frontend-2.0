"use client";

import { useEffect, useRef } from "react";
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
 * ONE TIME, AND ONLY WHERE THE SERVER'S STAMP IS WRONG (Teslim, e5a0544; the
 * Hub, 4 Nov). An away that could not be sent as it happened - the network
 * gone, or the events before it stuck - arrives late, and the server stamped
 * it on arrival: a two-minute absence read as 0 s. So the return that closes
 * such an absence carries its length, measured on this page with
 * `performance.now()` (rule 4) from the moment the page went away, and the
 * server dates the away from that. Never on an away (the server refuses it
 * there), never for an away sent live (the server's stamps are right), and
 * never for one this page did not see begin: after a reload there is no
 * measurement, so nothing is sent. Over the server's bound, nothing either.
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
/** The longest absence the server takes a length for (e5a0544): ten hours. */
const MAX_AWAY_MS = 36_000_000;

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
  /** The section now on screen, or null for none. Only while visible. */
  show: (segmentId: string | null) => void;
  /** The page stopped being visible. */
  hide: () => void;
  /** Send now: the device is back online. */
  wake: () => void;
  /** The lesson left this page: an away, a tick later, unless it is back. */
  leave: () => void;
  /** Back before the tick: no away after all. */
  stay: () => void;
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
   * THE ABSENCE THIS PAGE SAW BEGIN: when (`performance.now()`), and whether
   * its away could not go as it happened. Never stored: a reload has a clock
   * of its own, so an absence from before one has no length here.
   */
  let awayAt: number | null = null;
  let awayLate = false;

  const save = () => writeHeld(owner, sessionId, held);

  const queue = (
    action: AttentionAction,
    segmentId: string,
    awayMs?: number,
  ) => {
    held.queue.push({
      action,
      segmentId,
      clientEventId: randomId(),
      ...(awayMs === undefined ? {} : { clientAwayDurationMs: awayMs }),
    });
    if (held.queue.length > MAX_QUEUED) held.queue.splice(0, 1);
    save();
  };

  /** The open absence's length, where its away could not go as it happened. */
  const lateLength = (): number | undefined => {
    if (awayAt === null || !awayLate) return undefined;
    const ms = Math.round(performance.now() - awayAt);
    return ms <= MAX_AWAY_MS ? ms : undefined;
  };

  /** The sitting is not one the server will take anything for. */
  const end = () => {
    gone = true;
    held.queue = [];
    delete held.open;
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
    attentionApi.report(sessionId, next, { keepalive }).then(
      () => {
        sending = false;
        tries = 0;
        held.queue.shift();
        save();
        pump(keepalive);
      },
      (cause: unknown) => {
        sending = false;
        const status = cause instanceof ApiError ? cause.status : 0;
        const refused =
          status >= 400 && status < 500 && status !== 408 && status !== 429;
        // While away nothing else is queued, so what could not go is the
        // away or what it waits behind: it will be late. (Each away starts
        // the flag afresh.)
        awayLate = true;
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
          save();
          pump(keepalive);
          return;
        }
        end();
      },
    );
  };

  const reporter: Reporter = {
    show(segmentId) {
      if (gone) return;
      if (held.open) {
        const away = held.open.segmentId;
        delete held.open;
        queue("return", away, lateLength());
        shown = away;
      }
      if (segmentId !== null && segmentId !== shown) queue("return", segmentId);
      shown = segmentId;
      pump();
    },
    hide() {
      if (gone || held.open || shown === null) return;
      held.open = { segmentId: shown };
      awayAt = performance.now();
      awayLate = false;
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
 */
export function useAttentionReports({
  on,
  sessionId,
  segmentId,
}: {
  on: boolean;
  sessionId: string | null;
  segmentId: string | null;
}): void {
  const reporter = useRef<Reporter | null>(null);
  const section = useRef<string | null>(segmentId);
  useEffect(() => {
    section.current = segmentId;
  }, [segmentId]);

  useEffect(() => {
    if (!on || !sessionId) return;
    const owner = usableSession()?.userId;
    if (!owner) return;
    const r = reporterFor(owner, sessionId);
    r.stay();
    reporter.current = r;

    const onVisibility = () => {
      if (document.visibilityState === "hidden") r.hide();
      else r.show(section.current);
    };
    // Closing or reloading the tab, and a page restored from the back cache.
    const onPageHide = () => r.hide();
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted && document.visibilityState === "visible") {
        r.show(section.current);
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
      reporter.current = null;
      r.leave();
    };
  }, [on, sessionId]);

  useEffect(() => {
    if (!on || !sessionId) return;
    if (document.visibilityState !== "visible") return;
    reporter.current?.show(segmentId);
  }, [on, sessionId, segmentId]);
}
