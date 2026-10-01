"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, Clock, Mic, MessageCircle, Send } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { NevoKeyboard, useNevoKeyboardDock } from "@/components/shared";
import { SampleRegion } from "@/components/shared/SampleRegion";
import { useDraggablePill } from "./useDraggablePill";
import { useAskNevoHistory } from "@/hooks/useAskNevoHistory";
import { useHasSession } from "@/hooks/useHasSession";
import { askNevoApi, asUuid } from "@/lib/api";
import type {
  ThreadSummary,
  ThreadTranscript,
} from "@/lib/api/askNevo";
import { LessonContext } from "@/context/LessonContext";
import { useAuth } from "@/hooks";
import { cn } from "@/lib/utils";

/**
 * Board 26's launcher mark, on both the docked button and the corner pill.
 *
 * It was the speech bubble, which is Connect's - a child looking for their
 * teacher and a child looking for Nevo were shown the same picture. The app
 * shell prototype also draws the bubble; board 26 is Ask Nevo's own frame and
 * draws this sparkle, and the teacher drawer already uses it.
 */
const SPARKLE = (className: string) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
    <path d="M12 2l1.6 4.8L18 8.4l-4.4 1.6L12 15l-1.6-5L6 8.4l4.4-1.6z" />
    <circle cx="18.5" cy="17.5" r="2.2" />
  </svg>
);

/**
 * How long the live answer gets before the drawer stops waiting for it. Then
 * a signed-in child is told plainly that it could not answer
 * (`COULD_NOT_ANSWER`), and a signed-out visitor gets the sample engine.
 *
 * Raised from 15s. The backend's own documented range for an unauthenticated
 * 401 is 1.0-5.6s and a Render cold start is far slower than that, so 15s sat
 * inside ordinary latency rather than beyond it.
 *
 * The cap now ABORTS the request rather than racing it. A race left the request
 * in flight and discarded an answer that had already arrived; aborting means
 * either fallback only ever stands in for a request that genuinely ended.
 *
 * A cap still belongs here, unlike in `useLiveQuery`: a child watching thinking
 * dots forever is worse than being told it did not work. It just has to sit
 * past a cold start, not inside one.
 */
const LIVE_TIMEOUT_MS = 30000;
/** The minimum "Nevo is thinking" beat - real answers never land jarringly
 *  fast, and the mock fallback keeps its original calm pacing. */
const THINKING_MS = 1600;
/** Mic toast lifetime. */
const TOAST_MS = 3200;

/**
 * Device-native speech recognition (SCRUM-51): v1 delegates entirely to the
 * OS recogniser via the Web Speech API - no Nevo voice model, no API key, no
 * audio ever stored. A Nevo-owned model is v2.
 */
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechResultEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
interface SpeechResultEventLike {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}
function speechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const PROMPTS = ["Explain this differently", "Give me a hint", "I'm stuck"];

interface Message {
  who: "user" | "nevo";
  text: string;
  /** The hands-to-teacher reply carries its action (frame's cannot-help state). */
  teacherAction?: boolean;
  /** Backend interaction id - carried for the helpfulness vote once the
   *  frame set gains that control (endpoint is live, UI is flagged to design). */
  interactionId?: string;
  /** A canned stand-in shown because the live assistant didn't answer. */
  sample?: boolean;
  /** A signed-in child's question the live assistant could not answer. */
  failed?: boolean;
}

/**
 * What a SIGNED-IN child is told when the live assistant does not answer.
 *
 * They used to be given a canned tutoring reply - fractions and pizza - marked
 * as a sample in small italics. A child cannot weigh "sample" against an answer
 * that sounds exactly like help, and the teacher branch of that engine promised
 * to "let them know" when nothing would. So: no answer, said plainly, with the
 * blame where it belongs. The sample engine stays for the signed-out
 * walkthrough, which is a demonstration of the drawer rather than a child.
 */
const COULD_NOT_ANSWER =
  "I couldn't answer that just now - that's on us, not you. Try asking again in a moment.";

/**
 * Mock reply engine - calm, canned, and honest about its limits. The
 * SIGNED-OUT walkthrough's fallback only: the live assistant is asked first
 * (`askNevoApi.ask`), and a question it does not answer for a visitor is
 * answered from here, marked as a sample. A signed-in child is never given
 * one - see `COULD_NOT_ANSWER`. The cannot-help boundary stays: anything for
 * the teacher is handed to the teacher, never absorbed.
 */
