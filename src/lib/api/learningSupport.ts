import { api } from "./client";

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
  /** The granter's user id. The server sends no name with it. */
  grantedBy: string;
}

export interface LearningSupportHolders {
  holders: LearningSupportHolder[];
  /** Whether the person asking holds it themselves. */
  viewerHoldsIt: boolean;
}

/** The refusal an administrator without the role meets on the learning support reads. */
export const LEARNING_SUPPORT_REQUIRED = "learning_support_role_required";

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
