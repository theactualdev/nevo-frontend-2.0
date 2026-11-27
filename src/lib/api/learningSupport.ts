import { api, ApiError, apiErrorCode } from "./client";
import { isAdminRole } from "@/lib/constants/permissions";

/**
 * Learning Support (SCRUM-247): who may open the learning support view of a
 * named child - their adaptation history and progress reports - and who
 * decided that.
 *
 * A recorded grant, not a scope. `GET /api/adaptations/student/{id}` answers
 * 403 `learning_support_role_required` to an administrator without it,
 * whatever scopes they hold - the e2e admin holds all of them and is refused.
 *
 * `POST` and `DELETE` both answer with the whole list as it now stands, so a
 * screen replaces what it holds rather than reading again.
 */

export interface LearningSupportHolder {
  userId: string;
  name: string;
  role: string;
  grantedAt: string;
  /** The granter's user id. */
  grantedBy: string;
  /** The granter's name, since 13 Oct (Teslim, ab78139). */
  grantedByName?: string | null;
}

export interface LearningSupportHolders {
  holders: LearningSupportHolder[];
  /** Whether the person asking holds it themselves. */
  viewerHoldsIt: boolean;
  /**
   * SCRUM-304: when NOBODY holds it, the administrator a concern would go to
   * instead - the school's senior admin first. Null when someone holds it, or
   * when the school has no active administrator either.
   */
  fallbackRecipient?: { userId: string; name: string } | null;
}

/**
 * The refusal anyone without the role meets on the learning support reads,
 * the progress report routes and flag acknowledgement - every staff role since
 * 13 Oct, teachers included.
 */
export const LEARNING_SUPPORT_REQUIRED = "learning_support_role_required";
/**
 * 409 (SCRUM-248): the operation would leave the school with nobody holding
 * it - removing the role from the final holder, or deactivating them.
 */
export const LAST_LEARNING_SUPPORT_HOLDER = "last_learning_support_holder";
/** 403: a grant to yourself. The console never offers one. */
export const SELF_GRANT_FORBIDDEN = "learning_support_self_grant_forbidden";

/** Whether an error is the server refusing with this code. */
export function refusedWith(err: unknown, code: string): boolean {
  return err instanceof ApiError && apiErrorCode(err.detail) === code;
}

export const learningSupportApi = {
  /** `GET /api/v1/learning-support/holders` - any school member may ask. */
  holders: () =>
    api.get<LearningSupportHolders>("/api/v1/learning-support/holders"),
  /**
   * Give it to someone else. `replaceExisting` is never sent: SCRUM-247 adds a
   * second holder and removes the first as two decisions, never a silent
   * hand-over.
   */
  grant: (userId: string) =>
    api.post<LearningSupportHolders>("/api/v1/learning-support/holders", { userId }),
  remove: (userId: string) =>
    api.del<LearningSupportHolders>(
      `/api/v1/learning-support/holders/${encodeURIComponent(userId)}`,
    ),
};

export function holderFor(
  list: LearningSupportHolders | null,
  userId: string,
): LearningSupportHolder | null {
  return list?.holders.find((h) => h.userId === userId) ?? null;
}

/**
 * Whether this person is the school's ONLY ADMINISTRATOR holding Learning
 * Support. Lydia, 25 Nov (L86): "Require at least one admin holder. A school
 * where nobody can see safeguarding flags is the worst available outcome" -
 * teachers who hold it don't count, as the teacher view isn't built yet.
 * Teslim is asked to enforce it on the server too; until then the console
 * keeps it, from the server's own list. Unknown (no list) is never a yes.
 */
export function lastAdminHolder(list: LearningSupportHolders | null, userId: string): boolean {
  const held = holderFor(list, userId);
  if (!list || !held || !isAdminRole(held.role)) return false;
  return !list.holders.some((h) => h.userId !== userId && isAdminRole(h.role));
}

/** Said where that removal is refused - the access-removal line's words, for an administrator. */
export function lastAdminHolderAccessLine(name: string): string {
  return `${name} is the only administrator in your school with Learning Support, so their access can't be removed. Give Learning Support to another administrator first, then remove their access.`;
}
