"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { ApiError, apiErrorCode } from "@/lib/api/client";
import { CONCERN_RECIPIENT_UNAVAILABLE, escalationsApi } from "@/lib/api/escalations";
import { learningSupportApi } from "@/lib/api/learningSupport";
import { useUnsavedGuard } from "@/hooks/useUnsavedGuard";
import { useKeptDraft } from "@/hooks/useKeptDraft";
import { KeptDraftNotice } from "@/components/shared/KeptDraftNotice";

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
 *
 * SCRUM-305: WHEN NOBODY HOLDS LEARNING SUPPORT (1397ec4, C.8b states 2-4).
 * The sheet asks `GET /learning-support/holders` who would receive this:
 *  - someone holds it: the sheet as it was;
 *  - nobody does, and the server names an administrator (`fallbackRecipient`):
 *    state 2, in the ticket's approved words, sending straight from
 *    "Send to {name}" as the frame draws it - then state 3, "Sent to {name},
 *    {date}", from the RESPONSE's `recipientName` and `receivedAt`. Receipt
 *    only: the frame's second line (a pronoun for the administrator, and that
 *    they "can assign someone ... from here") is not drawn - the ticket says
 *    nothing further is claimed, and a name says nothing about pronouns;
 *  - the server refuses (409 `concern_recipient_unavailable`: no holder and
 *    no administrator): state 4, the frame's words, with the note kept.
 * The name is the server's, always. Nothing here writes "your administrator",
 * and a sheet that cannot name a recipient never claims one: while the read
 * is out, or if it fails, the form says nothing about where the note goes and
 * the send itself decides.
 */

/** Who a concern would reach, as far as the holders read says. */
type Route =
  | { kind: "reading" }
  | { kind: "holder" }
  | { kind: "admin"; name: string }
  | { kind: "unknown" };

