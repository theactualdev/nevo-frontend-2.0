"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  messagesApi,
  type ChatMessage,
  type MessageThread,
  type RecipientType,
} from "@/lib/api/messages";
import { getSession, getToken } from "@/lib/auth/session";
import { THREADS, type Message } from "@/lib/mocks/teacherConnect";
import { useHasSession } from "./useHasSession";

/**
 * Connect's conversations, live from `/api/messages/*`.
 *
 * The thread list arrives without its messages, so a thread's body is fetched
 * when it is first opened and kept thereafter. Sending posts to
 * `POST /api/messages`, which finds or creates the school-scoped thread and
 * returns the stored message - so the bubble a teacher sees is the one the
 * backend actually saved, not an optimistic copy of it.
 *
 * WHAT THE CONTRACT DOES NOT CARRY. A thread has a `title` and nothing else
 * identifying: no class, no avatar. The fixtures show a class under each name;
 * a live thread simply does not, rather than guessing which class a student is
 * in.
 *
 * Fixtures back the designed screens only when the request genuinely fails,
 * and say so. A slow response still wins whenever it lands.
 *
 * `className`, `unread` and `unreadCount` all shipped on 31 Aug and are
 * wired: the row shows its class, unread threads are marked, and opening one
 * clears it through `POST /api/messages/threads/{id}/read`.
 */

export interface ConnectThread {
  id: string;
  studentName: string;
  initials: string;
  /** The thread's class. Live since 31 Aug; "" only on fixtures. */
  className: string;
  preview: string;
  time: string;
  messages: Message[];
  /** Null on fixtures; the send target for a live thread. */
  recipientId: string | null;
  recipientType: RecipientType | (string & {});
  /** Anything unread in this thread. */
  unread: boolean;
  unreadCount: number;
  /** Whether the body has been fetched yet. */
  loaded: boolean;
  /**
   * The body was asked for and the read failed. Not an empty conversation -
   * which is what it rendered as, under a composer inviting a reply to
   * messages the teacher could not see.
   */
  loadFailed?: boolean;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (parts[0] ?? "?").slice(0, 2).toUpperCase();
}

