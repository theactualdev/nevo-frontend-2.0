"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronLeft, Send } from "lucide-react";
import { NevoKeyboard, useNevoKeyboardDock } from "@/components/shared";
import { SampleRegion } from "@/components/shared/SampleRegion";
import { useHydrated } from "@/hooks/useHydrated";
import {
  MESSAGE_MAX_LENGTH,
  useStudentThreads,
} from "@/hooks/useStudentThreads";
import { cn } from "@/lib/utils";
import { THREADS, type Message, type Thread } from "./connectData";

/** Simulated delivery latency for an optimistic message. */
const DELIVER_MS = 1100;

/**
 * Whether both panes are on screen - the `md` breakpoint the layout below
 * uses. Read in JS because it decides something CSS cannot: whether the
 * conversation is actually in front of the child, and so whether opening it
 * (which marks it read on the server) is something they did.
 */
const TWO_PANE = "(min-width: 768px)";
function subscribeTwoPane(onChange: () => void): () => void {
  const mq = window.matchMedia(TWO_PANE);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const twoPaneNow = () => window.matchMedia(TWO_PANE).matches;
/** The server cannot know the width; one pane is the safe guess. */
const twoPaneOnServer = () => false;

/**
 * Connect Tab (screen 25) — the student's messages with their teacher (and,
 * once the teacher adds one, a parent). Two panes on tablet/desktop (thread list
 * + conversation); a single pane with a back button on mobile.
 *
 * Threads, messages AND replies are live from `/api/messages/*`. Sending was
 * switched off here for a real reason - `POST /api/messages` has no `teacher`
 * recipient type, so a child could not address their teacher at all - and
 * `POST /messages/threads/{id}/reply` (3 Sep) is what opened it: a child writes
 * into a thread they can already read, and still cannot start one.
 *
 * The signed-out walkthrough keeps its SIMULATED send. That is deliberate:
 * those threads are fixtures with no backend behind them, so a composer that
 * posted for real would have nowhere to post to.
 */
export function ConnectTab({
  threadId,
  toTeacher = false,
}: {
  /**
   * `?thread=`, read by the page: open this conversation rather than the
   * first one. An id that is not in the list falls back to the list, never to
   * someone else's conversation on a phone.
   */
  threadId?: string;
  /**
   * `?to=teacher`, from Ask Nevo's "Message my teacher": open the child's
   * conversation with their teacher (design D109). Ask Nevo cannot name the
   * thread, so it is found in the list once the list arrives - see
   * `teacherThreadId`. With no such thread, Connect opens as it always has.
   */
  toTeacher?: boolean;
} = {}) {
  // Live threads read from the API; the fixtures back the designed screens
  // and keep their simulated send.
  const {
    threads: sourceThreads,
    live,
    loading,
    failed,
    teacherThread,
    openThread: fetchThread,
    markThreadRead,
    reply: sendLive,
    retry: retryLive,
  } = useStudentThreads();
  // Seeded from the fixtures themselves, not from whatever the hook returned
  // on the first render: for a signed-in child that is the still-empty live
  // list, and signing out under a mounted tab then left no thread to show.
  const [fixtureThreads, setFixtureThreads] = useState<Thread[]>(THREADS);
  const threads = live ? sourceThreads : fixtureThreads;
  const setThreads = setFixtureThreads;
  const [activeId, setActiveId] = useState<string>(threadId ?? "");
  // Mobile only: which pane is showing. A deep link opens the conversation.
  const [mobileView, setMobileView] = useState<"list" | "thread">(
    threadId || toTeacher ? "thread" : "list",
  );
  const twoPane = useSyncExternalStore(
    subscribeTwoPane,
    twoPaneNow,
    twoPaneOnServer,
  );
  const [draft, setDraft] = useState("");
  const kb = useNevoKeyboardDock();
  // The server cannot see the token, so `live` is false for the first render
  // of a signed-in child. That used to mean a frame of someone else's threads;
  // now that the composer is real it would mean worse - the child could type
  // into a FIXTURE thread and `send()` would take the simulated branch and
  // tell them it was delivered. Nothing renders until we know who is looking.
  const hydrated = useHydrated();

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const nextId = useRef(0);
  useEffect(() => {
    const active = timers.current;
    return () => active.forEach(clearTimeout);
  }, []);

  // Derived, not assigned: the live list arrives after mount, and setting a
  // default from an effect is the setState-in-effect the codebase rules out.
  // The teacher's conversation is derived the same way, and a thread the
  // child taps (or a `?thread=`) still wins over it.
  const wantedId = activeId || (toTeacher ? (teacherThread ?? "") : "");
  const picked = threads.find((t) => t.id === wantedId);
  const active = picked ?? threads[0];
  // A phone shows a conversation only once one was actually chosen.
  const view = mobileView === "thread" && picked ? "thread" : "list";
  /*
   * IS THE CONVERSATION IN FRONT OF THE CHILD? On a tablet or desktop the
   * first thread opens beside the list; on a phone nothing opens until it is
   * tapped. This decides the fetch, the read mark and the highlight - which
   * used to disagree: `activeId` stayed "" on a tablet, so the open thread
   * was fetched (and the server marked it read) while its row stayed
   * unhighlighted with its unread dot on.
   */
  const shown = twoPane || view === "thread";
  const shownId = live && shown && active ? active.id : null;

  // The list endpoint carries no message bodies, so opening one fetches it.
  //
  // ONLY WHEN LIVE. `useHasSession()` is false during hydration, so for one
  // render a signed-in child gets the FIXTURE list - and this effect then
  // asked the live API for a fixture thread id (`ms-okafor`), which is not a
  // UUID and came back 422 on every visit to Connect. Silent to the child,
  // but it is fixture data reaching the backend, which is the thing this
  // whole pass has been removing.
  //
  // AND ONLY WHEN SHOWN. The GET marks a thread read on the server, so on a
  // phone it fetched - and read - the first thread while the child was still
  // looking at the list.
  useEffect(() => {
    if (shownId) fetchThread(shownId);
  }, [shownId, fetchThread]);

  // A thread opened for the child beside the list has been read, the same as
  // one they tapped: the dot clears, by the deliberate write.
  const shownUnread = Boolean(shownId && active?.unread);
  useEffect(() => {
    if (shownId && shownUnread) markThreadRead(shownId);
  }, [shownId, shownUnread, markThreadRead]);

  const setMessages = (threadId: string, fn: (m: Message[]) => Message[]) =>
    setThreads((ts) =>
      ts.map((t) =>
        t.id === threadId ? { ...t, messages: fn(t.messages) } : t,
      ),
    );

  const deliverLater = (threadId: string, msgId: string) => {
    timers.current.push(
      setTimeout(
        () =>
          setMessages(threadId, (m) =>
            m.map((x) => (x.id === msgId ? { ...x, status: "delivered" } : x)),
          ),
        DELIVER_MS,
      ),
    );
  };

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    // Live: the hook owns the message's whole life, including its failure.
    // Fixtures: no backend to post to, so the delivery stays simulated.
    if (live) {
      setDraft("");
      void sendLive(active.id, text);
      return;
    }
    const id = `m-${nextId.current++}`;
    setMessages(active.id, (m) => [
      ...m,
      { id, who: "me", text, status: "sending" },
    ]);
    setDraft("");
    deliverLater(active.id, id);
  };

  const retry = (msgId: string) => {
    if (live) {
      void retryLive(active.id, msgId);
      return;
    }
    setMessages(active.id, (m) =>
      m.map((x) => (x.id === msgId ? { ...x, status: "sending" } : x)),
    );
    deliverLater(active.id, msgId);
  };

  const openThread = (id: string) => {
    setActiveId(id);
    /*
     * This cleared the dot on the FIXTURE array only - `setThreads` is
     * `setFixtureThreads` - so a signed-in child's unread marker never moved
     * and came back on every reload. The live clear is the write below, which
     * the teacher console has made since the endpoint shipped.
     */
    setThreads((ts) =>
      ts.map((t) => (t.id === id ? { ...t, unread: false } : t)),
    );
    markThreadRead(id);
    setMobileView("thread");
  };

  // A live student can genuinely have no threads, which the fixtures never
  // could - and every pane below assumes an active one.
  if (!hydrated || (live && (loading || failed || !active))) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="px-5 pt-5 pb-3">
          <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-nevo-near-black">
            Connect
          </h1>
        </div>
        {!hydrated || loading ? (
          /* Not yet hydrated is a kind of loading, not an empty inbox: falling
             through to the empty state here would tell a child their teacher
             had never written to them, before we had even looked. */
          <div className="space-y-2 px-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-[62px] animate-pulse rounded-[12px] bg-nevo-cream-elevated"
              />
            ))}
          </div>
        ) : failed ? (
          /* A failed read is NOT an empty inbox. Saying "no messages yet" here
             tells a child their teacher never wrote to them, which we do not
             know and which is the crueller of the two guesses. */
          <div className="flex flex-1 flex-col items-center justify-center px-10 pb-10 text-center">
            <p className="text-[17px] font-medium text-nevo-near-black">
              We couldn&rsquo;t load your messages
            </p>
            <p className="mt-2 max-w-[300px] text-[15px] leading-[1.5] text-nevo-near-black/62">
              Nothing is lost. Give it a moment and try again.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 h-[46px] cursor-pointer rounded-[10px] bg-nevo-navy px-6 text-[15px] font-medium text-nevo-cream"
            >
              Try again
            </button>
          </div>
        ) : (
          // 29 Empty States, "Connect (No relationship)": one line.
          <div className="flex flex-1 flex-col items-center justify-center px-10 pb-10 text-center">
            <h2 className="max-w-[280px] text-[19px] font-medium leading-[1.35] text-nevo-near-black">
              Your teacher will be able to message you here soon
            </h2>
          </div>
        )}
      </div>
    );
  }

  // Fixtures carry their messages inline; a live thread is loading until its
  // history read says otherwise.
  const history = live ? (active.history ?? "loading") : "loaded";

  // Held, not returned: this markup renders a real child's threads AND the
  // signed-out fixture conversation, and only the second is sample data. The
  // fixture branch also keeps the SIMULATED send, so a mark here says "nothing
  // you type on this screen goes anywhere" as much as "these are not yours".
  const body = (
    <div className="flex h-full min-h-0">
      {/* Thread list — always on md+, on mobile only in list view */}
      <aside
        className={cn(
          "w-full shrink-0 flex-col border-nevo-near-black/8 md:flex md:w-[300px] md:border-r",
          view === "list" ? "flex" : "hidden",
        )}
      >
        <div className="px-5 pt-5 pb-3">
          <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-nevo-near-black">
            Connect
          </h1>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3">
          {threads.map((thread) => {
            const selected = shown && thread.id === active?.id;
            return (
              <button
                key={thread.id}
                type="button"
                // Opening it fetches it: see the effect on `shownId`.
                onClick={() => openThread(thread.id)}
                aria-current={selected}
                className={cn(
                  "mb-0.5 flex w-full cursor-pointer items-center gap-3 rounded-[12px] p-3 text-left transition-colors",
                  selected
                    ? "bg-nevo-violet/16"
                    : "hover:bg-nevo-near-black/[0.04]",
                )}
              >
                <Avatar thread={thread} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-[15px] font-medium text-nevo-near-black">
                      {thread.name}
                    </span>
                    {/* The frame's rule: never on the open conversation. */}
                    {thread.unread && !selected && (
                      <span
                        role="img"
                        aria-label="Unread"
                        className="size-1.5 rounded-full bg-nevo-violet"
                      />
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] text-nevo-near-black/60">
                    {/* Once opened, the newest real message; before that, the
                        list's own preview - which is all a live row has. No
                        preview means no messages (29 Empty States). */}
                    {thread.messages[thread.messages.length - 1]?.text ??
                      thread.preview ??
                      "No messages yet"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Conversation — always on md+, on mobile only in thread view */}
      <section
        className={cn(
          "min-w-0 flex-1 flex-col md:flex",
          view === "thread" ? "flex" : "hidden",
        )}
      >
        <header className="relative flex h-14 shrink-0 items-center justify-center border-b border-nevo-near-black/8">
          <button
            type="button"
            aria-label="Back to messages"
            onClick={() => setMobileView("list")}
            className="absolute left-2 flex size-11 cursor-pointer items-center justify-center rounded-[10px] transition-colors hover:bg-nevo-near-black/[0.06] md:hidden"
          >
            <ChevronLeft
              className="size-6 text-nevo-near-black"
              strokeWidth={2}
            />
          </button>
          <span className="text-base font-medium text-nevo-near-black">
            {active.name}
          </span>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-5">
          {/* Loading and failed are not "no messages". Our own messages in
              flight or failed still show below either, with their retry. */}
          {history === "loading" && (
            <div aria-label="Loading messages" className="space-y-2.5">
              <div className="h-10 w-3/5 animate-pulse rounded-2xl bg-nevo-cream-elevated" />
              <div className="ml-auto h-10 w-2/5 animate-pulse rounded-2xl bg-nevo-cream-elevated" />
            </div>
          )}
          {history === "failed" && (
            <div className="m-auto flex flex-col items-center px-6 text-center">
              <p className="text-[15px] font-medium text-nevo-near-black">
                We couldn&rsquo;t load these messages
              </p>
              <p className="mt-1.5 max-w-[280px] text-sm leading-[1.5] text-nevo-near-black/62">
                Nothing is lost. Give it a moment and try again.
              </p>
              <button
                type="button"
                onClick={() => fetchThread(active.id)}
                className="mt-4 h-11 cursor-pointer rounded-[10px] bg-nevo-navy px-5 text-[15px] font-medium text-nevo-cream"
              >
                Try again
              </button>
            </div>
          )}
          {history === "loaded" && active.messages.length === 0 && (
            // 29 Empty States, "Connect (No messages)".
            <p className="m-auto text-[15px] text-nevo-near-black/55">
              Message your teacher here
            </p>
          )}
          {active.messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              onRetry={() => retry(message.id)}
            />
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2.5 border-t border-nevo-near-black/8 px-4 py-3">
          <input
            value={draft}
            onChange={(e) =>
              setDraft(e.target.value.slice(0, MESSAGE_MAX_LENGTH))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                send();
              }
            }}
            onFocus={kb.onFocus}
            onBlur={kb.onBlur}
            // The contract caps `content` at 5000. Held at the input rather
            // than rejected on send: a child should not lose a long message
            // to a limit nothing told them about.
            maxLength={MESSAGE_MAX_LENGTH}
            // A.12: Nevo Keyboard on touch; hardware keyboard on desktop.
            inputMode="none"
            placeholder="Type a message"
            aria-label={`Message ${active.name}`}
            className="h-11 flex-1 rounded-full border-[1.5px] border-nevo-near-black/16 bg-nevo-cream px-4 text-[15px] text-nevo-near-black outline-none transition-colors focus:border-nevo-navy"
          />
          <button
            type="button"
            aria-label="Send"
            onClick={send}
            className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-nevo-navy text-nevo-cream transition-transform active:scale-[0.98]"
          >
            <Send className="size-5" strokeWidth={2} />
          </button>
        </div>

        {/* Message entry on touch - docked below the composer so it stays
            visible. `data-nevo-hide-nav` takes the bottom nav down while it
            is up (StudentShell), as the frame draws it and as Lessons'
            overlaid keyboard already does: two stacked trays left the
            conversation a sliver on a phone. */}
        {kb.open && (
          <div data-nevo-hide-nav className="contents">
            <NevoKeyboard
              layout="qwerty"
              // Clamped here too, not just on the input. `inputMode="none"`
              // means this keyboard IS the way a child types on a tablet, so a
              // cap enforced only by the input's `maxLength` is no cap at all -
              // it would let them past 5000 and the send would 422 on them.
              onKey={(c) => setDraft((d) => (d + c).slice(0, MESSAGE_MAX_LENGTH))}
              onBackspace={() => setDraft((d) => d.slice(0, -1))}
              onReturn={send}
              className="shrink-0"
            />
          </div>
        )}
      </section>
    </div>
  );

  return live ? (
    body
  ) : (
    <SampleRegion kind="student:connect">{body}</SampleRegion>
  );
}

function Avatar({ thread }: { thread: Thread }) {
  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-nevo-cream",
        thread.accent === "navy" ? "bg-nevo-navy" : "bg-nevo-violet",
      )}
    >
      {thread.initials}
    </span>
  );
}

