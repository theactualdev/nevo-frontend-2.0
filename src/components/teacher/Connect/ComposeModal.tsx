"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { useUnsavedGuard } from "@/hooks/useUnsavedGuard";
import { useStudentDirectory } from "@/hooks/useStudentDirectory";
import { useHasSession } from "@/hooks/useHasSession";
import { studentSlug } from "@/lib/mocks/teacherStudents";
import { useTeacherClasses } from "@/hooks/useTeacherClasses";
import {
  COMPOSE_CLASS_FILTERS,
  COMPOSE_STUDENTS,
  type ComposeStudent,
} from "@/lib/mocks/teacherConnect";
import { cn } from "@/lib/utils";

/**
 * Compose (C10b / `Nevo Teacher Compose`) - choose a student, then write.
 * Parents were removed from the teacher side in the 25 Aug drop, so the
 * include-parent toggle, the "Parent linked" badge and the no-parent-contact
 * note are all gone.
 *
 * Sending is now a real lifecycle rather than a toast: the form is REPLACED
 * by a full-pane sending state, then by a terminal sent or failed state.
 * Neither terminal state auto-dismisses - the teacher chooses what happens
 * next - and a failure keeps the draft, because the copy promises it does.
 *
 * Flagged to design: the component frame draws this as a full screen with the
 * rail mounted, while C10b draws a modal. Built inside the modal we already
 * have, since that is the smaller change and matches C10b; the phase states
 * still replace the form rather than overlaying it.
 *
 * `onSend` posts for real - see `useConnectThreads`. Recipients are the
 * teacher's own students, gathered from their class rosters.
 */

type Phase = "form" | "sending" | "sent" | "failed";

/** Prototype-only in the frame; here it stands in for the real request. */
const SEND_MS = 750;

