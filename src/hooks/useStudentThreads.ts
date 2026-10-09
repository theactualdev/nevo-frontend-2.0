"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { messagesApi, type MessageThread } from "@/lib/api/messages";
import { getSession, getToken } from "@/lib/auth/session";
import { THREADS, type Message, type Thread } from "@/components/student/Connect/connectData";
import { useHasSession } from "./useHasSession";

/**
 * The student's conversations, from `/api/messages/*`.
 *
 * A CHILD CAN NOW REPLY. This was read-only for a real reason, not by
 * omission: `POST /api/messages` constrains `recipientType` to
 * `^(student|class)$` with no `teacher` value, so a student could not address
 * their teacher through the contract at all. `POST /messages/threads/{id}/reply`
 * (3 Sep) is the way in, and it is a different shape on purpose - there is no
 * recipient to name. Access IS the thread: a child may write only where they
 * can already read. That now covers the FIRST message too: since 9 Oct (B95)
 * a child with a teacher assigned has their teacher thread in the list before
 * anything is in it. A child whose list is EMPTY writes the first message by
 * direct creation instead (`start`, design 9 Oct).
 *
 * As on the teacher side, the thread list carries no message bodies, so a
 * thread is fetched when first opened and kept. What the list DOES carry, and
 * what this used to throw away, is `latestPreview`, `unread` and `unreadCount`
 * - all three required on `MessageThreadResponse`. A live row therefore had an
 * empty preview line until the child opened it, and the unread dot was
 * hardcoded off under a comment claiming no unread state existed. It does.
 */

export interface StudentThreads {
  threads: Thread[];
  live: boolean;
  loading: boolean;
  /**
   * The thread list could not be read. Kept apart from "no threads": this was
   * set internally and never returned, so a child whose connection dropped was
   * shown the empty state and told their teacher had never written to them.
   */
  failed: boolean;
  /**
   * The child's conversation with their teacher, for "Message my teacher" -
   * see `teacherThreadId`. Null when there is none, when it cannot be told
   * apart, and for the signed-out walkthrough.
   */
  teacherThread: string | null;
  openThread: (threadId: string) => void;
  /**
   * Mark a thread read. Opening it is reading it, and this is the deliberate
   * write that says so - the GET must not be what clears a child's badge.
   */
  markThreadRead: (threadId: string) => void;
  /**
   * Write into a thread the child can already read.
   *
   * The message appears immediately as `sending` and is only marked
   * `delivered` once the backend has actually stored it - the send is never
   * reported before the write returns. A rejected send becomes `failed`, which
   * the bubble already renders and offers a retry on, rather than vanishing or
   * pretending to have arrived.
   *
   * Resolves true when the backend accepted it.
   */
  reply: (threadId: string, content: string) => Promise<boolean>;
  /** Re-send a message that failed, by its id. */
  retry: (threadId: string, messageId: string) => Promise<boolean>;
  /**
   * The child's first message, written from the EMPTY list (design, 9 Oct):
   * "This is where you and your teacher talk", with a composer. There is no
   * thread to reply into, so it goes by direct creation - see `sendFirst`.
   * Held here, with the same sending / delivered / failed life as a reply,
   * until the list carries the thread it created.
   */
  firstMessages: Message[];
  /** Send a first message. Resolves to the new thread's id, or null. */
  start: (content: string) => Promise<string | null>;
  /** Re-send a first message that failed, by its id. */
  retryFirst: (messageId: string) => Promise<string | null>;
}

/** The contract's cap on `content`. */
export const MESSAGE_MAX_LENGTH = 5000;

/**
 * WHICH CONVERSATION IS THE CHILD'S TEACHER (backend B95, design D109).
 *
 * "Message my teacher" opens Connect on that conversation (design, 6 Oct). The
 * child is never told a teacher id anywhere else - not on Ask Nevo's answer,
 * not on the dashboard - so the thread list's own `teacherId`, "the active
 * teacher this student conversation routes to", is what marks it. Empty or
 * not: since 9 Oct the thread is listed before its first message, and that
 * one is opened the same way.
 *
 * Only a `student` thread: a `class` thread is the teacher writing to the whole
 * class, and a child's reply to their teacher does not belong there. And only
 * when exactly one thread qualifies. With none there is nothing to open, and
 * with more the list cannot say which one is "my teacher" - both leave Connect
 * opening as it always has, rather than picking a conversation for the child.
 */
export function teacherThreadId(threads: MessageThread[]): string | null {
  const routed = threads.filter(
    (t) => t.recipientType === "student" && t.teacherId,
  );
  return routed.length === 1 ? routed[0].threadId : null;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0] ?? "?").slice(0, 2).toUpperCase();
}