/** The frame's compact list stamp: "2m", "4h", "Tue". */
export function shortStamp(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.floor((Date.now() - then) / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function clockStamp(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toThread(t: MessageThread): ConnectThread {
  return {
    id: t.threadId,
    studentName: t.title,
    initials: initialsOf(t.title),
    className: t.className ?? "",
    preview: t.latestPreview ?? "",
    time: shortStamp(t.lastMessageAt),
    messages: [],
    recipientId: t.recipientId,
    recipientType: t.recipientType,
    unread: t.unread,
    unreadCount: t.unreadCount,
    loaded: false,
  };
}

function toMessage(m: ChatMessage, selfId: string | undefined): Message {
  const mine = Boolean(selfId && m.senderId === selfId);
  return {
    id: m.messageId,
    from: mine ? "teacher" : "student",
    label: mine ? undefined : (m.senderName ?? undefined),
    text: m.content,
    time: clockStamp(m.createdAt),
  };
}

const FIXTURE_THREADS: ConnectThread[] = THREADS.map((t) => ({
  ...t,
  recipientId: null,
  recipientType: "student",
  unread: false,
  unreadCount: 0,
  loaded: true,
}));

export interface ConnectState {
  threads: ConnectThread[];
  live: boolean;
  sample: boolean;
  loading: boolean;
  /** Fetch a thread's messages the first time it is opened. */
  openThread: (threadId: string) => void;
  /** Send into an existing thread, or start one with a student. */
  markThreadRead: (threadId: string) => void;
  send: (
    to: { recipientId: string; recipientType: RecipientType },
    content: string,
    about?: { name: string; className?: string },
  ) => Promise<string | null>;
}

export function useConnectThreads(): ConnectState {
  const [live, setLive] = useState<ConnectThread[] | null>(null);
  const [failed, setFailed] = useState(false);
  const signedIn = useHasSession();
  const loading = signedIn && live === null && !failed;
  const selfId = getSession()?.userId;

  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    // No timeout race: a thread list that arrives late is still the teacher's
    // real conversations, and discarding it to keep showing fixtures was the
    // bug this replaced.
    void messagesApi
      .threads()
      .then((res) => {
        if (!cancelled) setLive(res.threads.map(toThread));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Which bodies we have already asked for. A ref, not state, so that opening
  // a thread does not setState during render or inside an effect body - the
  // fetch's own callback is the only thing that updates.
  const requested = useRef<Set<string>>(new Set());

  const openThread = useCallback(
    (threadId: string) => {
      if (!getToken() || requested.current.has(threadId)) return;
      requested.current.add(threadId);
      void messagesApi
        .thread(threadId)
        .then((body) => {
          setLive(
            (cur) =>
              cur?.map((x) =>
                x.id === threadId
                  ? {
                      ...x,
                      loaded: true,
                      loadFailed: false,
                      // A body with no `messages` is a thread that exists and
                      // has nothing in it yet - the state a just-composed
                      // thread is in. Not a reason to take down Connect.
                      messages: (body.messages ?? []).map((m) =>
                        toMessage(m, selfId),
                      ),
                    }
                  : x,
              ) ?? cur,
          );
        })
        .catch(() => {
          // Let it be retried, and say it failed: reopening asks again, and
          // until then the thread says so rather than looking empty.
          requested.current.delete(threadId);
          setLive(
            (cur) =>
              cur?.map((x) =>
                x.id === threadId ? { ...x, loadFailed: true } : x,
              ) ?? cur,
          );
        });
    },
    [selfId],
  );

  /**
   * Clear one thread's unread state.
   *
   * The response is the updated thread, so the badge reconciles from what the
   * server says rather than from a local guess. Optimistic first, because the
   * teacher is looking at the thread either way - but a failure leaves the
   * server's own value in place on the next read rather than a stale zero.
   */
  const markThreadRead = useCallback((threadId: string) => {
    setLive((ts) =>
      ts?.map((t) =>
        t.id === threadId ? { ...t, unread: false, unreadCount: 0 } : t,
      ) ?? ts,
    );
    if (!getToken()) return;
    void messagesApi
      .markThreadRead(threadId)
      .then((updated) => {
        setLive((ts) =>
          ts?.map((t) =>
            t.id === threadId
              ? { ...t, unread: updated.unread, unreadCount: updated.unreadCount }
              : t,
          ) ?? ts,
        );
      })
      .catch(() => {});
  }, []);

  const send = useCallback(
    async (
      to: { recipientId: string; recipientType: RecipientType },
      content: string,
      /**
       * Who the thread is with, when the caller knows - the compose picker
       * does. A brand-new thread has no row of its own until the list is read
       * again, and the send response names only its AUTHOR.
       */
      about?: { name: string; className?: string },
    ): Promise<string | null> => {
      try {
        const saved = await messagesApi.send({ ...to, content });
        const msg = toMessage(saved, selfId);
        setLive((ts) => {
          const existing = ts?.find((t) => t.id === saved.threadId);
          if (!ts) return ts;
          if (existing) {
            return ts.map((t) =>
              t.id === saved.threadId
                ? {
                    ...t,
                    preview: `You: ${content}`,
                    time: "now",
                    messages: [...t.messages, msg],
                  }
                : t,
            );
          }
          return [
            {
              id: saved.threadId,
              /*
               * NOT `senderName` (T162). That is the message's author - the
               * teacher - so a conversation they started with a child was
               * titled with their own name, and their initials, until a
               * reload. The picker knew the child; it was not passed.
               */
              studentName: about?.name ?? "New conversation",
              initials: initialsOf(about?.name ?? "?"),
              className: about?.className ?? "",
              preview: `You: ${content}`,
              time: "now",
              messages: [msg],
              recipientId: to.recipientId,
              recipientType: to.recipientType,
              // A thread the teacher just started by writing in it.
              unread: false,
              unreadCount: 0,
              loaded: true,
            },
            ...ts,
          ];
        });
        return saved.threadId;
      } catch {
        return null;
      }
    },
    [selfId],
  );

  if (live === null) {
    return {
      threads: FIXTURE_THREADS,
      live: false,
      sample: failed,
      loading,
      openThread,
      send,
      markThreadRead,
    };
  }
  return {
    threads: live,
    live: true,
    sample: false,
    loading,
    openThread,
    send,
    markThreadRead,
  };
}
