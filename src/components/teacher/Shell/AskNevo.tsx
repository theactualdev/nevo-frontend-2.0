"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  askNevoApi,
  asUuid,
  recentThreads,
  type ThreadSummary,
  type ThreadTranscript,
} from "@/lib/api";
import { getToken } from "@/lib/auth/session";
import {
  ASK_NEVO_CONTEXTS,
  CANNOT_HELP_LINE,
  contextForPath,
  contextIdsFor,
  liveContextFor,
  liveStripFor,
  OUT_OF_SCOPE,
  stripForPath,
} from "@/lib/mocks/teacherAskNevo";
import { useHasSession } from "@/hooks/useHasSession";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { MOCK_TEACHER } from "./teacherNav";

/**
 * Ask Nevo (`Nevo Teacher Ask`) - a reusable overlay dropped onto every
 * console screen, not a standalone surface. Rebuilt against the rewritten
 * component frame: the launcher is a labelled pill rather than a circle, the
 * panel is a full-height right-edge sheet, and a violet context strip under
 * the header names what the teacher is looking at.
 *
 * Live-first: the assistant is asked before the canned turn, capped so a cold
 * backend can't hang the drawer, and a stand-in answer says it is one.
 *
 * The frame's thinking beat is 850ms (0 under reduced motion); the live cap
 * runs alongside it so a fast answer still lands after the beat.
 */

const THINKING_MS = 850;

/**
 * CONVERSATION HISTORY (C15 §"Conversation history"). The frame's own words:
 * "A quiet clock icon in the drawer's top bar opens a flat, most-recent-first
 * list of past conversations inside the same panel: no new screen, no modal.
 * Tapping an entry opens it read-only, with the prompt field still there to
 * start something new. Nothing older than 90 days, up to 50 entries,
 * scrollable. No search, folders, or filters."
 *
 * Three modes in one panel, which is why this is a mode and not a route.
 */
type Mode = "chat" | "history" | "historyItem";

/** "4 Sep 2026", matching the frame's sample rows. */
function historyDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const HISTORY_ICON = (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.2 1.8" />
  </svg>
);

const SHEET = "w-[460px] xl:w-[468px]";

type Turn =
  | { kind: "question"; text: string }
  | {
      kind: "answer";
      text: string;
      action?: { label: string; href: string };
      /** Present only on a REAL answer - what the vote is cast against. */
      interactionId?: string;
      vote?: 1 | -1;
    }
  | { kind: "cannothelp" }
  /** A signed-in question that got no answer. Not a sample - nothing at all. */
  | { kind: "failed" };

const SPARKLE = (size: number) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 2l1.6 4.8L18 8.4l-4.4 1.6L12 15l-1.6-5L6 8.4l4.4-1.6z" />
    <circle cx="18.5" cy="17.5" r="2.2" />
  </svg>
);

