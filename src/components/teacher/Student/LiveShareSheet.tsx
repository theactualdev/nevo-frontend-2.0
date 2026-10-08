"use client";

import { useEffect, useRef, useState } from "react";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { escalationsApi } from "@/lib/api/escalations";
import { useUnsavedGuard } from "@/hooks/useUnsavedGuard";

/**
 * C.8b Share with Learning Support, for a real student.
 *
 * THE DEFECT THIS REPLACES. `ShareSheet` next door has a permanently disabled
 * send button and a paragraph telling the teacher to raise it with the SENCo
 * directly. That was the honest answer while no transport existed - before it,
 * the button closed the sheet and asserted the referral had happened. Neither
 * version is reachable when signed in: `StudentProfile` mounts the sheet and
 * `StudentRoute` renders `LiveStudentProfile` for anyone with a token, which
 * is the same gap C08c had until 15 Sep.
 *
 * WHY A SEPARATE COMPONENT. The fixture profile must keep its disabled sheet.
 * Posting a fixture student's id to a live endpoint would raise a real
 * safeguarding escalation about a child who does not exist, in front of a real
 * SENCo. The sample screen stays inert on purpose.
 *
 * CONFIRMATION FOLLOWS C14 B5, NOT THIS SHEET. It dismisses, a toast confirms,
 * and a quiet note settles under the student's name - so success is reported
 * by the profile, via `onSent`, and there is no success panel here. That is
 * the resolution `StudentProfile` recorded for whoever wired this up, and it
 * differs deliberately from C08c's recommend sheet, which does confirm in
 * place. Flagged to design as a divergence between two adjacent sheets.
 *
 * C.8c ASKS ONCE MORE. "Send to Learning Support" no longer posts: it opens
 * the confirm step C08 and the profile frame both draw ("Send to Learning
 * Support?" / Back / Yes, send). A safeguarding referral is the one write on
 * this console a teacher should not be able to make by a slip of the finger.
 * C14 B5 resolved the SENT state only, so it does not retire this step.
 *
 * A FAILED SEND NEVER DISMISSES. `onSent` is called only after the write
 * resolves. If the post fails the sheet goes back to the form, with the
 * teacher's words still in the box and the error under them, because a safeguarding note silently dropped on a flaky
 * connection is the failure that matters most on this screen.
 */