function MessageBubble({
  message,
  onRetry,
}: {
  message: Message;
  onRetry: () => void;
}) {
  const me = message.who === "me";
  return (
    <div
      className={cn(
        "flex flex-col gap-1 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300",
        me ? "items-end" : "items-start",
      )}
    >
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-[1.4] text-nevo-near-black",
          me
            ? "rounded-br-[5px] bg-nevo-navy/15"
            : "rounded-bl-[5px] border border-nevo-violet/50 bg-nevo-cream",
          message.status === "failed" && "opacity-60",
        )}
      >
        {message.text}
      </div>
      {me && message.status !== "none" && (
        <MessageStatusLine message={message} onRetry={onRetry} />
      )}
    </div>
  );
}

function MessageStatusLine({
  message,
  onRetry,
}: {
  message: Message;
  onRetry: () => void;
}) {
  if (message.status === "sending") {
    return (
      <span className="flex items-center gap-1.5 px-1 text-xs text-nevo-near-black/50">
        <span className="block size-3 rounded-full border-2 border-nevo-navy/25 border-t-nevo-navy motion-safe:animate-spin motion-safe:[animation-duration:700ms]" />
        Sending…
      </span>
    );
  }
  if (message.status === "delivered") {
    return (
      <span className="px-1 text-xs text-nevo-near-black/45">Delivered</span>
    );
  }
  // failed — warm, never alarming; tap to retry.
  return (
    <button
      type="button"
      onClick={onRetry}
      className="flex cursor-pointer items-center gap-1.5 px-1 text-xs text-nevo-violet"
    >
      <span className="size-1.5 rounded-full bg-nevo-violet" />
      Didn&apos;t send - tap to try again
    </button>
  );
}