export function AskNevo() {
  const pathname = usePathname() ?? "";
  /**
   * THE SERVER'S thread id, not one we made up.
   *
   * This was `useRef(randomId())`, which minted a v4 UUID the backend had never
   * issued and sent it as `contextIds.threadId` on every turn. `asUuid` let it
   * through because it IS a valid UUID, so nothing ever failed loudly - but the
   * thread the server stored had its own id, and the history list below could
   * never have matched a conversation back to the drawer that created it.
   *
   * Null until the first answer comes back carrying one. A first turn has no
   * thread to continue, which is exactly what null says.
   */
  const threadId = useRef<string | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("chat");
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
  const [threadsFailed, setThreadsFailed] = useState(false);
  const [item, setItem] = useState<ThreadTranscript | null>(null);
  const [itemFailed, setItemFailed] = useState(false);
  const signedIn = useHasSession();
  const identity = useCurrentUser();
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [thinking, setThinking] = useState(false);
  const alive = useRef(true);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const pending = timers.current;
    alive.current = true;
    return () => {
      alive.current = false;
      pending.forEach(clearTimeout);
    };
  }, []);

  const context = contextForPath(pathname);
  // The frame's people stay on the walkthrough. A signed-in teacher is shown
  // the screen and "this student", never an invented name - see
  // `liveContextFor`.
  const data = signedIn ? liveContextFor(context) : ASK_NEVO_CONTEXTS[context];
  const strip = signedIn ? liveStripFor(context) : stripForPath(context, pathname);

  // Closing resets the transcript, per the frame - and with it the thread, or
  // the next question would silently continue a conversation the teacher
  // believes they have closed.
  const close = () => {
    setOpen(false);
    setTurns([]);
    setDraft("");
    setThinking(false);
    setMode("chat");
    setItem(null);
    threadId.current = null;
  };

  /**
   * Past conversations. Re-read on every open rather than cached, because the
   * turn the teacher just finished should be in the list they open next.
   *
   * There is nothing to fall back TO here, and that is the point: a fixture
   * roster is a lie a teacher can spot, but a fixture CONVERSATION is one they
   * cannot - it would look exactly like something they had said. So a failed
   * read says it failed, and an empty list says it is empty.
   */
  const openHistory = () => {
    setMode("history");
    setThreads(null);
    setThreadsFailed(false);
    if (!getToken()) {
      // Signed out there is no history, which the empty state states plainly.
      setThreads([]);
      return;
    }
    void askNevoApi
      .threads()
      .then((list) => {
        if (!alive.current) return;
        setThreads(recentThreads(list ?? [], Date.now()));
      })
      .catch(() => {
        if (!alive.current) return;
        setThreadsFailed(true);
      });
  };

  const openItem = (summary: ThreadSummary) => {
    setMode("historyItem");
    setItem(null);
    setItemFailed(false);
    void askNevoApi
      .thread(summary.threadId)
      .then((full) => {
        if (!alive.current) return;
        setItem(full);
      })
      .catch(() => {
        if (!alive.current) return;
        setItemFailed(true);
      });
  };

  // One back button, two destinations: an open conversation returns to the
  // list, the list returns to the chat the teacher left.
  const back = () => {
    if (mode === "historyItem") {
      setMode("history");
      setItem(null);
      setItemFailed(false);
      return;
    }
    setMode("chat");
  };

  const cannedFor = (question: string): Turn => {
    if (OUT_OF_SCOPE.test(question)) return { kind: "cannothelp" };
    return { kind: "answer", text: data.answer, action: data.action };
  };

  const ask = (raw: string) => {
    const question = raw.trim();
    if (!question || thinking) return;
    setDraft("");
    // "with the prompt field still there to start something new" - asking from
    // a past conversation starts a NEW one rather than appending to the
    // read-only transcript on screen.
    setMode("chat");
    setTurns((ts) => [...ts, { kind: "question", text: question }]);
    setThinking(true);
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "end" }));

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const beat = new Promise<void>((resolve) =>
      timers.current.push(setTimeout(resolve, reduced ? 0 : THINKING_MS)),
    );
    /*
     * NO RACE. This used to run the question against a 15s cap and take
     * whichever finished first, so a real answer arriving at 15.1s was thrown
     * away and a CANNED one shown in its place. A teacher who asked something
     * hard - the questions most worth asking - was the most likely to get a
     * stand-in instead of the answer Nevo had actually produced.
     *
     * Same bug as the notification feed and the four hooks in PR #148. Only a
     * genuine failure falls back, and it says so.
     */
    const live = askNevoApi
      .ask({
        role: "teacher",
        currentPage: pathname,
        // The record on screen, so the answer is about THIS student, class
        // or lesson. The routes have carried real ids all along; the drawer
        // sent only the thread.
        contextIds: {
          ...contextIdsFor(pathname),
          threadId: asUuid(threadId.current),
        },
        question,
      })
      .catch(() => null);

    void Promise.all([live, beat]).then(([res]) => {
      if (!alive.current) return;
      // Adopt the server's thread so the NEXT turn continues this conversation
      // and the history list can find it. Only ever widened from null: a
      // response without one must not wipe a thread we already hold.
      if (res?.threadId) threadId.current = res.threadId;
      setTurns((ts) => [
        ...ts,
        res
          ? {
              kind: "answer",
              // A structured answer's `answer` carries its markup; the
              // contract gives `plainText` for a client that renders one
              // paragraph, which this bubble is.
              text:
                res.answerFormat === "structured" && res.plainText
                  ? res.plainText
                  : res.answer,
              // Kept so the vote below has something to post against; a
              // canned answer has no interaction and gets no vote.
              interactionId: res.interactionId,
            }
          : /*
             * NOT A SAMPLE ANSWER. A signed-in teacher whose question failed
             * was shown the frame's canned reply - "Tunde stalled on
             * Tuesday... eight in JSS 2A slowed", with a button to a profile
             * that does not exist - under one italic line. An answer about
             * invented children, in the voice of the assistant, is the worst
             * thing this drawer can say. It says the question did not land.
             */
            getToken()
            ? { kind: "failed" as const }
            : cannedFor(question),
      ]);
      setThinking(false);
      requestAnimationFrame(() =>
        endRef.current?.scrollIntoView({ block: "end" }),
      );
    });
  };

  /**
   * C01's helpfulness vote. Optimistic on purpose - the teacher's own mark is
   * the point, and a failed write should not snatch it back - but it is only
   * ever offered on a REAL answer, so a vote always has an interaction behind
   * it. Toggling the same thumb clears it, per the frame.
   */
  const vote = (index: number, value: 1 | -1) => {
    setTurns((ts) =>
      ts.map((t, i) =>
        i === index && t.kind === "answer"
          ? { ...t, vote: t.vote === value ? undefined : value }
          : t,
      ),
    );
    const turn = turns[index];
    if (turn?.kind !== "answer" || !turn.interactionId) return;
    if (turn.vote === value) return; // clearing - nothing to record
    void askNevoApi
      .recordHelpfulness(turn.interactionId, value === 1)
      .catch(() => {});
  };

  const showEntry = turns.length === 0 && !thinking;

  return (
    <>
      {!open && (
        <button
          type="button"
          aria-label="Ask Nevo"
          title="Ask Nevo"
          onClick={() => setOpen(true)}
          className="fixed right-6 bottom-6 z-30 flex h-[52px] cursor-pointer items-center gap-2.5 rounded-full bg-nevo-navy px-[22px] text-[15px] font-medium text-nevo-cream shadow-[0_8px_32px_rgba(0,0,0,0.16)] transition-[transform,filter] duration-[140ms] hover:brightness-108 active:scale-105"
        >
          {SPARKLE(22)}
          Ask Nevo
        </button>
      )}

      {open && (
        <>
          <div
            onClick={close}
            className="fixed inset-0 z-40 bg-nevo-near-black/28 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Ask Nevo"
            className={`fixed inset-y-0 right-0 z-50 flex flex-col bg-nevo-cream shadow-[-8px_0_32px_rgba(0,0,0,0.16)] motion-safe:animate-nevo-sheet-r ${SHEET}`}
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-nevo-near-black/8 px-[22px] pt-5 pb-4">
              <div className="flex items-center gap-[11px]">
                <span className="flex size-8 items-center justify-center rounded-full bg-nevo-navy text-nevo-cream">
                  {SPARKLE(17)}
                </span>
                <div className="flex flex-col">
                  <span className="text-[18px] leading-[1.1] font-medium tracking-[-0.01em] text-nevo-near-black">
                    Ask Nevo
                  </span>
                  {/* Real for a live session; the fixture only backs the
                      signed-out preview of the frame. */}
                  {(signedIn ? identity?.school : MOCK_TEACHER.school) && (
                    <span className="mt-0.5 text-[12.5px] text-nevo-near-black/68">
                      {signedIn ? identity?.school : MOCK_TEACHER.school}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
              {mode === "chat" && (
                <button
                  type="button"
                  aria-label="Past conversations"
                  title="Past conversations"
                  onClick={openHistory}
                  className="flex size-[34px] cursor-pointer items-center justify-center rounded-lg text-nevo-navy transition-transform duration-[120ms] active:scale-[0.98]"
                >
                  {HISTORY_ICON}
                </button>
              )}
              <button
                type="button"
                aria-label="Close"
                onClick={close}
                className="flex size-[34px] cursor-pointer items-center justify-center rounded-lg transition-transform duration-[120ms] active:scale-[0.98]"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" stroke="#2b2b2f" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
              </div>
            </div>

            {/* Past conversations bar - replaces the context strip, per the
                frame: in history the teacher is not looking at a screen, so
                naming one would be wrong. */}
            {mode !== "chat" && (
              <div className="flex shrink-0 items-center gap-2.5 border-b border-nevo-violet/18 bg-nevo-violet/10 px-4 py-[9px]">
                <button
                  type="button"
                  aria-label="Back"
                  onClick={back}
                  className="flex size-[34px] shrink-0 cursor-pointer items-center justify-center rounded-lg transition-transform duration-[120ms] active:scale-[0.98]"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2b2b2f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </button>
                <span className="text-[15px] font-semibold tracking-[-0.01em] text-nevo-near-black">
                  Past conversations
                </span>
              </div>
            )}

            {/* Context strip - what the teacher is looking at. Absent when
                it could only have named a record it does not know. */}
            {mode === "chat" && strip && (
            <div className="flex shrink-0 items-center gap-[9px] border-b border-nevo-violet/18 bg-nevo-violet/10 px-[22px] py-[11px]">
              <span className="shrink-0 text-nevo-navy">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                  <circle cx="12" cy="12" r="2.6" />
                </svg>
              </span>
              <span className="text-[12.5px] leading-[1.35] text-nevo-navy">
                {strip}
              </span>
            </div>
            )}

            {/* Body */}
            <div className="min-h-0 flex-1 overflow-y-auto p-[22px]">
              {mode === "history" ? (
                <HistoryList
                  threads={threads}
                  failed={threadsFailed}
                  onOpen={openItem}
                  onRetry={openHistory}
                />
              ) : mode === "historyItem" ? (
                <HistoryItem transcript={item} failed={itemFailed} />
              ) : showEntry ? (
                <>
                  <p className="mb-1.5 text-[15px] font-semibold text-nevo-near-black">
                    {data.lead}
                  </p>
                  <p className="mb-4 text-[13.5px] leading-[1.5] text-nevo-near-black/72">
                    {data.sub}
                  </p>
                  <div className="flex flex-col gap-[9px]">
                    {data.chips.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => ask(chip)}
                        className="flex cursor-pointer items-center gap-2.5 rounded-xl border-[1.5px] border-nevo-violet/60 bg-nevo-violet/6 px-[15px] py-3 text-left text-[14px] leading-[1.35] text-nevo-navy transition-[transform,background-color] duration-[120ms] hover:bg-nevo-violet/14 active:scale-[0.98]"
                      >
                        <span className="shrink-0 text-nevo-navy/55">→</span>
                        {chip}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex flex-col">
                  {turns.map((t, i) =>
                    t.kind === "question" ? (
                      <div key={i} className={i > 0 ? "mt-3.5 flex justify-end" : "flex justify-end"}>
                        <div className="max-w-[82%] rounded-[14px_14px_4px_14px] bg-nevo-navy px-[15px] py-[11px]">
                          <p className="text-[14.5px] leading-[1.45] text-nevo-cream">
                            {t.text}
                          </p>
                        </div>
                      </div>
                    ) : t.kind === "answer" ? (
                      <div key={i} className="mt-3.5 flex justify-start">
                        <div className="max-w-[88%] rounded-[14px_14px_14px_4px] border border-nevo-violet/35 bg-nevo-violet/15 px-4 py-3.5">
                          <p className="text-[14.5px] leading-[1.6] text-nevo-near-black">
                            {t.text}
                          </p>
                          {t.interactionId && (
                            <div className="mt-[11px] flex items-center justify-end gap-1 border-t border-nevo-near-black/9 pt-[9px]">
                              {([1, -1] as const).map((v) => {
                                const on = t.vote === v;
                                return (
                                  <button
                                    key={v}
                                    type="button"
                                    aria-label={v === 1 ? "Helpful" : "Not helpful"}
                                    aria-pressed={on}
                                    title={v === 1 ? "Helpful" : "Not helpful"}
                                    onClick={() => vote(i, v)}
                                    className="inline-flex size-[30px] cursor-pointer items-center justify-center rounded-lg transition-transform duration-[120ms] active:scale-[0.98]"
                                  >
                                    <svg
                                      width="19"
                                      height="19"
                                      viewBox="0 0 24 24"
                                      fill={on ? "#9a9ccb" : "none"}
                                      stroke={on ? "#9a9ccb" : "rgba(43,43,47,0.4)"}
                                      strokeWidth="1.7"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      aria-hidden
                                    >
                                      {v === 1 ? (
                                        <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                                      ) : (
                                        <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
                                      )}
                                    </svg>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                          {t.action && (
                            <div className="mt-3 flex flex-wrap gap-[9px]">
                              <Link
                                href={t.action.href}
                                onClick={close}
                                className="inline-flex h-9 cursor-pointer items-center gap-[7px] rounded-[9px] bg-nevo-navy px-3.5 text-[13px] font-medium text-nevo-cream transition-[transform,filter] duration-[120ms] hover:brightness-93 active:scale-[0.98]"
                              >
                                {t.action.label}
                              </Link>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : t.kind === "failed" ? (
                      <div key={i} className="mt-3.5 flex justify-start">
                        <p className="max-w-[88%] text-[14px] leading-[1.55] text-nevo-near-black/68">
                          We couldn&rsquo;t reach Nevo just now. Try asking
                          again in a moment.
                        </p>
                      </div>
                    ) : (
                      <div key={i} className="mt-3.5 flex flex-col items-start">
                        <div className="max-w-[88%] rounded-[14px_14px_14px_4px] border border-nevo-violet/35 bg-nevo-violet/15 px-4 py-3.5">
                          {/* One paragraph, as the frame draws it. The admin
                              sentence is the line's own close; it used to be
                              printed again underneath. Design deleted
                              "Message your school admin" on 31 Aug. */}
                          <p className="text-[14.5px] leading-[1.6] text-nevo-near-black">
                            {CANNOT_HELP_LINE}
                          </p>
                        </div>
                      </div>
                    ),
                  )}

                  {thinking && (
                    <div className="mt-3.5 flex flex-col items-start">
                      <div className="flex items-center gap-1.5 rounded-[14px_14px_14px_4px] border border-nevo-violet/35 bg-nevo-violet/15 px-4 py-3.5">
                        {[0, 160, 320].map((delay) => (
                          <span
                            key={delay}
                            style={{ animationDelay: `${delay}ms` }}
                            className="size-1.5 rounded-full bg-nevo-navy motion-safe:animate-nevo-dot"
                          />
                        ))}
                      </div>
                      <span className="mt-2 ml-1 text-[12.5px] text-nevo-near-black/55">
                        {"Nevo is thinking…"}
                      </span>
                    </div>
                  )}
                  <div ref={endRef} />
                </div>
              )}
            </div>

            {/* Input */}
            <div className="shrink-0 border-t border-nevo-near-black/8 px-[18px] pt-3.5 pb-[18px]">
              <div className="flex h-[46px] items-center gap-2 rounded-full border-[1.5px] border-nevo-near-black/16 bg-nevo-cream pr-2 pl-4">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      ask(draft);
                    }
                  }}
                  placeholder={"Ask about a student, class, or lesson"}
                  className="min-w-0 flex-1 border-none bg-transparent text-[14.5px] text-nevo-near-black outline-none"
                />
                {/* Visual affordance only in the frame - no recording state. */}
                <span
                  aria-label="Speak your question"
                  className="flex size-[26px] shrink-0 items-center justify-center text-nevo-near-black"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="9" y="3" width="6" height="11" rx="3" />
                    <path d="M5 11a7 7 0 0 0 14 0" />
                    <path d="M12 18v3" />
                  </svg>
                </span>
                <button
                  type="button"
                  aria-label="Send"
                  onClick={() => ask(draft)}
                  className="flex size-[34px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-nevo-navy transition-transform duration-[120ms] active:scale-[0.98]"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f7f1e6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M22 2L11 13" />
                    <path d="M22 2l-7 20-4-9-9-4z" />
                  </svg>
                </button>
              </div>
            </div>
          </aside>
        </>
      )}
    </>
  );
}

/**
 * The list of past conversations (C15 state 2, and state 4 when it is empty).
 *
 * `threads === null` is LOADING, not empty - the distinction is the whole
 * reason this takes a nullable rather than defaulting to `[]`. Rendering "Your
 * past conversations will appear here" at the moment a teacher taps the clock,
 * only to have four of them appear a beat later, tells them something false
 * about their own record.
 *
 * NO FALLBACK DATA, ever. Everywhere else in this console a failed read can
 * show the designed screen behind a `data-nevo-sample` mark, because a fixture
 * class is recognisably not yours. A fixture CONVERSATION is not: it is words
 * attributed to the teacher and to Nevo, and there is no mark that makes
 * inventing those acceptable. So this fails honestly or shows nothing.
 */
function HistoryList({
  threads,
  failed,
  onOpen,
  onRetry,
}: {
  threads: ThreadSummary[] | null;
  failed: boolean;
  onOpen: (t: ThreadSummary) => void;
  onRetry: () => void;
}) {
  if (failed) {
    // The frame draws no error state for history (raised with design). This
    // borrows the drawer's own voice rather than inventing a new one.
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center px-7 text-center">
        <p className="max-w-[280px] text-[14.5px] leading-[1.6] text-nevo-near-black/60 text-pretty">
          We couldn&rsquo;t load your past conversations just now. They
          haven&rsquo;t gone anywhere.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 h-[42px] cursor-pointer rounded-[10px] bg-nevo-navy px-5 text-[13.5px] font-semibold text-nevo-cream transition-[filter] duration-[120ms] hover:brightness-93 active:scale-[0.98]"
        >
          Try again
        </button>
      </div>
    );
  }

  if (threads === null) {
    return (
      <div className="flex flex-col gap-2.5" role="status" aria-label="Loading past conversations">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-[62px] animate-pulse rounded-xl bg-nevo-cream-elevated"
          />
        ))}
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div className="flex min-h-[320px] items-center justify-center px-7 text-center">
        <p className="max-w-[280px] text-[14.5px] leading-[1.6] text-nevo-near-black/60 text-pretty">
          Your past conversations with Ask Nevo will appear here.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {threads.map((t) => (
        <li key={t.threadId}>
          <button
            type="button"
            onClick={() => onOpen(t)}
            className="block w-full cursor-pointer rounded-xl bg-nevo-cream-elevated px-4 py-3.5 text-left transition-transform duration-[120ms] active:scale-[0.99]"
          >
            {/* One line, ellipsised - the frame's rows never wrap. */}
            <span className="block truncate text-[14px] leading-[1.4] text-nevo-near-black">
              {t.title}
            </span>
            <span className="mt-[5px] block text-[12.5px] text-nevo-near-black/55">
              {historyDate(t.lastMessageAt)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * One past conversation, READ-ONLY (C15 state 3).
 *
 * The frame's sample shows a single question and answer, but the contract
 * returns `messages: ThreadMessageResponse[]` - a whole thread. So this renders
 * every message in `sequence` order using the two bubble styles the frame
 * draws, which is the faithful reading: the frame specifies a bubble per
 * author, and its sample simply happens to be one exchange.
 *
 * No vote controls here. A vote posts against an `interactionId`, which the
 * transcript does not carry, so offering thumbs would be offering a control
 * that could not record anything.
 */
function HistoryItem({
  transcript,
  failed,
}: {
  transcript: ThreadTranscript | null;
  failed: boolean;
}) {
  if (failed) {
    return (
      <div className="flex min-h-[320px] items-center justify-center px-7 text-center">
        <p className="max-w-[280px] text-[14.5px] leading-[1.6] text-nevo-near-black/60 text-pretty">
          We couldn&rsquo;t open this conversation just now.
        </p>
      </div>
    );
  }

  if (!transcript) {
    return (
      <div className="flex flex-col gap-3.5" role="status" aria-label="Loading this conversation">
        <div className="ml-auto h-[46px] w-[62%] animate-pulse rounded-[14px_14px_4px_14px] bg-nevo-cream-elevated" />
        <div className="h-[92px] w-[82%] animate-pulse rounded-[14px_14px_14px_4px] bg-nevo-cream-elevated" />
      </div>
    );
  }

  const ordered = [...transcript.messages].sort((a, b) => a.sequence - b.sequence);

  return (
    <div className="flex flex-col">
      {ordered.map((m, i) =>
        m.author === "asker" ? (
          <div
            key={m.messageId}
            className={i > 0 ? "mt-3.5 flex justify-end" : "flex justify-end"}
          >
            <div className="max-w-[82%] rounded-[14px_14px_4px_14px] bg-nevo-navy px-[15px] py-[11px]">
              <p className="text-[14.5px] leading-[1.45] text-nevo-cream">
                {m.text}
              </p>
            </div>
          </div>
        ) : (
          <div
            key={m.messageId}
            className={i > 0 ? "mt-3.5 flex justify-start" : "flex justify-start"}
          >
            <div className="max-w-[88%] rounded-[14px_14px_14px_4px] border border-nevo-violet/35 bg-nevo-violet/15 px-4 py-3.5">
              <p className="text-[14.5px] leading-[1.6] text-nevo-near-black">
                {m.text}
              </p>
            </div>
          </div>
        ),
      )}
    </div>
  );
}
