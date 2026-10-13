"use client";

import { useEffect, useRef, useState } from "react";
import { useDialogFocus } from "@/hooks/useDialogFocus";

/**
 * C.8b Share with Learning Support - the escalation sheet over the profile.
 * A note goes to the SENCo with the student's recent picture; the tone stays
 * plain and non-clinical, and nothing here is scored or coloured as an alarm.
 *
 * THIS IS THE SAMPLE SHEET. The one that sends is `LiveShareSheet`, built
 * 15 Sep against `POST /api/v1/escalations`; it follows C14 Teacher State
 * Patterns B5 (sheet dismisses, toast confirms, a quiet note settles under the
 * student's name) rather than the older component frame's in-sheet success
 * panel - flagged to design. This one keeps the layout and sends nothing,
 * because it is mounted only for a signed-out visitor looking at a fixture.
 *
 * Cancel discards the draft, so reopening always starts empty (the component
 * frame's `closeShare` clears the note).
 */
export function ShareSheet({
  studentName,
  onCancel,
}: {
  studentName: string;
  onCancel: () => void;
}) {
  const [note, setNote] = useState("");
  const firstName = studentName.split(" ")[0];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

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
        <h2 className="text-xl font-semibold tracking-[-0.01em] text-nevo-near-black xl:text-[22px]">
          {`Share ${firstName} with Learning Support`}
        </h2>
        <p className="mt-[9px] text-[14.5px] leading-[1.55] text-nevo-near-black/68 xl:mt-2.5 xl:text-[15px]">
          {`A note goes to your SENCo along with ${firstName}'s recent picture. They'll take it from here.`}
        </p>
        <label className="mt-5 block text-[13px] font-semibold text-nevo-near-black/70 xl:mt-[22px] xl:text-[13.5px]">
          What are you noticing?
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="A sentence or two is plenty&hellip;"
            className="mt-2 h-[110px] w-full resize-none rounded-[12px] border-[1.5px] border-nevo-near-black/16 bg-nevo-cream-elevated px-[15px] py-[13px] text-[14.5px] leading-[1.5] font-normal text-nevo-near-black transition-colors focus:border-nevo-navy focus:outline-none xl:h-[120px] xl:px-4 xl:py-3.5 xl:text-[15px]"
          />
        </label>
        <div className="mt-[18px] flex gap-3 xl:mt-5">
          <button
            type="button"
            onClick={onCancel}
            className="flex h-[50px] flex-1 cursor-pointer items-center justify-center rounded-[10px] border-[1.5px] border-nevo-navy/30 text-[14.5px] font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6 xl:h-[52px] xl:text-[15px]"
          >
            Close
          </button>
          <p className="mb-3 w-full text-[13px] leading-[1.5] text-nevo-near-black/62">
            This is a sample student, so nothing is sent. Sign in to share a
            child in your own classes with your SENCo.
          </p>
          {/* STILL NO SEND HERE, FOR A DIFFERENT REASON NOW.
              Until 15 Sep there was no teacher-to-SENCo transport at all:
              `POST /api/messages` constrains recipientType to ^(student|class)$,
              the IEP share takes a parentId, and the flags read is GET-only.
              `POST /api/v1/escalations` closed that gap, and the real sheet is
              `LiveShareSheet`, mounted by `LiveStudentProfile`.
              This component backs the SAMPLE profile, which `StudentRoute`
              renders only when there is no token. Posting a fixture student's
              id would raise a genuine safeguarding escalation, in front of a
              real SENCo, about a child who does not exist - so the sample
              screen stays inert and says why. */}
          <button
            type="button"
            disabled
            title="This is a sample student"
            className="flex h-[50px] flex-1 cursor-not-allowed items-center justify-center rounded-[10px] bg-nevo-navy/18 text-[14.5px] font-semibold text-nevo-near-black/40 xl:h-[52px] xl:text-[15px]"
          >
            Send to Learning Support
          </button>
        </div>
      </div>
    </div>
  );
}
