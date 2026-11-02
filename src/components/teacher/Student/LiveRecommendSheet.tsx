"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { useUnsavedGuard } from "@/hooks/useUnsavedGuard";
import { assignmentsApi } from "@/lib/api/assignments";
import { ApiError, apiErrorCode, apiErrorMessage } from "@/lib/api/client";
import { useLessonLibrary } from "@/hooks/useLessonLibrary";
import { cn } from "@/lib/utils";
import { awaitingSignOff, reviewHrefFor, UNREVIEWED_LEFT_OFF } from "@/lib/lessons/signOff";

/**
 * C08c Recommend a Lesson, for a real student.
 *
 * WHAT THIS REPLACES. `RecommendSheet` next door is fixture-shaped end to end:
 * it takes `StudentProfileData` from `lib/mocks`, reads `student.recommend!`,
 * and its send button is `onClick={() => setSent(true)}` over no network call
 * at all - then tells the teacher "That's sent to Amara". It is also
 * unreachable when signed in, because `StudentRoute` drops `recommendOpen`
 * before rendering the live profile. So the most prominent action C08c draws
 * has never once assigned a lesson.
 *
 * NO NEW ENDPOINT. `docs/BUILD_STATUS.md` filed this under NEEDS BACKEND with
 * "No POST exists to send one", which was wrong: `AssignmentCreate.studentIds`
 * takes up to 500 ids, so "recommend this lesson to this one child" is an
 * assignment with one student in it. `assignmentsApi.create` is already wrapped
 * and already tested, so this reuses it rather than adding a second path to the
 * same thing.
 *
 * THE NOTE FIELD IS BUILT, AS OF 15 SEP. It was absent because neither
 * `AssignmentCreate` nor `LessonAssignmentRequest` had anywhere to put it, and
 * a box that silently discarded what a teacher wrote about a named child is
 * worse than no box. Backend added `note` to both that afternoon, so the box
 * is here and what it holds is sent.
 *
 * WHAT THE CONFIRMATION MAY NOW SAY - RULED 23 SEP, SAID 24 SEP.
 *
 * This held a deliberately smaller sentence for three days. C08c's line is
 * "She'll see your note when she opens it", and the confirmation would only
 * say the note went WITH the lesson, because that was all that had happened.
 * The reason was not that the note was unrendered: it was that the audience
 * had not been ruled, and the open question was whether the note was for the
 * teacher's own use or was meant for the PARENT. Treating the transport as
 * the ruling - it rides `students/me/dashboard`, so it must be for the child
 * - was the mistake this comment existed to prevent.
 *
 * Design ruled on 23 Sep: the note reaches the CHILD, attributed to the
 * teacher, and is never adapted. The student lane drew it the same day on the
 * lesson screen, reading the same `note` off the child's own dashboard. So
 * the sentence is true now, and it is said.
 *
 * DESIGN WROTE THE SENTENCE, 24 Sep: *"Your note goes with this lesson and
 * only [student] sees it."* That is what it says.
 *
 * It is not C08c's line, and not the one shipped on 24 Sep either - that read
 * "They'll see your note when they open it", which was true and said less than
 * design wanted said. Theirs carries the part a teacher actually needs: that
 * the note is private to that child. Neither version says "she" about a real
 * child whose pronouns nothing here knows.
 *
 * THE "SUGGESTED" BADGE, SINCE 12 OCT. `Recommendation` was prose with no
 * lesson id, so nothing connected Nevo's sentence to a row in the library.
 * It carries a nullable `lessonId` now: that row is marked "Suggested" and the
 * sheet opens on it, as C08c draws. Advice that names no lesson, or names one
 * this list does not offer, marks nothing.
 */
