import { ApiError } from "@/lib/api/client";

/**
 * Statuses with which a public link read ANSWERS that the link is no good.
 *
 * Both reads a child's link goes through answer an unknown, expired or revoked
 * token with a 404, checked against the live API on 1 Oct:
 * `GET /api/v1/join/{token}` says *"Join link is invalid or expired"* and
 * `GET /api/v1/student-entry/{token}` says `entry_link_invalid`. Both declare a
 * 422 in the contract, for a token they cannot read at all. 410 says "gone" in
 * so many words, and the join landing has always read it that way.
 */
const DEAD_LINK_STATUSES = [404, 410, 422];

/**
 * Did the server say this link is dead, rather than fail to say anything?
 *
 * THE DIFFERENCE IS THE WHOLE POINT. A dropped network (status 0), a 5xx and a
 * 429 say nothing about the link, and telling a child "ask your teacher for a
 * new one" on any of them sends them away from a link that works - and the new
 * link would fail the same way. Only an answer about the token closes the door.
 */
export function linkIsDead(err: unknown): boolean {
  return err instanceof ApiError && DEAD_LINK_STATUSES.includes(err.status);
}