/** What the profile is told once a concern is stored. */
export type ShareSent =
  | { to: "learning_support" }
  | { to: "school_admin"; name: string | null };

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
  onSent: (sent: ShareSent) => void;
}) {
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [route, setRoute] = useState<Route>({ kind: "reading" });
  /** State 3: sent to the administrator the server named. */
  const [sentTo, setSentTo] = useState<{ name: string | null; at: string | null } | null>(null);
  /** State 4: the server had nobody to send it to. */
  const [noRecipient, setNoRecipient] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A safeguarding note, of all things, should not vanish on a refresh.
  useUnsavedGuard(note.trim().length > 0);
  // A note about a child survives the session lapsing (SCRUM-246), kept for
  // this child and offered back when the sheet is next opened.
  const keptNote = useKeptDraft(`share:${studentId}`, note, note.trim().length > 0);
  /*
   * A deliberate close throws the note away, as it always did; only being
   * taken away from it - a lapse, or leaving the page - keeps it. The kept
   * copy goes with it, or it would be offered back as unsaved next time.
   */
  const { discard } = keptNote;
  const cancel = useCallback(() => {
    discard();
    onCancel();
  }, [discard, onCancel]);

  const readRoute = useCallback(() => {
    void learningSupportApi
      .holders()
      .then((list) => {
        const name = list.fallbackRecipient?.name?.trim();
        setRoute(
          list.holders.length > 0
            ? { kind: "holder" }
            : name
              ? { kind: "admin", name }
              : // Nobody holds it and nobody is named: the send asks the
                // server, which refuses if there is truly no one (state 4).
                { kind: "unknown" },
        );
      })
      .catch(() => setRoute({ kind: "unknown" }));
  }, []);
  useEffect(() => {
    readRoute();
  }, [readRoute]);

  // Once stored, closing the sheet any way is "Done": the concern is sent.
  const done = useCallback(() => {
    onSent({ to: "school_admin", name: sentTo?.name ?? null });
  }, [onSent, sentTo]);
  const close = sentTo ? done : cancel;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  // `note` is required by the contract, and an empty referral tells the SENCo
  // nothing. Whitespace is not a note.
  // Not held for the holders read: the send asks the server, which routes it,
  // and the copy claims no recipient until the read has answered.
  const ready = note.trim().length > 0 && !busy;

  function review() {
    if (!ready) return;
    setError(null);
    // State 2 sends from its own button, as the frame draws it.
    if (route.kind === "admin") void send();
    else setConfirming(true);
  }

  async function send() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const sent = await escalationsApi.create({ studentId, note: note.trim() });
      // Sent: a sent note about a child must not come back as one that wasn't.
      discard();
      setNoRecipient(false);
      if (sent?.routedTo === "school_admin") {
        // State 3, in place, naming whoever the SERVER sent it to.
        setConfirming(false);
        setSentTo({ name: sent.recipientName?.trim() || null, at: sent.receivedAt ?? null });
      } else {
        // The sheet closes at once, before "unsaved" could clear it.
        onSent({ to: "learning_support" });
      }
    } catch (err: unknown) {
      setConfirming(false);
      if (err instanceof ApiError && apiErrorCode(err.detail) === CONCERN_RECIPIENT_UNAVAILABLE) {
        // State 4: nobody to send it to. Nothing was stored; the note stays.
        setNoRecipient(true);
        return;
      }
      // Back to the form: the error says the note "is still here", so it is.
      setError(
        route.kind === "holder"
          ? `We couldn${"’"}t send that just now. Nothing has reached your SENCo, so your note is still here to try again.`
          : route.kind === "admin"
            ? `We couldn${"’"}t send that just now. Nothing has reached ${route.name}, so your note is still here to try again.`
            : `We couldn${"’"}t send that just now. Nothing has been sent, so your note is still here to try again.`,
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
      onClick={close}
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
        {sentTo ? (
          <SentToAdmin name={sentTo.name} at={sentTo.at} onDone={done} />
        ) : noRecipient ? (
          <CannotSend
            busy={busy}
            onBack={() => {
              setNoRecipient(false);
              readRoute();
            }}
            onRetry={() => void send()}
          />
        ) : confirming ? (
          <>
            <h2 className="text-xl font-semibold tracking-[-0.01em] text-nevo-near-black xl:text-[22px]">
              Send to Learning Support?
            </h2>
            <p className="mt-[9px] text-[14.5px] leading-[1.55] text-nevo-near-black/68 xl:mt-2.5 xl:text-[15px]">
              {/* Without "They'll follow up with you, and it stays between you
                  and Learning Support" (Hub, 4 Nov, on Lydia's principle):
                  nothing confirms anyone holds Learning Support, and admins can
                  read the escalations list. They come back when the server
                  guarantees them (Teslim item 26). */}
              {route.kind === "holder"
                ? `This shares ${firstName}${"’"}s recent picture and your note with your SENCo.`
                : // Not "your SENCo": the read did not say anyone holds it.
                  `This shares ${firstName}${"’"}s recent picture and your note.`}
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
        {route.kind === "holder" && (
          <p className="mt-[9px] text-[14.5px] leading-[1.55] text-nevo-near-black/68 xl:mt-2.5 xl:text-[15px]">
            {/* Without "They'll take it from here" - the same reason. */}
            {`A note goes to your SENCo along with ${firstName}${"’"}s recent picture.`}
          </p>
        )}
        {route.kind === "admin" && (
          <p className="mt-[9px] text-[14.5px] leading-[1.55] text-nevo-near-black/68 xl:mt-2.5 xl:text-[15px]">
            {/* SCRUM-305's approved words; the name is the server's. */}
            {`No one holds learning support at this school yet, so this goes to ${route.name}, who can assign the role.`}
          </p>
        )}
        {keptNote.kept && (
          <KeptDraftNotice
            className="mt-5"
            onRestore={() => setNote(keptNote.restore() ?? "")}
            onDiscard={keptNote.discard}
          />
        )}
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
            onClick={cancel}
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
            {route.kind === "admin" ? (busy ? `Sending${"…"}` : `Send to ${route.name}`) : "Send to Learning Support"}
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

const STATE_H2 = "text-xl font-semibold tracking-[-0.01em] text-nevo-near-black xl:text-[22px]";
const STATE_P = "mt-[9px] text-[14.5px] leading-[1.55] text-nevo-near-black/68 xl:mt-2.5 xl:text-[15px]";
const PRIMARY =
  "flex h-[50px] flex-1 cursor-pointer items-center justify-center rounded-[10px] bg-nevo-navy text-[14.5px] font-semibold text-nevo-cream transition-[filter] hover:brightness-93 disabled:cursor-not-allowed disabled:opacity-55 xl:h-[52px] xl:text-[15px]";
const SECONDARY =
  "flex h-[50px] flex-1 cursor-pointer items-center justify-center rounded-[10px] border-[1.5px] border-nevo-navy/30 text-[14.5px] font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6 disabled:cursor-not-allowed disabled:opacity-55 xl:h-[52px] xl:text-[15px]";

/**
 * C.8b state 3: "Sent to {administrator name}, {date}" (SCRUM-305, approved).
 * The name and the date are the response's. Receipt is recorded and nothing
 * further is claimed - not resolved, not actioned, not under review.
 */
function SentToAdmin({ name, at, onDone }: { name: string | null; at: string | null; onDone: () => void }) {
  const day = at
    ? new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "long" })
    : null;
  return (
    <div className="flex flex-col items-start">
      <span aria-hidden className="flex size-11 items-center justify-center rounded-full bg-nevo-navy text-nevo-cream">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </span>
      <h2 className={`${STATE_H2} mt-4`}>
        {[name ? `Sent to ${name}` : "Sent", day].filter(Boolean).join(", ")}
      </h2>
      <button type="button" onClick={onDone} className={`${PRIMARY} mt-[18px] w-full xl:mt-5`}>
        Done
      </button>
    </div>
  );
}

/**
 * C.8b state 4, the frame's words: the server had no one to send it to, so
 * nothing was sent and the note is still in the box behind Back.
 */
function CannotSend({ busy, onBack, onRetry }: { busy: boolean; onBack: () => void; onRetry: () => void }) {
  return (
    <div>
      <h2 className={STATE_H2}>{`This couldn${"’"}t be sent just now`}</h2>
      <p className={STATE_P}>
        {`We couldn${"’"}t reach the right person for this at your school. Your note is kept, so nothing you wrote is lost. Please try again in a moment.`}
      </p>
      <div className="mt-[18px] flex gap-3 xl:mt-5">
        <button type="button" disabled={busy} onClick={onBack} className={SECONDARY}>
          Back
        </button>
        <button type="button" disabled={busy} onClick={onRetry} className={PRIMARY}>
          {busy ? `Sending${"…"}` : "Try again"}
        </button>
      </div>
    </div>
  );
}
