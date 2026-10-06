import { api, type RequestOptions } from "./client";

/**
 * Ask Nevo endpoints (FE Architecture §1; Student B.12) - wired to the live
 * backend (`POST /api/v1/ask-nevo/`, Bearer). The backend owns the assistant
 * and enforces Zero-Tag on every response.
 *
 * Paths carry no trailing slash: Next 308-redirects slashed API routes before
 * the proxy runs; FastAPI's own slash redirect is followed server-side.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Every context id is typed `format: uuid` on the deployed contract, so a
 * non-UUID value is a 422 that takes the whole answer down with it - and the
 * drawer then falls back to a canned reply that looks exactly like a real
 * one. The console is built on human-readable slugs ("amara-okafor",
 * "jss-2a"), so a value only travels when it genuinely is a UUID.
 *
 * TODO(api): flagged to backend - the console holds no UUID for students or
 * lessons, so that context cannot be sent at all until an endpoint surfaces
 * one. `currentPage` carries the route in the meantime.
 */
export function asUuid(value: string | null | undefined): string | null {
  return value && UUID_RE.test(value) ? value : null;
}

/** Everything the assistant may scope an answer to (all optional). */
export interface AskNevoContextIds {
  studentId?: string | null;
  classId?: string | null;
  lessonId?: string | null;
  segmentId?: string | null;
  /** Conversation continuity across turns in one drawer session. */
  threadId?: string | null;
}

export interface AskNevoRequest {
  role: "student" | "teacher";
  /** The route the question was asked from (context, not tracking). */
  currentPage: string;
  contextIds: AskNevoContextIds;
  question: string;
}

export type AskNevoCategory =
  | "lesson_help"
  | "profile_pattern"
  | "class_planning"
  | "family_message"
  | "flag_review"
  | "general";

export interface AskNevoAnswer {
  answer: string;
  /**
   * The answer as one paragraph of plain text. Defaults to "" on the
   * contract, so it is only preferred when it says something.
   */
  plainText?: string;
  /** `structured` means `answer` carries markup; `plain` means it does not. */
  answerFormat?: "plain" | "structured";
  /**
   * FALSE IS THE SERVER SAYING THIS ONE BELONGS WITH THE TEACHER (1 Oct).
   *
   * Frame 26 draws that state - "Can't help · hands to teacher" - and the
   * student drawer used to reach it only through its own canned engine. The
   * answer is still safe to render; false adds the hand-over beside it.
   */
  canHelp: boolean;
  /** Why it could not help. Never rendered: no frame draws a reason. */
  cannotHelpReason?: string | null;
  questionCategory: AskNevoCategory;
  interactionId: string;
  aiGatewayCallId: string;
  /**
   * THE THREAD THE SERVER ACTUALLY OPENED, and the field this client used to
   * throw away.
   *
   * The drawer minted its own `randomId()` UUID and sent it as
   * `contextIds.threadId` on every turn. `randomId` returns a real v4 UUID, so
   * `asUuid` waved it through and nothing ever 422'd - the bug was silent. But
   * the id was never one the server issued, so the thread the backend stored
   * carried a DIFFERENT id, and `GET /ask-nevo/threads` would list
   * conversations the drawer had no way to match to itself.
   *
   * Nullable on the contract, so a server that opens no thread is handled: the
   * next turn simply sends null, exactly as the first turn does.
   */
  threadId?: string | null;
}

/** One past conversation, as the history list shows it. */
export interface ThreadSummary {
  threadId: string;
  title: string;
  role: AskNevoRole;
  messageCount: number;
  /** ISO 8601. */
  lastMessageAt: string;
  /** ISO 8601. */
  createdAt: string;
}

export type AskNevoRole = "student" | "teacher" | "parent" | "admin";

/**
 * `asker` rather than `user`, per the contract: the asker may be a learner, a
 * teacher, a parent or an administrator, and no one word fits all four.
 */
export type ThreadAuthor = "asker" | "nevo";

