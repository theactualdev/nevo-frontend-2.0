"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, Check, X } from "lucide-react";
import { NevoKeyboard, useNevoKeyboardDock } from "@/components/shared";
import { feedbackApi } from "@/lib/api";

const PROFILE_HREF = "/student/profile";
/** The sent state closes on its own (frame: "auto-closes ~1.5s in-app"). */
const SENT_CLOSE_MS = 1500;

/**
 * Student feedback (SCRUM-68 · `Nevo Feedback`, role=student) - the "Tell us
 * something" destination from Profile & Settings. The gentler student variant:
 * no Feedback/Feature pills, a short optional note, and reassurance that nothing
 * they say changes their lesson. Sent shows the calm success pattern (navy
 * circle + cream check) and returns to Profile on its own.
 *
 * Full-screen view over a dimmed cream backdrop with a 44×44 back chevron,
 * matching the Student App's feedback view. On touch the note routes through the
 * Nevo Keyboard's multi-line composer (the keyboard covers the panel, so the
 * composer mirrors the note above the tray).
 */
export function StudentFeedbackScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const kb = useNevoKeyboardDock();

  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  const back = () => router.push(PROFILE_HREF);

  const ready = note.trim().length > 0;

  const submit = () => {
    if (!ready || sending || sent) return;
    setSending(true);
    setFailed(false);
    void feedbackApi
      .submit({
        type: "feedback",
        note: note.trim(),
        // Where they were standing when they wrote it - the first question
        // anyone triaging feedback asks, and the route answers it for free.
        context: pathname ?? undefined,
      })
      .then(() => {
        setSending(false);
        // Only now. The thank-you has to mean something was stored.
        setSent(true);
        closeTimer.current = setTimeout(back, SENT_CLOSE_MS);
      })
      .catch(() => {
        setSending(false);
        setFailed(true);
      });
  };

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center bg-[#d9d2c2] px-6 py-10">
      <button
        type="button"
        aria-label="Back"
        onClick={back}
        className="absolute top-4 left-4 z-20 flex size-11 cursor-pointer items-center justify-center rounded-[10px] transition-colors hover:bg-nevo-near-black/[0.06] active:bg-nevo-near-black/[0.12]"
      >
        <ChevronLeft className="size-6 text-nevo-near-black" strokeWidth={2} />
      </button>

      {/* Panel surface is Cream Elevated 2 (#e5dfd3) - raised-on-raised (DS tokens). */}
      <div className="flex w-[360px] max-w-full min-h-[300px] flex-col rounded-[16px] bg-[#e5dfd3] p-6 shadow-[0_20px_56px_rgba(0,0,0,0.2)]">
        {sent ? (
          <div className="m-auto text-center">
            <span className="inline-flex size-14 items-center justify-center rounded-full bg-nevo-navy motion-safe:animate-nevo-pop">
              <Check
                className="size-[26px] text-nevo-cream"
                strokeWidth={2.6}
              />
            </span>
            <h3 className="mt-4 text-[17px] font-semibold text-nevo-near-black">
              Thank you - that&apos;s on its way
            </h3>
            <p className="mt-2 text-sm leading-[1.55] text-nevo-near-black/62">
              The panel closes on its own. You can share more any time.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-base font-semibold text-nevo-navy">
                  Share Feedback
                </div>
                <p className="mt-2 max-w-[280px] text-[13px] leading-[1.55] text-nevo-near-black/60">
                  How is Nevo working for you?
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={back}
                className="-mt-1.5 -mr-1.5 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-nevo-near-black/40 transition-colors hover:text-nevo-near-black/60"
              >
                <X className="size-4" strokeWidth={2} />
              </button>
            </div>

            {/*
              Frame "Nevo Feedback", state=failed: a tinted banner ABOVE the
              note, in the frame's words. It was a violet sentence under the
              textarea that the frame does not draw, with an em dash in it.
            */}
            {failed && (
              <div
                role="alert"
                className="mt-4 flex items-start gap-2.5 rounded-[10px] bg-nevo-violet/20 px-[15px] py-[13px]"
              >
                <RetryGlyph className="mt-px size-4 shrink-0 text-nevo-navy" />
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-nevo-navy">
                    Your feedback couldn&apos;t be sent.
                  </div>
                  <p className="mt-1 text-[12.5px] leading-[1.5] text-nevo-near-black/70">
                    Your note is still here. Give it another try in a moment.
                  </p>
                </div>
              </div>
            )}

            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onFocus={kb.onFocus}
              onBlur={kb.onBlur}
              // A.12: Nevo Keyboard on touch; hardware keyboard on desktop.
              inputMode="none"
              placeholder="Tell us what you think..."
              className="mt-4 min-h-[80px] w-full resize-none rounded-[10px] border border-nevo-near-black/12 bg-nevo-cream-elevated p-3.5 text-sm leading-[1.5] text-nevo-near-black outline-none transition-colors placeholder:text-nevo-near-black/30 focus:border-nevo-navy"
            />

            <button
              type="button"
              onClick={submit}
              disabled={!ready || sending}
              className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-nevo-navy text-[13px] font-semibold text-nevo-cream transition-[filter,transform] not-disabled:cursor-pointer hover:not-disabled:brightness-106 active:not-disabled:scale-[0.98] disabled:opacity-45"
            >
              {sending ? (
                "Sending…"
              ) : failed ? (
                <>
                  <RetryGlyph className="size-[15px]" strokeWidth={2} />
                  Try again
                </>
              ) : (
                "Send Feedback"
              )}
            </button>

            <p className="mx-0.5 mt-3.5 text-xs leading-[1.5] text-nevo-near-black/50">
              No feature requests here - students share how it&apos;s going, and
              their teacher sees the themes.
            </p>
          </>
        )}
      </div>

      {/* Note entry on touch - the multi-line composer mirrors the note above
          the tray (the keyboard covers the panel on small screens). */}
      {kb.open && !sent && (
        <NevoKeyboard
          layout="qwerty"
          composer="multi"
          value={note}
          placeholder="Tell us what you think..."
          onKey={(c) => setNote((n) => n + c)}
          onBackspace={() => setNote((n) => n.slice(0, -1))}
          onReturn={() => setNote((n) => n + "\n")}
          className="fixed inset-x-0 bottom-0 z-40"
        />
      )}
    </div>
  );
}

/** The frame's retry arrow, drawn as it draws it. */
function RetryGlyph({
  className,
  strokeWidth = 1.9,
}: {
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}