export function LiveShareSheet({
  studentId,
  firstName,
  onCancel,
  onSent,
}: {
  studentId: string;
  firstName: string;
  onCancel: () => void;
  /** Called only after the escalation is stored. Drives C14 B5 on the profile. */
  onSent: () => void;
}) {
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A safeguarding note, of all things, should not vanish on a refresh.
  useUnsavedGuard(note.trim().length > 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // `note` is required by the contract, and an empty referral tells the SENCo
  // nothing. Whitespace is not a note.
  const ready = note.trim().length > 0 && !busy;

  function review() {
    if (!ready) return;
    setError(null);
    setConfirming(true);
  }

  async function send() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await escalationsApi.create({ studentId, note: note.trim() });
      onSent();
    } catch {
      // Back to the form: the error says the note "is still here", so it is.
      setConfirming(false);
      setError(
        `We couldn${"’"}t send that just now. Nothing has reached your SENCo, so your note is still here to try again.`,
      );
    } finally {
      setBusy(false);
    }
  }

  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-nevo-near-black/28 backdrop-blur-[1.5px] p-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Share ${firstName} with Learning Support`}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[500px] rounded-[16px] bg-nevo-cream p-7 shadow-[0_8px_32px_rgba(0,0,0,0.16)] motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:duration-200 xl:max-w-[520px] xl:p-8"
      >
        {confirming ? (
          <>
            <h2 className="text-xl font-semibold tracking-[-0.01em] text-nevo-near-black xl:text-[22px]">
              Send to Learning Support?
            </h2>
            <p className="mt-[9px] text-[14.5px] leading-[1.55] text-nevo-near-black/68 xl:mt-2.5 xl:text-[15px]">
              {`This shares ${firstName}${"’"}s recent picture and your note with your SENCo. They${"’"}ll follow up with you, and it stays between you and Learning Support.`}
            </p>
            <div className="mt-4 rounded-[12px] border-l-[3px] border-nevo-violet bg-nevo-violet/16 px-[15px] py-[13px] xl:mt-[18px] xl:px-4 xl:py-3.5">
              <p className="text-[13px] leading-[1.5] text-nevo-near-black xl:text-[13.5px]">
                <strong className="font-semibold">Sending:</strong>
                {` ${firstName}${"’"}s recent picture and the note you wrote.`}
              </p>
            </div>
            <div className="mt-[18px] flex gap-3 xl:mt-5">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirming(false)}
                className="flex h-[50px] flex-1 cursor-pointer items-center justify-center rounded-[10px] border-[1.5px] border-nevo-navy/30 text-[14.5px] font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6 disabled:cursor-not-allowed disabled:opacity-55 xl:h-[52px] xl:text-[15px]"
              >
                Back
              </button>
              <button
                type="button"
                disabled={!ready}
                onClick={() => void send()}
                className="flex h-[50px] flex-1 cursor-pointer items-center justify-center rounded-[10px] bg-nevo-navy text-[14.5px] font-semibold text-nevo-cream transition-[filter] hover:brightness-93 disabled:cursor-not-allowed disabled:opacity-55 xl:h-[52px] xl:text-[15px]"
              >
                {busy ? `Sending${"…"}` : "Yes, send"}
              </button>
            </div>
          </>
        ) : (
          <>
        <h2 className="text-xl font-semibold tracking-[-0.01em] text-nevo-near-black xl:text-[22px]">
          {`Share ${firstName} with Learning Support`}
        </h2>
        {/* The recent picture is assembled server-side from the student record
            and attached to the escalation, so this sentence is now a promise
            the backend keeps rather than one this sheet makes. */}
        <p className="mt-[9px] text-[14.5px] leading-[1.55] text-nevo-near-black/68 xl:mt-2.5 xl:text-[15px]">
          {`A note goes to your SENCo along with ${firstName}${"’"}s recent picture. They${"’"}ll take it from here.`}
        </p>
        <label className="mt-5 block text-[13px] font-semibold text-nevo-near-black/70 xl:mt-[22px] xl:text-[13.5px]">
          What are you noticing?
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={`A sentence or two is plenty${"…"}`}
            className="mt-2 h-[110px] w-full resize-none rounded-[12px] border-[1.5px] border-nevo-near-black/16 bg-nevo-cream-elevated px-[15px] py-[13px] text-[14.5px] leading-[1.5] font-normal text-nevo-near-black transition-colors focus:border-nevo-navy focus:outline-none xl:h-[120px] xl:px-4 xl:py-3.5 xl:text-[15px]"
          />
        </label>
        <div className="mt-[18px] flex gap-3 xl:mt-5">
          <button
            type="button"
            onClick={onCancel}
            className="flex h-[50px] flex-1 cursor-pointer items-center justify-center rounded-[10px] border-[1.5px] border-nevo-navy/30 text-[14.5px] font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6 xl:h-[52px] xl:text-[15px]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={review}
            className="flex h-[50px] flex-1 cursor-pointer items-center justify-center rounded-[10px] bg-nevo-navy text-[14.5px] font-semibold text-nevo-cream transition-[filter] hover:brightness-93 disabled:cursor-not-allowed disabled:opacity-55 xl:h-[52px] xl:text-[15px]"
          >
            Send to Learning Support
          </button>
        </div>

        {error && (
          <p
            role="alert"
            className="mt-3 text-[13.5px] leading-[1.5] text-nevo-navy"
          >
            {error}
          </p>
        )}
          </>
        )}
      </div>
    </div>
  );
}