export interface ThreadMessage {
  messageId: string;
  author: ThreadAuthor;
  sequence: number;
  text: string;
  /** ISO 8601. */
  createdAt: string;
  /*
   * `blocks: AnswerBlockResponse[]` is REQUIRED on this schema and is not
   * declared here, which is a decision rather than an oversight.
   *
   * The contract's own description of that schema: "A client that only handles
   * `paragraph` can render `text` for every block and still be correct, so
   * adopting this is optional." The drawer renders `text`, so it is correct.
   *
   * Worth knowing: `contract-check.mjs` could not have caught this either way.
   * Its `propertiesOf` does not descend into a nested `$ref`, so nothing under
   * `messages[]` is checked at all. If structured answers ever need real
   * rendering - lists, headings - this is where the type starts.
   */
}

export interface ThreadTranscript {
  threadId: string;
  title: string;
  role: AskNevoRole;
  /** ISO 8601. */
  createdAt: string;
  messages: ThreadMessage[];
}

/**
 * The history rules the frame states, enforced HERE because the endpoint
 * cannot enforce them.
 *
 * `GET /ask-nevo/threads` declares no parameters at all on the deployed
 * contract - no limit, no since, no cursor - so there is nowhere to ask the
 * server for "50 entries, nothing older than 90 days". Whether the backend
 * already applies that window is not something this client can see, so it
 * applies the rule itself: if the server already trims, this is a no-op, and
 * if it does not, the teacher still gets the list the frame describes rather
 * than an unbounded one.
 */
export const HISTORY_LIMIT = 50;
export const HISTORY_DAYS = 90;

/**
 * Most-recent-first, windowed and capped. Takes `now` rather than reading the
 * clock so the rule is testable without freezing time.
 */
export function recentThreads(
  threads: ThreadSummary[],
  now: number,
): ThreadSummary[] {
  const floor = now - HISTORY_DAYS * 24 * 60 * 60 * 1000;
  return threads
    .filter((t) => {
      const at = Date.parse(t.lastMessageAt);
      // An unparseable date is kept, not dropped: losing a real conversation
      // is worse than showing one that may be slightly out of window.
      return Number.isNaN(at) || at >= floor;
    })
    .sort((a, b) => Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt))
    .slice(0, HISTORY_LIMIT);
}

export const askNevoApi = {
  ask: (payload: AskNevoRequest, options?: RequestOptions) =>
    api.post<AskNevoAnswer>("/api/v1/ask-nevo", payload, options),

  /** The frame set has no vote control yet (flagged to design); the seam is
   *  ready for it. 204 on success. */
  recordHelpfulness: (interactionId: string, helpful: boolean) =>
    api.post(`/api/v1/ask-nevo/${interactionId}/helpfulness`, { helpful }),

  /** Past conversations, newest first. No parameters - see `recentThreads`. */
  threads: (options?: RequestOptions) =>
    api.get<ThreadSummary[]>("/api/v1/ask-nevo/threads", options),

  /** One past conversation in full, read-only in the drawer. */
  thread: (threadId: string, options?: RequestOptions) =>
    api.get<ThreadTranscript>(
      `/api/v1/ask-nevo/threads/${threadId}`,
      options,
    ),
};

/*
 * DELETE /api/v1/ask-nevo/threads/{thread_id} IS LIVE AND DELIBERATELY NOT
 * WRAPPED HERE.
 *
 * C15 describes the history as "a flat, most-recent-first list ... No search,
 * folders, or filters" and draws four states - icon, list, read-only item,
 * empty. None carries a delete, swipe or overflow affordance, and the word
 * appears nowhere in either teacher frame. Wiring it would mean inventing both
 * the control and its confirmation copy for a destructive action on a
 * teacher's own record, which is design's call. Raised with design; a client
 * method nothing calls is just dead code until they answer.
 *
 * WATCH THE AUDIT NUMBER, THOUGH. `scripts/api-audit.mjs` keys on the PATH
 * alone - `usedNorm.has(norm(p))`, with no method in the key - so consuming
 * `GET /threads/{id}` marks DELETE on the same path [USED] too. Verified by
 * removing the GET wrapper: DELETE flipped back to [    ], and restoring it
 * flipped DELETE back to [USED] with `deleteThread` absent throughout. So the
 * "operations consumed" total over-counts wherever one path carries several
 * verbs, and this endpoint is one of the places it does.
 */
