"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { useUnsavedGuard } from "@/hooks/useUnsavedGuard";
import { ApiError } from "@/lib/api/client";
import { feedbackApi } from "@/lib/api/feedback";
import { cn } from "@/lib/utils";

/**
 * Share Feedback (SCRUM-68 · `Nevo Feedback`, role=teacher) - the teacher half
 * of the shared feedback component. The frame calls it a right-docked panel
 * over dimmed content, not a screen; the student half is a full screen because
 * that role is phone-first.
 *
 * Teacher differs from student in two ways the frame sets out: the two type
 * pills are shown (students get no feature requests, and are told why), and the
 * textarea starts taller at 120px.
 *
 * The success check reuses `animate-nevo-pop` rather than the frame's own
 * fbPop, which is a shade slower and starts a shade larger. Every other success
 * check in the product - the one on Set Password most of all - already uses
 * nevo-pop, and two success moments popping differently would read worse than
 * the divergence. Flagged to design.
 *
 * Live against `POST /api/v1/feedback`, carrying the route the teacher was on
 * as `context` - "which screen was this about" is the first question feedback
 * raises.
 *
 * THE FAILURE IS THE FRAME'S (drawn 30 Aug, and this said it was not drawn
 * for a month after): a card ABOVE the note with a retry glyph, "Your
 * feedback couldn't be sent." / "Your note is still here. Give it another
 * try in a moment.", and a glyphed Try again in place of Send. Nothing is
 * thanked for until something is stored, and the note is kept.
 *
 * One split stays ours: a note the server REFUSED (422) will fail the same
 * way however long a teacher waits, so its body says to edit it rather than
 * to try again in a moment. Flagged to design.
 *
 * Design ruled on the sent state (31 Aug): the 1.5s auto-close stands and
 * "Open again" goes. A button that appears for a second and a half, under a
 * line saying the panel closes on its own, was asking the teacher to race it.
*/

/** The frame's note: "auto-closes ~1.5s in-app". */
const SENT_CLOSE_MS = 1500;
/** `FeedbackRequest.note`: minLength 1, maxLength 5000. */
const NOTE_MAX = 5000;

type FeedbackType = "feedback" | "feature";

const PILL_BASE =
  "inline-flex h-9 cursor-pointer items-center rounded-[20px] px-4 text-[13px] transition-[filter,background-color] active:scale-[0.98]";

