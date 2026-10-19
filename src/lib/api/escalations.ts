import { api } from "./client";

/**
 * Teacher-to-SENCo escalations - a teacher raising a concern about a child
 * with the person whose job it is to act on it.
 *
 * This transport did not exist until 15 Sep 2026. Before it, `ShareSheet`
 * carried a disabled button and said so, because the alternatives all lied:
 * `POST /api/messages` constrains `recipientType` to `student|class`, the IEP
 * share takes a `parentId`, and the flags read is GET-only. A safeguarding
 * disclosure reported as delivered when nothing left the browser is the worst
 * defect this console could carry, so the claim was removed and the reason
 * left in its place. `POST /api/v1/escalations` is that reason expiring.
 *
 * THE RECENT PICTURE IS NOT SENT. `recentPicture` is on the RESPONSE, derived
 * server-side from the student record - the client neither builds it nor
 * uploads it. That matters for the sheet's copy: "a note goes to your SENCo
 * along with their recent picture" is a promise the server keeps, so it can
 * stay. Do not assemble a summary here and post it; it would be a second,
 * divergent account of the same child.
 *
 * `GET` is the SENCo/admin view: the admin console's Learning Support screen
 * reads it for D8's "Escalated by a teacher" - but nothing in the teacher
 * console calls it. A teacher's own
 * "already shared" state is deliberately NOT read back from it: whether a
 * teacher may list escalations at all is untested, and a 403 rendered as
 * "not shared yet" would be a worse answer than showing nothing.
 */

export interface EscalationCreate {
  studentId: string;
  /** Required. What the teacher is noticing, in their own words. */
  note: string;
  /**
   * Optional link to one `AttentionFlag`.
   *
   * Deliberately not sent by the teacher sheet - and NOT because it is
   * unavailable. `AttentionFlagResponse` carries `id` and `studentId`, and
   * `GET /api/intelligence/flags` is already read by `useTeacherFlags`, so a
   * flag id is obtainable. C.8b simply never asks the teacher which flag they
   * mean; it asks "What are you noticing?" and takes prose. Attaching a flag
   * the teacher did not choose would tell the SENCo this escalation is about
   * that concern when the teacher may have meant another, or none. Offering
   * the choice is a design question, flagged rather than guessed.
   */
  attentionFlagId?: string | null;
}

export interface Escalation {
  id: string;
  studentId: string;
  /** Nullable on the wire, so never render it without a fallback. */
  studentFirstName: string | null;
  teacherId: string;
  note: string;
  /** Server-derived summary of the child. Read-only; see the note above. */
  recentPicture: string;
  generatedAt: string;
  acknowledged: boolean;
  /** Who marked it as seen and when, since 13 Oct - what the teacher is told. */
  acknowledgedAt?: string | null;
  acknowledgedBy?: string | null;
  acknowledgedByName?: string | null;
}

/**
 * One page of `GET /api/v1/escalations?openOnly=true` (14 Oct: `openOnly`,
 * `limit`, `offset`). Read to a short page, so the open ones are all of them
 * and "none are waiting" can be said. Before 14 Oct the route answered the
 * newest 100, seen ones included, with no paging.
 */
const OPEN_PAGE = 100;

export const escalationsApi = {
  /** Raise a concern with the SENCo. 201 on success; 422 on a rejected body. */
  create: (payload: EscalationCreate) =>
    api.post<Escalation>("/api/v1/escalations", payload),

  /** The SENCo/admin inbox. Not called from the teacher console - see above. */
  list: () => api.get<Escalation[]>("/api/v1/escalations"),

  /**
   * Every concern nobody has marked as seen, page by page. `complete` is false
   * when the pages ran out before a short one came back - then the list is a
   * floor, and neither a count nor the all-clear may be said on it.
   */
  allOpen: async (maxPages = 10): Promise<{ open: Escalation[]; complete: boolean }> => {
    const open: Escalation[] = [];
    for (let page = 0; page < maxPages; page += 1) {
      const batch = await api.get<Escalation[]>("/api/v1/escalations", {
        params: { openOnly: true, limit: OPEN_PAGE, offset: page * OPEN_PAGE },
      });
      if (!Array.isArray(batch)) return { open, complete: false };
      open.push(...batch);
      if (batch.length < OPEN_PAGE) return { open, complete: true };
    }
    return { open, complete: false };
  },

  /**
   * Mark a concern as seen. Learning Support holders only (403
   * `learning_support_role_required`); the first acknowledgement stands.
   */
  acknowledge: (escalationId: string) =>
    api.post<Escalation>(`/api/v1/escalations/${encodeURIComponent(escalationId)}/acknowledge`),
};