export function ComposeModal({
  preset,
  onClose,
  onSend,
}: {
  /**
   * Whoever the link named: a student id for a signed-in teacher, or a
   * fixture slug for the signed-out walkthrough. Resolved HERE, because
   * this is where the roster is - the screen above would need a second
   * read of the same directory to do it.
   */
  preset?: string;
  onClose: () => void;
  /** May be async; a rejection is what puts the flow in its failed state. */
  onSend: (student: ComposeStudent, text: string) => void | Promise<void>;
}) {
  const [query, setQuery] = useState("");
  // Filter chips follow the teacher's real classes; "All classes" leads.
  const { options: classes, live } = useTeacherClasses();
  const signedIn = useHasSession();
  const {
    students: directory,
    loading: directoryLoading,
    failed: directoryFailed,
  } = useStudentDirectory();
  /*
   * A signed-in teacher's own classes, or none. The chips were built from
   * `options` unguarded, which is the fixture three while the read is in
   * flight and after it fails - and picking "JSS 2A" filtered a REAL roster
   * by an invented class's name. The roster below was already guarded; its
   * filter was not. Signed out, the walkthrough keeps its three.
   */
  const classFilters = [
    COMPOSE_CLASS_FILTERS[0],
    ...(live || !signedIn ? classes : []).map((c) => c.name),
  ];
  const [filter, setFilter] = useState(COMPOSE_CLASS_FILTERS[0]);
  // Never preset from the fixtures for a signed-in teacher: those rows carry
  // no studentId, and a preselected one would arm the send button against a
  // child who does not exist. Signed out, the link carries a fixture slug.
  const [chosen, setChosen] = useState<ComposeStudent | null>(() =>
    signedIn
      ? null
      : (COMPOSE_STUDENTS.find((s) => studentSlug(s.name) === preset) ?? null),
  );
  const [presetUsed, setPresetUsed] = useState(false);
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  // A message written and not yet sent, or one that failed to go.
  useUnsavedGuard(text.trim().length > 0 && phase !== "sent");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Escape belongs to the form; a send in flight owns the screen.
      if (e.key === "Escape" && phase === "form") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, phase]);

  // Real students when we have them; the fixtures only back the designed
  // screens. A compose list of invented children on a screen that sends
  // messages would be the worst place for one.
  const roster: ComposeStudent[] = useMemo(
    () =>
      directory.length > 0
        ? directory.map((s) => ({
            name: s.name,
            className: s.className,
            initials: s.initials,
            studentId: s.studentId,
          }))
        : // Gated on the SESSION, not on `live`. `live` is false while the
          // class list is merely in flight, so a signed-in teacher was shown
          // eight invented children on a screen that sends messages - and
          // those rows carry no studentId, so picking one reported a message
          // sent to nobody.
          signedIn
          ? []
          : COMPOSE_STUDENTS,
    [directory, signedIn],
  );

  /*
   * THE DEEP LINK LANDS HERE, and it has to wait for the roster.
   *
   * "Send them a message" on a student's profile passes that child's id.
   * The directory is a live read, so the match is not available when this
   * mounts - and it is matched on `studentId`, never on a name, because a
   * name match would preselect the wrong child in a school with two
   * Amaras.
   *
   * DERIVED, NOT SET IN AN EFFECT. Writing it with `useEffect` +
   * `setPicked` is what React's own lint rule calls a cascading render,
   * and it made the preselection race the roster read. So the recipient is
   * whatever the teacher chose, falling back to whoever the link named -
   * until the link's choice has been used, which is what `presetUsed`
   * records when they send and start another.
   */
  const fromLink = useMemo(
    () =>
      signedIn && preset && !presetUsed
        ? (roster.find((s) => s.studentId === preset) ?? null)
        : null,
    [signedIn, preset, presetUsed, roster],
  );
  const picked = chosen ?? fromLink;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return roster.filter(
      (s) =>
        (filter === "All classes" || s.className === filter) &&
        (!q || s.name.toLowerCase().includes(q)),
    );
  }, [query, filter, roster]);

  const firstName = picked?.name.split(" ")[0] ?? "the student";
  const ready = Boolean(picked) && text.trim().length > 0;
  // Advisory from first paint, never a post-click scold. Recipient first.
  const outstanding = !picked
    ? "Choose who this is going to."
    : !text.trim()
      ? "Add a short message."
      : "";

  const attempt = () => {
    if (!picked) return;
    setPhase("sending");
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    timers.current.push(
      setTimeout(() => {
        // The draft survives either way - the failure copy promises it, and
        // nothing here clears `picked` or `text`.
        void Promise.resolve()
          .then(() => onSend(picked, text.trim()))
          .then(() => setPhase("sent"))
          .catch(() => setPhase("failed"));
      }, reduced ? 0 : SEND_MS),
    );
  };

  const sendAnother = () => {
    // The link's choice has been used. Without this the next compose would
    // reopen on the child the teacher has just finished messaging.
    setPresetUsed(true);
    setChosen(null);
    setText("");
    setPhase("form");
  };


  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-nevo-near-black/28 backdrop-blur-[1.5px] p-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
      onClick={() => phase === "form" && onClose()}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="New message"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[480px] rounded-[16px] bg-nevo-cream p-7 shadow-[0_8px_32px_rgba(0,0,0,0.16)] motion-safe:animate-in motion-safe:zoom-in-95 motion-safe:duration-200 xl:max-w-[520px] xl:p-[30px]"
      >
        {phase === "sending" && (
          <div className="flex flex-col items-center py-10 text-center">
            <span
              role="status"
              aria-label="Sending"
              className="size-11 rounded-full border-[3px] border-nevo-navy/20 border-t-nevo-navy motion-safe:animate-spin motion-safe:[animation-duration:700ms]"
            />
            <p className="mt-5 text-[16px] text-nevo-near-black/70">
              {"Sending your message…"}
            </p>
          </div>
        )}

        {phase === "sent" && (
          <div className="mx-auto flex max-w-[440px] flex-col items-center py-6 text-center">
            <span className="flex size-[72px] items-center justify-center rounded-full bg-nevo-navy motion-safe:animate-nevo-pop">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#f7f1e6" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12.5l4.5 4.5L19 7" />
              </svg>
            </span>
            <h2 className="mt-[26px] text-[26px] font-semibold tracking-[-0.015em] text-nevo-near-black">
              Message sent
            </h2>
            <p className="mt-3 text-[16px] leading-[1.6] text-nevo-near-black/70">
              {`Your note to ${firstName} is on its way.`}
            </p>
            <p className="mt-2 text-[14.5px] leading-[1.55] text-nevo-near-black/55">
              {"It's saved to the conversation in Connect."}
            </p>
            <div className="mt-7 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-12 cursor-pointer items-center rounded-[10px] bg-nevo-navy px-6 text-[15px] font-semibold text-nevo-cream transition-[filter,transform] duration-150 hover:brightness-93 active:scale-[0.98]"
              >
                Back to Connect
              </button>
              <button
                type="button"
                onClick={sendAnother}
                className="inline-flex h-12 cursor-pointer items-center rounded-[10px] border-[1.5px] border-nevo-navy/30 px-[22px] text-[15px] font-medium text-nevo-navy transition-[background-color,transform] duration-150 hover:bg-nevo-navy/6 active:scale-[0.98]"
              >
                Send another
              </button>
            </div>
          </div>
        )}

        {phase === "failed" && (
          <div className="mx-auto flex max-w-[460px] flex-col items-center py-6 text-center">
            {/* Soft violet, never red - a failure is ours, not an alarm. */}
            <span className="flex size-[72px] items-center justify-center rounded-full bg-nevo-violet/20 text-nevo-navy motion-safe:animate-nevo-pop">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 4v6h6" />
                <path d="M20 20v-6h-6" />
                <path d="M20 8a8 8 0 0 0-14.9-2M4 16a8 8 0 0 0 14.9 2" />
              </svg>
            </span>
            <h2 className="mt-[26px] text-[26px] font-semibold tracking-[-0.015em] text-nevo-near-black">
              {"We couldn't send that just now"}
            </h2>
            <p className="mt-3 text-[16px] leading-[1.6] text-nevo-near-black/70">
              Something went wrong on our side. Your message is saved as a
              draft, so nothing is lost.
            </p>
            <div className="mt-7 flex gap-3">
              <button
                type="button"
                onClick={attempt}
                className="inline-flex h-12 cursor-pointer items-center rounded-[10px] bg-nevo-navy px-6 text-[15px] font-semibold text-nevo-cream transition-[filter,transform] duration-150 hover:brightness-93 active:scale-[0.98]"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => setPhase("form")}
                className="inline-flex h-12 cursor-pointer items-center rounded-[10px] border-[1.5px] border-nevo-navy/30 px-[22px] text-[15px] font-medium text-nevo-navy transition-[background-color,transform] duration-150 hover:bg-nevo-navy/6 active:scale-[0.98]"
              >
                Go back to editing
              </button>
            </div>
            <p className="mt-[18px] text-[14px] leading-[1.55] text-nevo-near-black/55">
              If it keeps happening, your school admin can help.
            </p>
          </div>
        )}

        {phase === "form" && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-[-0.01em] text-nevo-near-black xl:text-[22px]">
                New message
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex size-8 cursor-pointer items-center justify-center rounded-[9px] text-nevo-near-black/50 transition-colors hover:bg-nevo-near-black/5 xl:size-[34px]"
              >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="xl:size-5">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            {!picked ? (
              <>
                <div className="relative mt-4 xl:mt-[18px]">
                  <span className="absolute top-1/2 left-[15px] -translate-y-1/2 text-nevo-near-black/45">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <circle cx="11" cy="11" r="7" />
                      <path d="M21 21l-4-4" />
                    </svg>
                  </span>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search your students"
                    aria-label="Search your students"
                    className="h-12 w-full rounded-[10px] border-[1.5px] border-nevo-near-black/14 bg-nevo-cream-elevated pr-4 pl-[42px] text-[15px] text-nevo-near-black outline-none transition-colors focus:border-nevo-navy"
                  />
                </div>

                <div className="mt-2 flex flex-wrap gap-[7px]">
                  {classFilters.map((f) => {
                    const on = f === filter;
                    return (
                      <button
                        key={f}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setFilter(f)}
                        className={cn(
                          "cursor-pointer rounded-full px-[13px] py-1.5 text-[12.5px] font-medium transition-[filter]",
                          on
                            ? "bg-nevo-navy text-nevo-cream"
                            : "border border-nevo-near-black/8 bg-nevo-cream-elevated text-nevo-near-black/70 hover:brightness-[0.985]",
                        )}
                      >
                        {f}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3.5 max-h-[300px] overflow-y-auto">
                  {shown.map((s) => (
                    <button
                      // By who, not what they are called (T169): two Amaras
                      // shared a key, and React drew one where there were two.
                      // With the class, because the directory lists a child
                      // once per class they are in.
                      key={`${s.studentId ?? s.name}:${s.className}`}
                      type="button"
                      onClick={() => setChosen(s)}
                      className="flex w-full cursor-pointer items-center gap-[13px] rounded-[10px] px-2 py-[11px] text-left transition-colors hover:bg-nevo-navy/6"
                    >
                      <span className="flex size-[38px] shrink-0 items-center justify-center rounded-full bg-nevo-navy/10 text-[12.5px] font-semibold text-nevo-navy">
                        {s.initials}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-medium text-nevo-near-black">
                          {s.name}
                        </span>
                        <span className="mt-px block text-[12.5px] text-nevo-near-black/55">
                          {s.className}
                        </span>
                      </span>
                    </button>
                  ))}
                  {shown.length === 0 &&
                    (directoryLoading ? (
                      <div className="space-y-2 px-2 py-2">
                        {[0, 1, 2].map((i) => (
                          <div
                            key={i}
                            className="h-[46px] animate-pulse rounded-[10px] bg-nevo-cream-inset"
                          />
                        ))}
                      </div>
                    ) : query.trim() ? (
                      <p className="px-2 py-4 text-[13px] text-nevo-near-black/50">
                        {`No students match “${query.trim()}”.`}
                      </p>
                    ) : (
                      <p className="px-2 py-4 text-[13px] leading-[1.5] text-nevo-near-black/50">
                        {/* A roster we could not READ is not a class with no
                            students in it. */}
                        {live && !directoryFailed
                          ? "Nobody has joined your classes yet, so there’s nobody to message."
                          : "We couldn’t load your students just now, so there’s nobody to choose. Try again in a moment."}
                      </p>
                    ))}
                </div>

                {/* The frame keeps one advisory for the whole form; our picker
                    is the step where the recipient is still missing. */}
                {outstanding && (
                  <span className="mt-3 block text-[13.5px] text-nevo-violet">
                    {outstanding}
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="mt-4 block text-[13px] font-semibold text-nevo-near-black/70 xl:mt-[18px]">
                  To
                </span>
                <div className="mt-2 flex items-center gap-[11px] rounded-[10px] bg-nevo-cream-elevated px-3.5 py-2.5">
                  <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-nevo-navy text-xs font-semibold text-nevo-cream">
                    {picked.initials}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-[14.5px] font-semibold text-nevo-near-black">
                      {picked.name}
                    </span>
                    <span className="ml-2 text-[12.5px] text-nevo-near-black/55">
                      {picked.className}
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label="Choose a different student"
                    onClick={() => {
                      setPresetUsed(true);
                      setChosen(null);
                    }}
                    className="shrink-0 cursor-pointer text-nevo-near-black/45 transition-colors hover:text-nevo-near-black/70"
                  >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </div>

                <label className="mt-4 block text-[13px] font-semibold text-nevo-near-black/70">
                  Message
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Write your message…"
                    className="mt-2 h-[110px] w-full resize-none rounded-[10px] border-[1.5px] border-nevo-near-black/16 bg-nevo-cream-elevated px-3.5 py-3 text-[14.5px] leading-[1.5] font-normal text-nevo-near-black outline-none transition-colors focus:border-nevo-navy"
                  />
                </label>

                <div className="mt-[18px] flex items-center gap-3.5">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex h-[50px] cursor-pointer items-center justify-center rounded-[10px] border-[1.5px] border-nevo-navy/30 px-5 text-[15px] font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => ready && attempt()}
                    className={cn(
                      "flex h-[50px] items-center justify-center gap-2 rounded-[10px] bg-nevo-navy px-6 text-[15px] font-semibold text-nevo-cream transition-[filter]",
                      ready
                        ? "cursor-pointer hover:brightness-93"
                        : "cursor-default opacity-50",
                    )}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M22 2L11 13" />
                      <path d="M22 2l-7 20-4-9-9-4z" />
                    </svg>
                    Send message
                  </button>
                  {outstanding && (
                    <span className="text-[13.5px] text-nevo-violet">
                      {outstanding}
                    </span>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