/** The list as Connect draws it. */
function toThreads(threads: MessageThread[]): Thread[] {
  return threads.map((t, i) => ({
    id: t.threadId,
    name: t.title,
    initials: initialsOf(t.title),
    // No accent in the contract; the frame alternates, so we do too.
    accent: i % 2 === 0 ? ("navy" as const) : ("violet" as const),
    unread: t.unread,
    // Required on the wire but nullable: a thread with no messages yet
    // has no preview, and an empty row is correct there.
    preview: t.latestPreview ?? undefined,
    messages: [],
  }));
}

export function useStudentThreads(): StudentThreads {
  const signedIn = useHasSession();
  const [live, setLive] = useState<Thread[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [teacherThread, setTeacherThread] = useState<string | null>(null);
  const [firstMessages, setFirstMessages] = useState<Message[]>([]);
  // Mirrored for `retryFirst`, for the same reason as `liveRef` below.
  const firstRef = useRef<Message[]>(firstMessages);
  useEffect(() => {
    firstRef.current = firstMessages;
  }, [firstMessages]);
  const requested = useRef<Set<string>>(new Set());
  const selfId = getSession()?.userId;
  // `retry` needs the message's text, and reading it from `live` through the
  // callback's closure would read whatever was current when the callback was
  // built. A ref mirrors it without making `retry` re-created on every change.
  const liveRef = useRef<Thread[] | null>(live);
  useEffect(() => {
    liveRef.current = live;
  }, [live]);
  /** Local ids for messages the backend has not issued one for yet. */
  const nextLocalId = useRef(0);

  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    void messagesApi
      .threads()
      .then((res) => {
        if (cancelled) return;
        setTeacherThread(teacherThreadId(res.threads));
        setLive(toThreads(res.threads));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Opening a thread IS reading it, and the write is deliberate.
   *
   * The endpoint exists precisely so that clearing a badge is not a side
   * effect of the GET above - a prefetch must not be able to clear a child's
   * unread marker. The teacher console has called this since 1 Sep; the
   * child's Connect tab cleared `unread` on its LOCAL fixture array only, so
   * for a signed-in child the dot never cleared at all and came back on every
   * reload.
   *
   * The response is the updated thread, so the badge reconciles from what the
   * server says rather than from a local guess.
   */
  const markThreadRead = useCallback((threadId: string) => {
    setLive(
      (ts) => ts?.map((t) => (t.id === threadId ? { ...t, unread: false } : t)) ?? ts,
    );
    if (!getToken()) return;
    void messagesApi
      .markThreadRead(threadId)
      .then((updated) => {
        setLive(
          (ts) =>
            ts?.map((t) =>
              t.id === threadId ? { ...t, unread: updated.unread } : t,
            ) ?? ts,
        );
      })
      .catch(() => {});
  }, []);

  /** Where one thread's history read stands - see `Thread.history`. */
  const setHistory = useCallback(
    (threadId: string, history: Thread["history"]) =>
      setLive(
        (cur) =>
          cur?.map((t) => (t.id === threadId ? { ...t, history } : t)) ?? cur,
      ),
    [],
  );

  const openThread = useCallback(
    (threadId: string) => {
      if (!getToken() || requested.current.has(threadId)) return;
      requested.current.add(threadId);
      setHistory(threadId, "loading");
      void messagesApi
        .thread(threadId)
        .then((body) => {
          const fetched = body.messages.map<Message>((m) => ({
            id: m.messageId,
            who: selfId && m.senderId === selfId ? "me" : "them",
            text: m.content,
            status: "none",
          }));
          const known = new Set(fetched.map((m) => m.id));
          setLive(
            (cur) =>
              cur?.map((t) =>
                t.id === threadId
                  ? {
                      ...t,
                      history: "loaded" as const,
                      /*
                       * MERGED, NOT REPLACED. A child can send before the
                       * history lands, and this used to overwrite the thread
                       * wholesale - erasing the "Sending…" bubble, so a send
                       * that then failed had nothing left to mark and simply
                       * vanished. Our own messages still in flight or
                       * failed stay, after the history; one the server
                       * already holds is not drawn twice.
                       */
                      messages: [
                        ...fetched,
                        ...t.messages.filter(
                          (m) => m.status !== "none" && !known.has(m.id),
                        ),
                      ],
                    }
                  : t,
              ) ?? cur,
          );
        })
        .catch(() => {
          // Leave it unrequested so reopening - or Try again - retries.
          requested.current.delete(threadId);
          setHistory(threadId, "failed");
        });
    },
    [selfId, setHistory],
  );

  /** Mark one of our own messages, by id, within one thread. */
  const setStatus = useCallback(
    (threadId: string, messageId: string, next: Message["status"]) =>
      setLive(
        (cur) =>
          cur?.map((t) =>
            t.id === threadId
              ? {
                  ...t,
                  messages: t.messages.map((m) =>
                    m.id === messageId ? { ...m, status: next } : m,
                  ),
                }
              : t,
          ) ?? cur,
      ),
    [],
  );

  /**
   * POST the text, then settle the placeholder that is already on screen.
   *
   * The backend's own `messageId` replaces the local one on success, so a
   * later refetch of the thread does not render the same message twice.
   */
  const post = useCallback(
    async (threadId: string, localId: string, content: string) => {
      try {
        const saved = await messagesApi.reply(threadId, content);
        setLive(
          (cur) =>
            cur?.map((t) =>
              t.id === threadId
                ? {
                    ...t,
                    messages: t.messages.map((m) =>
                      m.id === localId
                        ? { ...m, id: saved.messageId, status: "delivered" }
                        : m,
                    ),
                  }
                : t,
            ) ?? cur,
        );
        return true;
      } catch {
        setStatus(threadId, localId, "failed");
        return false;
      }
    },
    [setStatus],
  );

  const reply = useCallback(
    async (threadId: string, content: string) => {
      const text = content.trim();
      if (!getToken() || !text) return false;
      // Local id only until the backend issues the real one.
      const localId = `pending-${nextLocalId.current++}`;
      setLive(
        (cur) =>
          cur?.map((t) =>
            t.id === threadId
              ? {
                  ...t,
                  messages: [
                    ...t.messages,
                    { id: localId, who: "me", text, status: "sending" },
                  ],
                }
              : t,
          ) ?? cur,
      );
      return post(threadId, localId, text);
    },
    [post],
  );

  const retry = useCallback(
    async (threadId: string, messageId: string) => {
      if (!getToken()) return false;
      const thread = liveRef.current?.find((t) => t.id === threadId);
      const message = thread?.messages.find((m) => m.id === messageId);
      if (!message) return false;
      setStatus(threadId, messageId, "sending");
      return post(threadId, messageId, message.text);
    },
    [post, setStatus],
  );

  /** Mark one of the first messages, by id. */
  const setFirstStatus = useCallback(
    (messageId: string, next: Message["status"]) =>
      setFirstMessages((cur) =>
        cur.map((m) => (m.id === messageId ? { ...m, status: next } : m)),
      ),
    [],
  );

  /**
   * POST a first message by direct creation, then read the list again.
   *
   * Backend B95, 9 Oct: `recipientType: "student"` with the child's OWN user
   * id, and the server routes it to a teacher of their class. Delivered only
   * once the write returns, failed when it is refused - the same life as a
   * reply. The bubble leaves this list only when the re-read list carries the
   * new thread, which then holds the message; if that read fails, the bubble
   * stays where it is, delivered, which is true.
   */
  const sendFirst = useCallback(
    async (localId: string, content: string): Promise<string | null> => {
      const self = getSession()?.userId;
      try {
        if (!self) throw new Error("no user id");
        const saved = await messagesApi.send({
          recipientType: "student",
          recipientId: self,
          content,
        });
        setFirstStatus(localId, "delivered");
        try {
          const res = await messagesApi.threads();
          setTeacherThread(teacherThreadId(res.threads));
          setLive(toThreads(res.threads));
          if (res.threads.some((t) => t.threadId === saved.threadId)) {
            setFirstMessages((cur) => cur.filter((m) => m.id !== localId));
          }
        } catch {
          // Sent, and the list did not answer: the bubble says delivered.
        }
        return saved.threadId;
      } catch {
        setFirstStatus(localId, "failed");
        return null;
      }
    },
    [setFirstStatus],
  );

  const start = useCallback(
    async (content: string) => {
      const text = content.trim();
      if (!getToken() || !text) return null;
      const localId = `pending-${nextLocalId.current++}`;
      setFirstMessages((cur) => [
        ...cur,
        { id: localId, who: "me", text, status: "sending" },
      ]);
      return sendFirst(localId, text);
    },
    [sendFirst],
  );

  const retryFirst = useCallback(
    async (messageId: string) => {
      if (!getToken()) return null;
      const message = firstRef.current.find((m) => m.id === messageId);
      if (!message) return null;
      setFirstStatus(messageId, "sending");
      return sendFirst(messageId, message.text);
    },
    [sendFirst, setFirstStatus],
  );

  if (!signedIn) {
    return {
      threads: THREADS,
      live: false,
      loading: false,
      failed: false,
      teacherThread: null,
      openThread,
      // Nothing behind the fixtures to mark, and the designed screens keep
      // their own local clear.
      markThreadRead: () => {},
      reply,
      retry,
      // The walkthrough always has threads, so it never shows the empty list.
      firstMessages: [],
      start,
      retryFirst,
    };
  }
  return {
    threads: live ?? [],
    live: true,
    loading: live === null && !failed,
    failed,
    teacherThread,
    openThread,
    markThreadRead,
    reply,
    retry,
    firstMessages,
    start,
    retryFirst,
  };
}