export function FeedbackPanel({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
  const [type, setType] = useState<FeedbackType>("feedback");
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  useUnsavedGuard(text.trim().length > 0 && !sent);
  const [sending, setSending] = useState(false);
  /**
   * Which KIND of failure, not just that there was one.
   *
   * "That didn't reach us" was shown for every rejection - including a 422,
   * where it plainly did reach us and was refused, and a 500, where it
   * reached us and our end broke. Only a transport failure (`ApiError.status
   * 0`) is actually a delivery failure, and only the first two are worth a
   * "try again": retrying a note the server refused for its length will fail
   * every time.
   */
  const [failure, setFailure] = useState<"none" | "unreachable" | "refused" | "server">("none");
  const failed = failure !== "none";
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ready = text.trim().length > 0;

  const send = () => {
    if (!ready || sent || sending) return;
    setSending(true);
    setFailure("none");
    void feedbackApi
      .submit({ type, note: text.trim(), context: pathname ?? undefined })
      .then(() => {
        setSending(false);
        // Only now: the thank-you must mean something was stored.
        setSent(true);
        closeTimer.current = setTimeout(onClose, SENT_CLOSE_MS);
      })
      .catch((err: unknown) => {
        setSending(false);
        const status = err instanceof ApiError ? err.status : undefined;
        setFailure(
          status === undefined || status === 0
            ? "unreachable"
            : status === 422
              ? "refused"
              : "server",
        );
      });
  };

  const panel =
    "fixed top-1/2 right-6 z-50 flex w-[360px] max-w-[calc(100vw-3rem)] -translate-y-1/2 flex-col rounded-[16px] bg-nevo-cream-inset p-6 shadow-[0_20px_56px_rgba(0,0,0,0.2)]";

  // Two dialogs take turns in this panel: the form, then its thank-you. Each
  // takes focus in its turn, and the last to close gives it back (C07).
  const formRef = useRef<HTMLDivElement>(null);
  const sentRef = useRef<HTMLDivElement>(null);
  useDialogFocus(formRef, { active: !sent });
  useDialogFocus(sentRef, { active: sent });

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className="fixed inset-0 z-40 bg-nevo-near-black/28 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
      />

      {sent ? (
        <div
          ref={sentRef}
          tabIndex={-1}
          role="dialog"
          aria-label="Feedback sent"
          className={cn(
            panel,
            "min-h-[360px] items-center justify-center text-center motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150",
          )}
        >
          <span className="inline-flex size-14 items-center justify-center rounded-full bg-nevo-navy text-nevo-cream motion-safe:animate-nevo-pop">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </span>
          <h3 className="mt-4 text-[17px] font-semibold text-nevo-near-black">
            Thank you - that&rsquo;s on its way
          </h3>
          <p className="mt-[7px] text-sm leading-[1.55] text-nevo-near-black/62">
            The panel closes on its own. You can share more any time.
          </p>
        </div>
      ) : (
        <div
          ref={formRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="Share feedback"
          className={cn(
            panel,
            "min-h-[360px] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-150",
          )}
        >
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-base font-semibold text-nevo-navy">
                Share Feedback
              </h3>
              <p className="mt-2 max-w-[280px] text-[13px] leading-[1.55] text-nevo-near-black/60">
                Help us improve Nevo. Your input shapes what we build next.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="mt-0.5 shrink-0 cursor-pointer text-nevo-near-black/40 transition-colors hover:text-nevo-near-black/70 active:scale-[0.98]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="mt-4 flex gap-2">
            {(
              [
                ["feedback", "Feedback"],
                ["feature", "Feature Request"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={type === id}
                onClick={() => setType(id)}
                className={cn(
                  PILL_BASE,
                  type === id
                    ? "bg-nevo-navy text-nevo-cream"
                    : "bg-nevo-cream-elevated text-nevo-near-black hover:brightness-[0.985]",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {failed && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2.5 rounded-[10px] bg-nevo-violet/20 px-[15px] py-[13px]"
            >
              <span className="mt-px flex shrink-0 text-nevo-navy">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                  <path d="M21 3v6h-6" />
                </svg>
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-nevo-navy">
                  Your feedback couldn&rsquo;t be sent.
                </p>
                <p className="mt-1 text-[12.5px] leading-[1.5] text-nevo-near-black/70">
                  {failure === "refused"
                    ? "Nevo couldn’t accept that note. It’s still here, so you can edit it and send again."
                    : "Your note is still here. Give it another try in a moment."}
                </p>
              </div>
            </div>
          )}

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Your feedback"
            placeholder={
              type === "feature"
                ? "What would make Nevo better?"
                : "What’s on your mind?"
            }
            /* `FeedbackRequest.note` is capped at 5000 in the contract, so a
               longer note 422s on every attempt - under copy inviting a retry
               that could never succeed. The bound is now visible before Send
               rather than discovered after it. */
            maxLength={NOTE_MAX}
            className="mt-4 min-h-[120px] w-full resize-none rounded-[10px] border border-nevo-near-black/12 bg-nevo-cream-elevated px-3.5 py-3 text-sm leading-[1.5] text-nevo-near-black outline-none transition-colors placeholder:text-nevo-near-black/30 focus:border-nevo-navy"
          />
          {text.length > NOTE_MAX - 200 && (
            <p className="mt-1.5 text-right text-[12px] text-nevo-near-black/50">
              {`${NOTE_MAX - text.length} characters left`}
            </p>
          )}

          <button
            type="button"
            onClick={send}
            disabled={!ready || sending}
            className={cn(
              "mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-nevo-navy text-[13px] font-semibold text-nevo-cream transition-[filter]",
              ready && !sending
                ? "cursor-pointer hover:brightness-[1.06] active:scale-[0.98]"
                : "cursor-default opacity-50",
            )}
          >
            {sending ? (
              "Sending…"
            ) : failed ? (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                  <path d="M21 3v6h-6" />
                </svg>
                Try again
              </>
            ) : (
              "Send Feedback"
            )}
          </button>
        </div>
      )}
    </>
  );
}