export function LiveRecommendSheet({
  studentId,
  firstName,
  suggestion,
  suggestedLessonId = null,
  onClose,
}: {
  studentId: string;
  firstName: string;
  /** Nevo's own words, when there are any. Never invented. */
  suggestion?: string | null;
  /** The lesson Nevo's suggestion means, when it names one (12 Oct). */
  suggestedLessonId?: string | null;
  onClose: () => void;
}) {
  /**
   * `sample` and `loading` were both dropped here, and that was the bug.
   *
   * `useLessonLibrary` returns eight FIXTURE_CARDS whenever the read is in
   * flight OR has failed. This sheet destructured only `{cards, live}`, so a
   * signed-in teacher whose library read failed was offered "Solving Linear
   * Equations", "Comprehension: Things Fall Apart" and six more as though they
   * were their own, with no sample notice. The honest-empty branch below is
   * `cards.length === 0`, which eight fixtures make unreachable, so the "we
   * couldn't reach your library" copy that already existed never once rendered.
   *
   * This sheet is mounted only by `LiveStudentProfile`, which is signed-in
   * only, so fixtures here are never the designed walkthrough - they are always
   * leakage.
   *
   * NOT MARKED WITH `SampleRegion` LIKE THE LIBRARY SCREEN, but withheld. The
   * library screen shows samples behind a notice because reading them is
   * harmless. Here the teacher would ACT on one: pressing Recommend posts the
   * fixture's slug id where the contract wants a uuid, so the send 422s. A
   * lesson you cannot send is not worth offering behind a caveat.
   */
  const { cards: libraryCards, live, loading } = useLessonLibrary();
  /*
   * ONLY LESSONS THAT CAN BE SENT - the guard the assign wizard gained on
   * 24 Sep, and the one this door, which posts to the same endpoint, missed.
   *
   * The library hands back three kinds. A FAILED parse leaves a lesson row
   * with no sections, so choosing one sent a child an empty lesson; one still
   * PARSING is not sendable yet, and this list has no drawn way to say "not
   * yet" about one row. Absent is the honest version, as it is in the wizard.
   *
   * Filtered only when live: the fixtures are never offered here at all.
   */
  /*
   * NOR ONE NOBODY HAS SIGNED OFF: a recommendation is an assignment, and
   * Assign waits for the lesson-wide sign-off (Lydia, 25 Oct). The library
   * says which since Teslim's 294584b. The send still asks the review, for a
   * sign-off that lapsed after the list was read.
   */
  const cards = live
    ? libraryCards.filter((c) => c.kind === "normal" && c.reviewComplete !== false)
    : libraryCards;
  const heldBack = live
    ? libraryCards.filter((c) => c.kind === "normal" && c.reviewComplete === false).length
    : 0;
  /** What the teacher has picked themselves. */
  const [picked, setChoice] = useState<string | null>(null);
  /*
   * C08c STARTS ON NEVO'S SUGGESTION - the frame draws it chosen and marked.
   * Only when that lesson is actually offered here; the teacher's own pick
   * always wins, and they still confirm.
   */
  const suggestedHere =
    suggestedLessonId && cards.some((c) => c.id === suggestedLessonId)
      ? suggestedLessonId
      : null;
  const choice = picked ?? suggestedHere;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  // Their own choice or words, not the default the sheet opened on.
  useUnsavedGuard((picked !== null || note.trim().length > 0) && sent === null);
  /** Whether the lesson that was sent carried a note, for the confirmation. */
  const [sentWithNote, setSentWithNote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The lesson a refusal is about, when there is one to open. */
  const [errorHref, setErrorHref] = useState("");
  /** What that link says: a refusal about sections, or about the review. */
  const [errorLink, setErrorLink] = useState("");

  const chosen = cards.find((c) => c.id === choice) ?? null;

  async function send() {
    if (!chosen || busy) return;
    setBusy(true);
    setError(null);
    setErrorHref("");
    setErrorLink("");
    try {
      /*
       * ASSIGN WAITS FOR THE LESSON-WIDE SIGN-OFF (Lydia, 25 Oct), and a
       * recommendation is an assignment. The list below is the library, which
       * carries no sign-off, so the one lesson being sent is asked about.
       */
      const held = await awaitingSignOff([chosen.id]);
      if (held.has(chosen.id)) {
        setError(`${chosen.title} isn${"’"}t reviewed yet, so it can${"’"}t go to ${firstName}.`);
        setErrorHref(reviewHrefFor(chosen.id));
        setErrorLink("Review it");
        return;
      }
      // Optional, so an untouched box sends nothing rather than "". Whitespace
      // is not a note: a teacher who tabbed through the field did not write to
      // this child, and an empty bubble on her dashboard would say they had.
      const written = note.trim();
      const res = await assignmentsApi.create({
        lessonIds: [chosen.id],
        studentIds: [studentId],
        ...(written ? { note: written } : {}),
      });
      /*
       * A 201 IS NOT A SEND. `createdCount: 0` means nothing was created -
       * most often because this child already has the lesson, which the
       * server says in `duplicateCount`. The sheet read neither and said
       * "That's sent", and "your note goes with this lesson" over a note that
       * went nowhere, because no new assignment exists to hold it.
       *
       * The wizard's sentence, with the child named as this sheet names them
       * everywhere else. Absent `duplicateCount` is not a duplicate: an
       * older deployment that does not send it gets the plain "not sent".
       */
      if (res.createdCount === 0) {
        setError(
          (res.duplicateCount ?? 0) > 0
            ? `${firstName} already has this lesson, so nothing was sent again.`
            : `We couldn${"’"}t send that just now. Nothing has changed, so you can try again.`,
        );
        return;
      }
      setSentWithNote(written.length > 0);
      setSent(chosen.title);
    } catch (err: unknown) {
      /*
       * A 409 IS NOT A FAILURE TO RETRY - the wizard's rule, missed here.
       *
       * `lesson_not_approved` means the lesson still has something a teacher
       * must settle, and "try again" is the one instruction that cannot help.
       * The server names what is outstanding in `detail.message`, so that is
       * what is said, with the way to the lesson that settles it.
       */
      if (
        err instanceof ApiError &&
        err.status === 409 &&
        apiErrorCode(err.detail) === "lesson_not_approved"
      ) {
        setError(
          apiErrorMessage(err.detail) ??
            "This lesson still has sections waiting for you, so it cannot go to students yet.",
        );
        setErrorHref(`/teacher/lessons/${chosen.id}`);
        return;
      }
      // Nothing is confirmed until something is stored. The old sheet said
      // "That's sent" unconditionally, which is the failure this guards.
      setError(
        `We couldn${"’"}t send that just now. Nothing has changed, so you can try again.`,
      );
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Shell onClose={onClose} narrow>
        <h2 className="text-[20px] font-semibold text-nevo-near-black xl:text-[21px]">
          {`That${"’"}s sent to ${firstName}`}
        </h2>
        <p className="mt-3 text-[14.5px] leading-[1.6] text-nevo-near-black/72 xl:mt-2.5 xl:text-[15px] xl:leading-[1.55]">
          {sentWithNote
            ? `${"“"}${sent}${"”"} is now waiting in ${firstName}${"’"}s lessons. Your note goes with this lesson and only ${firstName} sees it.`
            : `${"“"}${sent}${"”"} is now waiting in ${firstName}${"’"}s lessons.`}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 h-12 w-full cursor-pointer rounded-[10px] bg-nevo-navy text-[14.5px] font-semibold text-nevo-cream transition-[filter] hover:brightness-93 xl:mt-[22px] xl:text-[15px]"
        >
          {`Back to ${firstName}${"’"}s profile`}
        </button>
      </Shell>
    );
  }

  return (
    <Shell onClose={onClose}>
      {/* C08c's header: the title, and a close button beside it. */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[20px] font-semibold text-nevo-near-black xl:text-[22px]">
          {`Recommend a lesson to ${firstName}`}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[10px] text-nevo-near-black/50 transition-colors hover:bg-nevo-near-black/5 xl:size-[34px]"
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="xl:size-5">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      {suggestion && (
        <div className="mt-4 rounded-[12px] bg-nevo-violet/12 px-4 py-3.5 xl:mt-[18px] xl:px-[18px] xl:py-4">
          <p className="text-[11.5px] font-semibold tracking-[0.04em] text-nevo-navy uppercase xl:text-xs">
            Nevo suggests
          </p>
          <p className="mt-[7px] text-[14px] leading-[1.55] text-nevo-near-black/78 xl:mt-2 xl:text-[15px]">
            {suggestion}
          </p>
        </div>
      )}

      <p className="mt-5 text-[13px] font-semibold tracking-[0.04em] text-nevo-near-black/55 uppercase">
        Which lesson
      </p>

      {loading ? (
        <div className="mt-3 flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[52px] animate-pulse rounded-[10px] bg-nevo-cream-elevated"
            />
          ))}
        </div>
      ) : !live || cards.length === 0 ? (
        /*
         * One branch for both, keyed on `live` for the wording. Previously this
         * tested `cards.length === 0` alone, which the fixture cards made
         * unreachable - so the failure copy below has never been on screen.
         */
        <p className="mt-3 text-[14px] leading-[1.55] text-nevo-near-black/62">
          {live && heldBack > 0
            ? `None of your lessons is reviewed yet, so there is nothing to send ${firstName}. Review one from your library first.`
            : live
            ? `Your library is empty, so there is nothing to send ${firstName} yet. Upload a lesson and it will appear here.`
            : `We couldn${"’"}t reach your library just now. Nothing has changed, so you can try again.`}
        </p>
      ) : (
        <div className="mt-3 flex max-h-[280px] flex-col gap-[9px] overflow-y-auto xl:mt-2">
          {cards.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={choice === c.id}
              onClick={() => setChoice(c.id)}
              className={cn(
                // C08c's option card: cream, a radio, and a 2px navy outline
                // when chosen.
                "flex cursor-pointer items-center gap-[13px] rounded-[12px] bg-nevo-cream-elevated px-4 py-3.5 text-left transition-[outline-color,border-color]",
                choice === c.id
                  ? "outline-2 -outline-offset-2 outline-nevo-navy"
                  : "border border-nevo-near-black/8 hover:border-nevo-navy/35",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-[22px] shrink-0 items-center justify-center rounded-full",
                  choice === c.id ? "bg-nevo-navy" : "border-2 border-nevo-near-black/24",
                )}
              >
                {choice === c.id && <span className="size-2.5 rounded-full bg-nevo-cream" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-semibold text-nevo-near-black xl:text-[15px]">
                  {c.title}
                </span>
                {c.meta && (
                  <span className="mt-0.5 block text-[12.5px] text-nevo-near-black/58 xl:text-[13px]">
                    {c.meta}
                  </span>
                )}
              </span>
              {c.id === suggestedHere && (
                <span className="shrink-0 rounded-full bg-nevo-violet/24 px-[9px] py-[3px] text-[11px] font-semibold text-nevo-navy">
                  Suggested
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {live && cards.length > 0 && heldBack > 0 && (
        <p className="mt-2.5 text-[13px] leading-[1.5] text-nevo-near-black/60">
          {UNREVIEWED_LEFT_OFF}
        </p>
      )}

      {/* C08c's "Add a note for Amara (optional)". Hidden when there is
          nothing to send, because a box for a message attached to no lesson
          would collect words that go nowhere.

          THAT INCLUDES WHILE THE LIST IS LOADING OR HAS FAILED. `cards` is
          never empty then - the hook serves its fixtures - so the box sat
          under the skeleton and under "we couldn't reach your library",
          attached to nothing, exactly as the line above forbids. `live` is
          false for the whole in-flight window as well as after a failure, so
          it is the one condition both cases need. */}
      {live && cards.length > 0 && (
        <label className="mt-5 block text-[13px] font-semibold tracking-[0.04em] text-nevo-near-black/55 uppercase xl:mt-[18px]">
          {`Add a note for ${firstName} (optional)`}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            // C08c's own placeholder: a teacher talking to the child.
            placeholder={`Try this one - I think it${"’"}ll click${"…"}`}
            className="mt-2 h-[84px] w-full resize-none rounded-[10px] border border-nevo-near-black/15 px-3.5 py-3 text-[14.5px] leading-[1.5] font-normal tracking-normal text-nevo-near-black normal-case transition-colors focus:border-nevo-navy focus:outline-none xl:h-[76px]"
          />
        </label>
      )}

      <div className="mt-[18px] flex gap-3 xl:mt-5">
        <button
          type="button"
          onClick={onClose}
          className="h-12 flex-1 cursor-pointer rounded-[10px] border border-nevo-near-black/15 text-[14.5px] font-medium text-nevo-near-black/72 xl:h-[50px] xl:text-[15px]"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!chosen || busy}
          onClick={() => void send()}
          className="h-12 flex-[2] cursor-pointer rounded-[10px] bg-nevo-navy text-[14.5px] font-semibold text-nevo-cream transition-[filter] hover:brightness-93 disabled:cursor-not-allowed disabled:opacity-55 xl:h-[50px] xl:text-[15px]"
        >
          {busy ? `Sending${"…"}` : "Recommend this lesson"}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-[13.5px] leading-[1.5] text-nevo-navy">
          {error}
          {errorHref && (
            <>
              {" "}
              {/* The wizard's link, word for word. */}
              <Link
                href={errorHref}
                className="cursor-pointer font-semibold text-nevo-navy underline-offset-2 hover:underline"
              >
                {errorLink || "Open the lesson and check them"}
              </Link>
            </>
          )}
        </p>
      )}
    </Shell>
  );
}

function Shell({
  children,
  onClose,
  narrow = false,
}: {
  children: React.ReactNode;
  onClose: () => void;
  narrow?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, { onEscape: onClose });
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-nevo-near-black/28 backdrop-blur-[1.5px] sm:items-center"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Recommend a lesson"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "max-h-[90dvh] w-full max-w-[520px] overflow-y-auto rounded-t-[16px] bg-nevo-cream p-7 sm:rounded-[16px]",
          narrow ? "xl:max-w-[420px] xl:p-9" : "xl:max-w-[560px] xl:p-[30px]",
        )}
      >
        {children}
      </div>
    </div>
  );
}