function replyFor(text: string): Message {
  const t = text.toLowerCase();
  if (t.includes("teacher"))
    return {
      who: "nevo",
      text: "That's something your teacher can help with best. Would you like me to let them know?",
      teacherAction: true,
    };
  if (t.includes("different") || t.includes("explain"))
    return {
      who: "nevo",
      text: "Sure! Think of a fraction like slices of pizza. If you have 1 out of 4 slices, that's one quarter. Want to try one together?",
    };
  if (t.includes("hint"))
    return {
      who: "nevo",
      text: "Here's a nudge: look at the bottom numbers first. When they match, you're already halfway there.",
    };
  if (t.includes("stuck"))
    return {
      who: "nevo",
      text: "That's okay - stuck is where the learning happens. Tell me the part that feels muddy and we'll take it slowly.",
    };
  return {
    who: "nevo",
    text: "Let's look at that together. Can you tell me a bit more about what you're working on?",
  };
}

/**
 * Ask Nevo (screen 26 / `Nevo Ask Nevo Frame`) - one drawer, every state.
 * Always reachable from the app tabs, never interruptive: a docked button on
 * mobile, a corner pill on desktop, opening a full-width bottom sheet (mobile)
 * or right side drawer (tablet/desktop). Suggested prompts, conversation,
 * "Nevo is thinking" dots, the cannot-help hand-to-teacher state, Nevo
 * Keyboard entry (A.12) and the microphone flow with a calm denied toast.
 */
