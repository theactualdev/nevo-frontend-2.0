import type { Invitation } from "@/lib/api/invites";
import { normaliseStatus } from "./inviteStatus";

/**
 * D19's counters, its status filter and its pager - the three things that
 * decide which rows an admin is looking at.
 *
 * Pure and separate from the screen because all three used to be decorative:
 * the counters were numbers nobody could press, one of them counted a
 * different quantity from the other two, and a screen whose own bulk import
 * takes five hundred rows in one go rendered every one of them in a single
 * list.
 *
 * There was a "Consent withdrawn" filter here too, for student invitations.
 * Those are no longer listed (Lydia's L2, 14 Oct) - a teacher invite has no
 * parent behind it, and a child's consent is shown on Students.
 */

/** D19: `const pageSize = 20`. */
export const PAGE_SIZE = 20;

/**
 * The three the frame counts - `statDefs` verbatim - and NOT a total.
 *
 * The screen's first tile was "Invited", the row count. That is a different
 * kind of quantity from the two beside it: Pending and Joined are subsets a
 * filter can select, and a total is not, so pressing it could only ever mean
 * "clear". Three tiles, three filters, one behaviour.
 */
export const STAT_KEYS = ["pending", "joined", "expired"] as const;
export type StatKey = (typeof STAT_KEYS)[number];

const STAT_LABEL: Record<StatKey, string> = {
  pending: "Pending",
  joined: "Joined",
  expired: "Expired",
};

export interface StatTile {
  key: StatKey;
  n: number;
  label: string;
}

export function statTiles(rows: Invitation[], now: number): StatTile[] {
  return STAT_KEYS.map((key) => ({
    key,
    label: STAT_LABEL[key],
    n: rows.filter((i) => normaliseStatus(i.status, i.expiresAt, now) === key)
      .length,
  }));
}

/**
 * Whether a row survives the current status filter. `""` is no filter;
 * anything else is an invitation status.
 */
export function matchesStatus(
  invite: Invitation,
  filter: string,
  now: number,
): boolean {
  if (!filter) return true;
  return normaliseStatus(invite.status, invite.expiresAt, now) === filter;
}

export interface PageWindow {
  /** Clamped: a filter that shrinks the list must not strand the reader. */
  page: number;
  pageCount: number;
  /** Zero-based, for `slice`. */
  start: number;
  /** "Showing 1-20 of 47", or "" when there is nothing to describe. */
  label: string;
}

export function pageWindow(total: number, wanted: number): PageWindow {
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, wanted || 1), pageCount);
  const start = (page - 1) * PAGE_SIZE;
  const shown = Math.min(PAGE_SIZE, Math.max(0, total - start));
  return {
    page,
    pageCount,
    start,
    label: total === 0 ? "" : `Showing ${start + 1}-${start + shown} of ${total}`,
  };
}