export function AskNevo() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  // Tolerant read: the shell mounts this drawer OUTSIDE any lesson's
  // LessonProvider, where the strict useLesson() would throw. Inside one -
  // the lesson layout's `LessonAskNevo` - the active lesson scopes the
  // question.
  const lessonId = useContext(LessonContext)?.lessonId ?? null;
  /*
   * THE SERVER'S thread id, the same fix the teacher drawer had.
   *
   * This was `useRef(randomId())`: a v4 UUID minted here, sent on every turn,
   * and never one the backend issued - so the thread it stored carried a
   * different id and Past conversations could never be matched back to the
   * conversation on screen. Null until an answer carries one; a first turn has
   * no thread to continue, which is what null says.
   */
  const threadId = useRef<string | null>(null);
  const [open, setOpen] = useState(false);
  // One per breakpoint because they are different sizes and clamp differently,
  // but they share a stored offset - only ever one of them is on screen, and a
  // child who moves it on their own device means it for that device.
  const compactRef = useRef<HTMLButtonElement>(null);
  const fullRef = useRef<HTMLButtonElement>(null);
  const compact = useDraggablePill(compactRef, () => setOpen(true));
  const full = useDraggablePill(fullRef, () => setOpen(true));
  const [messages, setMessages] = useState<Message[]>([]);
  const [thinking, setThinking] = useState(false);
  const [input, setInput] = useState("");
  const [recording, setRecording] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  /*
   * FRAME 26: *"A quiet clock icon in the drawer's top bar opens a flat,
   * most-recent-first list of past conversations inside the same sheet.
   * Tapping an entry opens it read-only, with the input still there to start
   * something new. Same drawer, same styling: no new screen, no modal."*
   *
   * So this is a view within one sheet rather than a route or a dialog, and
   * the composer below never leaves.
   */
  const [view, setView] = useState<"chat" | "history">("chat");
  const signedIn = useHasSession();
  const history = useAskNevoHistory(open && signedIn);
  const kb = useNevoKeyboardDock();
  const threadRef = useRef<HTMLDivElement | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  // Text committed before/between utterances; interim results render after it.
  const transcriptBase = useRef("");

  const alive = useRef(true);

  useEffect(() => {
    const t = timers.current;
    alive.current = true;
    return () => {
      alive.current = false;
      t.forEach(clearTimeout);
      recognition.current?.stop();
    };
  }, []);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };

  const send = (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || thinking) return; // pressable, not disabled - an empty send just rests
    setInput("");
    recognition.current?.stop();
    setRecording(false);
    /*
     * BACK TO THE LIVE THREAD. A question asked from Past conversations was
     * appended to the conversation underneath, which was hidden - so it, and
     * its answer, simply vanished. Frame 26 keeps the composer there "to start
     * something new", and something new is said where it can be seen.
     */
    setView("chat");
    history.closeThread();
    setMessages((m) => [...m, { who: "user", text }]);
    setThinking(true);

    // Live assistant first. When the backend can't answer, a signed-in child
    // is told so and a signed-out visitor gets the mock engine. The answer
    // lands no earlier than the thinking beat, so a fast response never
    // arrives jarringly.
    const beat = new Promise<void>((resolve) => later(resolve, THINKING_MS));
    // Capped by ABORTING the request, not by racing it. A race leaves the
    // request in flight and throws away an answer that did arrive - so a
    // merely slow reply got replaced by a canned one. Aborting means the only
    // thing either fallback ever stands in for is a genuine failure.
    const controller = new AbortController();
    later(() => controller.abort(), LIVE_TIMEOUT_MS);
    const answer = askNevoApi
      .ask(
        {
          role: "student",
          currentPage: pathname,
          contextIds: {
            studentId: asUuid(user?.id),
            lessonId: asUuid(lessonId),
            threadId: asUuid(threadId.current),
          },
          question: text,
        },
        { signal: controller.signal },
      )
      .catch(() => null);
    void Promise.all([answer, beat]).then(([res]) => {
      if (!alive.current) return;
      // Adopt the server's thread so the next turn continues this one. Only
      // ever set from an answer: one without an id must not drop a thread we
      // already hold.
      if (res?.threadId) threadId.current = res.threadId;
      setMessages((m) => [
        ...m,
        res
          ? {
              who: "nevo",
              text: res.answer,
              interactionId: res.interactionId,
              // Frame 26's "Can't help · hands to teacher": the server's own
              // answer, with the way to the teacher beside it. Strictly
              // false, so a response that predates the field still reads as
              // an answer rather than a hand-over.
              teacherAction: res.canHelp === false,
            }
          : signedIn
            ? { who: "nevo", text: COULD_NOT_ANSWER, failed: true }
            : // Say so. A visitor on the walkthrough cannot tell a canned
              // reply from real tutoring either, and should not have to.
              { ...replyFor(text), sample: true },
      ]);
      setThinking(false);
    });
  };

  // Scroll the newest message into view.
  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages, thinking]);

  const showToast = (message: string) => {
    setToast(message);
    later(() => setToast(null), TOAST_MS);
  };

  const toggleMic = () => {
    if (recording) {
      // Stop = transcription complete; the text waits for review before send
      // (never auto-sent - SCRUM-51).
      recognition.current?.stop();
      setRecording(false);
      return;
    }
    const Ctor = speechRecognitionCtor();
    if (!Ctor) {
      showToast("Voice input isn't available on this device.");
      return;
    }
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    transcriptBase.current = input.trim() ? `${input.trim()} ` : "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) transcriptBase.current += `${r[0].transcript.trim()} `;
        else interim += r[0].transcript;
      }
      setInput((transcriptBase.current + interim).trimStart());
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed")
        showToast("Microphone access needed. Check your device settings.");
      setRecording(false);
    };
    rec.onend = () => setRecording(false);
    recognition.current = rec;
    try {
      rec.start();
      setRecording(true);
    } catch {
      showToast("Voice input isn't available on this device.");
    }
  };

  return (
    <>
      {/* Idle affordances - docked button (mobile), corner pill (desktop).
          Both can be dragged out of the way and stay where they are put; see
          `useDraggablePill` for why that is the child's call and not ours. */}
      <button
        type="button"
        aria-label="Ask Nevo"
        ref={compactRef}
        style={compact.style}
        {...compact.handlers}
        className={cn(
          "fixed right-[18px] bottom-[82px] z-30 flex size-[52px] cursor-pointer items-center justify-center rounded-full bg-nevo-navy text-nevo-cream shadow-[0_6px_20px_rgba(43,43,47,0.22)] transition-[filter,transform] hover:brightness-108 md:hidden",
          // No press-scale mid-drag: it would fight the finger.
          compact.dragging ? "cursor-grabbing" : "active:scale-[0.96]",
        )}
      >
        {SPARKLE("size-6")}
      </button>
      <button
        type="button"
        ref={fullRef}
        style={full.style}
        {...full.handlers}
        className={cn(
          "fixed right-6 bottom-6 z-30 hidden h-11 cursor-pointer items-center gap-2 rounded-full bg-nevo-navy px-[18px] text-sm font-medium text-nevo-cream shadow-[0_6px_20px_rgba(43,43,47,0.22)] transition-[filter,transform] hover:brightness-108 md:flex",
          full.dragging ? "cursor-grabbing" : "active:scale-[0.98]",
        )}
      >
        {SPARKLE("size-[18px]")}
        Ask Nevo
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          aria-describedby={undefined}
          // The `!` marks out-shout the stock data-[side=bottom] variants
          // (class + attribute selectors), same as the preview sheet.
          className="flex h-[88%] flex-col gap-0 rounded-t-[20px] border-0! bg-nevo-cream p-0 text-nevo-near-black shadow-[0_-8px_32px_rgba(0,0,0,0.16)] sm:inset-x-auto! sm:top-0! sm:right-0! sm:left-auto! sm:h-full! sm:w-[412px] sm:rounded-none! sm:shadow-[-8px_0_32px_rgba(0,0,0,0.16)] lg:w-[460px]"
        >
          {/* Header */}
          {/*
            pr-16 CLEARS THE SHEET'S CLOSE BUTTON, which sits absolutely in the
            top-right corner. The history button was pushed to the right edge
            underneath it, so tapping "Past conversations" closed the drawer.
          */}
          <div className="flex h-14 shrink-0 items-center gap-2 border-b border-nevo-near-black/8 pr-16 pl-5">
            {history.transcript || view === "history" ? (
              <button
                type="button"
                aria-label="Back"
                onClick={() => {
                  if (history.transcript || history.transcriptFailed) {
                    history.closeThread();
                  } else {
                    setView("chat");
                  }
                }}
                // 44px to touch; -ml-3 keeps the chevron where the 36px
                // button drew it.
                className="-ml-3 flex size-11 cursor-pointer items-center justify-center rounded-full text-nevo-near-black/70 transition-colors hover:bg-nevo-near-black/6"
              >
                <ChevronLeft className="size-5" strokeWidth={2} />
              </button>
            ) : null}
            <SheetTitle className="text-[17px] font-semibold text-nevo-near-black">
              {view === "history" ? "Past conversations" : "Ask Nevo"}
            </SheetTitle>
            {/*
              SIGNED-IN ONLY. There is no server history behind the designed
              walkthrough, so offering a clock to a signed-out visitor would
              open an empty list that looks like a child with no conversations
              rather than a visitor with no account.
            */}
            {signedIn && view === "chat" && (
              <button
                type="button"
                aria-label="Past conversations"
                onClick={() => {
                  history.refresh();
                  setView("history");
                }}
                className="ml-auto flex size-11 cursor-pointer items-center justify-center rounded-full text-nevo-near-black/60 transition-colors hover:bg-nevo-near-black/6"
              >
                <Clock className="size-[19px]" strokeWidth={2} />
              </button>
            )}
          </div>

          {/* Past conversations - the same sheet, never a new screen. */}
          {view === "history" ? (
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {history.transcript || history.transcriptFailed ? (
                <ReadOnlyThread
                  transcript={history.transcript}
                  failed={history.transcriptFailed}
                />
              ) : (
                <ThreadList
                  threads={history.threads}
                  loading={history.loading}
                  failed={history.failed}
                  onOpen={history.openThread}
                />
              )}
            </div>
          ) : (
          <>
          {/* Thread */}
          <div ref={threadRef} className="min-h-0 flex-1 overflow-y-auto p-5">
            <p className="mb-3 text-[15px] font-medium text-nevo-near-black">
              What can I help with?
            </p>
            <div className="flex flex-wrap gap-2">
              {PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => send(prompt)}
                  className="inline-flex h-11 cursor-pointer items-center rounded-full border-[1.5px] border-nevo-violet/70 px-3.5 text-[13px] text-nevo-navy transition-colors hover:bg-nevo-violet/10 active:scale-[0.98]"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div className="mt-4 flex flex-col gap-3">
              {messages.map((message, i) => {
                if (message.who === "user") {
                  return (
                    <div key={i} className="flex justify-end">
                      <div className="max-w-[82%] rounded-2xl rounded-br-[5px] bg-nevo-navy/15 px-3.5 py-2.5 text-[15px] leading-[1.4]">
                        {message.text}
                      </div>
                    </div>
                  );
                }
                const bubble = (
                  <div className="flex max-w-[88%] flex-col gap-3 rounded-2xl rounded-bl-[5px] bg-nevo-violet/22 px-3.5 py-3 text-[15px] leading-[1.5]">
                    {message.text}
                    {message.sample && (
                      <span className="text-[12.5px] leading-[1.4] text-nevo-near-black/60 italic">
                        I couldn&rsquo;t connect just now, so this is a sample
                        answer.
                      </span>
                    )}
                    {message.teacherAction && (
                      <button
                        type="button"
                        onClick={() => {
                          // IA 31: "Message my teacher -> closes drawer ->
                          // Connect Tab". The drawer lives in the shell, so
                          // without this it stayed open over Connect.
                          setOpen(false);
                          router.push("/student/connect");
                        }}
                        className="inline-flex h-11 cursor-pointer items-center gap-2 self-start rounded-[10px] bg-nevo-navy px-4 text-sm font-medium text-nevo-cream transition-[filter] hover:brightness-108 active:scale-[0.98]"
                      >
                        <MessageCircle className="size-4" strokeWidth={2} />
                        Message my teacher
                      </button>
                    )}
                  </div>
                );
                return (
                  <div key={i} className="flex justify-start">
                    {/* The canned reply reaches a SIGNED-OUT visitor only:
                        `askNevoApi.ask` is called for everyone, a visitor's
                        failure or `LIVE_TIMEOUT_MS` abort is answered from
                        `replyFor()`, and a signed-in child's gets
                        `COULD_NOT_ANSWER` instead. The italic line above
                        says so to the visitor, which is the half that matters -
                        but only a person can read it, and the end-to-end run
                        meant to catch a console falling back to invented
                        content reads the mark. Marked ONLY when it really is a
                        canned reply: `sampleMark` emits the attribute whatever
                        it is given, so a wrapper left permanently in place
                        would label every real answer as sample. */}
                    {message.sample ? (
                      <SampleRegion kind="student:ask-nevo">
                        {bubble}
                      </SampleRegion>
                    ) : (
                      bubble
                    )}
                  </div>
                );
              })}
              {thinking && (
                <div className="flex flex-col items-start gap-2">
                  <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-[5px] bg-nevo-violet/22 px-4 py-3.5">
                    {[0, 160, 320].map((delay) => (
                      <span
                        key={delay}
                        className="block size-[7px] rounded-full bg-nevo-navy motion-safe:animate-nevo-dot"
                        style={{ animationDelay: `${delay}ms` }}
                      />
                    ))}
                  </div>
                  <span className="ml-1 text-[13px] text-nevo-near-black/55">
                    Nevo is thinking…
                  </span>
                </div>
              )}
            </div>
          </div>
          </>
          )}

          {/*
            Composer - OUTSIDE the view switch on purpose. Frame 26: reading a
            past conversation leaves "the input still there to start something
            new", so history is somewhere to look rather than somewhere to be
            stuck. Typing from a transcript returns to the live thread.
          */}
          <div className="relative shrink-0 border-t border-nevo-near-black/8 px-4 py-3">
            <div
              className={cn(
                "flex h-11 items-center gap-1 rounded-full border-[1.5px] bg-nevo-cream pl-3.5 transition-colors",
                kb.open || recording
                  ? "border-nevo-navy"
                  : "border-nevo-near-black/16",
              )}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onFocus={kb.onFocus}
                onBlur={kb.onBlur}
                onKeyDown={(e) => {
                  if (e.key === "Enter") send();
                }}
                // A.12: the Nevo Keyboard drives entry on touch; hardware
                // keyboards still type on desktop.
                inputMode="none"
                placeholder={recording ? "Listening…" : "Ask a question"}
                aria-label="Ask a question"
                className={cn(
                  "min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-nevo-near-black/40",
                  recording && "placeholder:text-nevo-near-black/50",
                )}
              />
              <button
                type="button"
                aria-label={
                  recording ? "Stop listening" : "Speak your question"
                }
                aria-pressed={recording}
                onClick={toggleMic}
                className={cn(
                  "flex size-11 shrink-0 cursor-pointer items-center justify-center",
                  recording
                    ? "text-nevo-violet motion-safe:animate-nevo-mic-pulse"
                    : "text-nevo-near-black",
                )}
              >
                <Mic className="size-5" strokeWidth={2} />
              </button>
              <button
                type="button"
                aria-label="Send"
                onClick={() => send()}
                className="flex size-11 shrink-0 cursor-pointer items-center justify-center"
              >
                <span className="flex size-8 items-center justify-center rounded-full bg-nevo-navy text-nevo-cream transition-[filter] hover:brightness-108">
                  <Send className="size-4" strokeWidth={2} />
                </span>
              </button>
            </div>

            {/* Mic denied/unavailable - a calm toast, never an error state. */}
            {toast && (
              <div className="absolute inset-x-4 bottom-[70px] z-10 rounded-[10px] bg-nevo-navy px-3.5 py-3 text-[13px] leading-[1.45] text-nevo-cream shadow-[0_8px_32px_rgba(0,0,0,0.16)] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200">
                {toast}
              </div>
            )}
          </div>

          {kb.open && (
            <NevoKeyboard
              layout="qwerty"
              onKey={(c) => setInput((v) => v + c)}
              onBackspace={() => setInput((v) => v.slice(0, -1))}
              onReturn={() => {
                kb.close();
                send();
              }}
              className="shrink-0"
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

/**
 * A flat, most-recent-first list of past conversations (frame 26, state 2).
 *
 * The ninety-day window and the fifty-entry cap are applied by
 * `recentThreads` before this ever sees them - the endpoint takes no
 * parameters, so the rule the frame states cannot be asked for.
 */
function ThreadList({
  threads,
  loading,
  failed,
  onOpen,
}: {
  threads: ThreadSummary[];
  loading: boolean;
  failed: boolean;
  onOpen: (threadId: string) => void;
}) {
  if (loading) {
    return (
      <p className="pt-6 text-center text-sm text-nevo-near-black/55">
        Getting your conversations…
      </p>
    );
  }

  /*
   * COULD NOT ASK IS NOT THE SAME AS NOTHING TO SHOW, and a child who has
   * talked to Nevo every day should never be told they have never talked to
   * it because a request failed.
   */
  if (failed) {
    return (
      <p className="pt-6 text-center text-sm leading-[1.5] text-nevo-near-black/60">
        We couldn&rsquo;t load these just now.
      </p>
    );
  }

  // Frame 26, state 4 - its words and its centring.
  if (threads.length === 0) {
    return (
      <div className="flex h-full min-h-[300px] items-center justify-center px-6 text-center">
        <p className="max-w-[260px] text-[15px] leading-[1.6] text-pretty text-nevo-near-black/55">
          Your past conversations with Ask Nevo will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {threads.map((t) => (
        <button
          key={t.threadId}
          type="button"
          onClick={() => onOpen(t.threadId)}
          className="flex w-full cursor-pointer flex-col items-start gap-1 rounded-[10px] px-3 py-3 text-left transition-colors hover:bg-nevo-cream-elevated"
        >
          <span className="text-[15px] leading-[1.4] font-medium text-nevo-near-black">
            {t.title}
          </span>
          <span className="text-[12.5px] text-nevo-near-black/50">
            {agoLabel(t.lastMessageAt)}
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * One past conversation, read-only (frame 26, state 3).
 *
 * Read-only is the whole point: it is a record of what was said, so there is
 * nothing here to retry, rate or continue. Starting something new is what the
 * composer below is for, and it never left.
 */
function ReadOnlyThread({
  transcript,
  failed,
}: {
  transcript: ThreadTranscript | null;
  failed: boolean;
}) {
  if (failed) {
    return (
      <p className="pt-6 text-center text-sm leading-[1.5] text-nevo-near-black/60">
        We couldn&rsquo;t open that one just now.
      </p>
    );
  }
  if (!transcript) {
    return (
      <p className="pt-6 text-center text-sm text-nevo-near-black/55">
        Opening…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {transcript.messages.map((m) =>
        m.author === "asker" ? (
          <div key={m.messageId} className="flex justify-end">
            <div className="max-w-[82%] rounded-2xl rounded-br-[5px] bg-nevo-navy/15 px-3.5 py-2.5 text-[15px] leading-[1.4]">
              {m.text}
            </div>
          </div>
        ) : (
          <div key={m.messageId} className="flex justify-start">
            <div className="max-w-[88%] rounded-2xl rounded-bl-[5px] bg-nevo-violet/22 px-3.5 py-3 text-[15px] leading-[1.5]">
              {m.text}
            </div>
          </div>
        ),
      )}
    </div>
  );
}

/**
 * "2h", "yesterday", "3 Sep". Never a precise timestamp: this is a list to
 * find a conversation in, not a record of when a child was on their tablet.
 */
function agoLabel(iso: string): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "";
  const mins = Math.floor((Date.now() - at) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  if (hours < 48) return "yesterday";
  return new Date(at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}
