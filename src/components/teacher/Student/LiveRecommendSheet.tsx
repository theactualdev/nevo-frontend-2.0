"use client";

import Link from "next/link";
import { useState } from "react";
import { assignmentsApi } from "@/lib/api/assignments";
import { ApiError, apiErrorCode, apiErrorMessage } from "@/lib/api/client";
import { useLessonLibrary } from "@/hooks/useLessonLibrary";
import { cn } from "@/lib/utils";

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
 * ONE PART OF THE FRAME IS STILL NOT BUILT, deliberately:
 *
 *    NO "SUGGESTED" BADGE. The frame marks one option as Nevo's suggestion.
 *     `Recommendation` is `{id, studentId, recommendationText, generatedAt}` -
 *     prose, with no lesson id - so nothing connects Nevo's sentence to a row
 *     in the library. The sentence is shown above the list, which is what the
 *     frame's "Nevo suggests" block is; the badge needs a `lessonId` on the
 *     recommendation. Raised with backend.
 */
export function LiveRecommendSheet({
  studentId,
  firstName,
  suggestion,
  onClose,
}: {
  studentId: string;
  firstName: string;
  /** Nevo's own words, when there are any. Never invented. */
  suggestion?: string | null;
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
  const cards = live
    ? libraryCards.filter((c) => c.kind === "normal")
    : libraryCards;
  const [choice, setChoice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  /** Whether the lesson that was sent carried a note, for the confirmation. */
  const [sentWithNote, setSentWithNote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The lesson a refusal is about, when there is one to open. */
  const [errorHref, setErrorHref] = useState("");

  const chosen = cards.find((c) => c.id === choice) ?? null;

  async function send() {
    if (!chosen || busy) return;
    setBusy(true);
    setError(null);
    setErrorHref("");
    try {
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
      <Shell onClose={onClose}>
        <h2 className="text-[19px] font-semibold text-nevo-near-black">
          {`That${"’"}s sent to ${firstName}`}
        </h2>
        <p className="mt-3 text-[14.5px] leading-[1.6] text-nevo-near-black/72">
          {sentWithNote
            ? `${"“"}${sent}${"”"} is now waiting in ${firstName}${"’"}s lessons. Your note goes with this lesson and only ${firstName} sees it.`
            : `${"“"}${sent}${"”"} is now waiting in ${firstName}${"’"}s lessons.`}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 h-12 w-full cursor-pointer rounded-[10px] bg-nevo-navy text-[14.5px] font-semibold text-nevo-cream transition-[filter] hover:brightness-93"
        >
          {`Back to ${firstName}${"’"}s profile`}
        </button>
      </Shell>
    );
  }

  return (
    <Shell onClose={onClose}>
      <h2 className="text-[19px] font-semibold text-nevo-near-black">
        {`Recommend a lesson to ${firstName}`}
      </h2>

      {suggestion && (
        <div className="mt-4 rounded-[12px] bg-nevo-violet/12 px-4 py-3.5">
          <p className="text-[12.5px] font-semibold tracking-[0.04em] text-nevo-navy uppercase">
            Nevo suggests
          </p>
          <p className="mt-1.5 text-[14px] leading-[1.55] text-nevo-near-black/78">
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
          {live
            ? `Your library is empty, so there is nothing to send ${firstName} yet. Upload a lesson and it will appear here.`
            : `We couldn${"’"}t reach your library just now. Nothing has changed, so you can try again.`}
        </p>
      ) : (
        <div className="mt-3 flex max-h-[280px] flex-col gap-2 overflow-y-auto">
          {cards.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={choice === c.id}
              onClick={() => setChoice(c.id)}
              className={cn(
                "cursor-pointer rounded-[10px] border px-3.5 py-3 text-left transition-colors",
                choice === c.id
                  ? "border-nevo-navy bg-nevo-navy/6"
                  : "border-nevo-near-black/12 hover:border-nevo-navy/35",
              )}
            >
              <span className="block text-[14.5px] font-medium text-nevo-near-black">
                {c.title}
              </span>
              {c.meta && (
                <span className="mt-0.5 block text-[12.5px] text-nevo-near-black/55">
                  {c.meta}
                </span>
              )}
            </button>
          ))}
        </div>
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
        <label className="mt-5 block text-[13px] font-semibold tracking-[0.04em] text-nevo-near-black/55 uppercase">
          {`Add a note for ${firstName} (optional)`}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={`A line about why you picked this${"…"}`}
            className="mt-2 h-[84px] w-full resize-none rounded-[10px] border border-nevo-near-black/15 px-3.5 py-3 text-[14.5px] leading-[1.5] font-normal tracking-normal text-nevo-near-black normal-case transition-colors focus:border-nevo-navy focus:outline-none"
          />
        </label>
      )}

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={onClose}
          className="h-12 flex-1 cursor-pointer rounded-[10px] border border-nevo-near-black/15 text-[14.5px] font-medium text-nevo-near-black/72"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!chosen || busy}
          onClick={() => void send()}
          className="h-12 flex-[2] cursor-pointer rounded-[10px] bg-nevo-navy text-[14.5px] font-semibold text-nevo-cream transition-[filter] hover:brightness-93 disabled:cursor-not-allowed disabled:opacity-55"
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
                Open the lesson and check them
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
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-nevo-near-black/28 sm:items-center"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Recommend a lesson"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90dvh] w-full max-w-[460px] overflow-y-auto rounded-t-[18px] bg-nevo-cream px-6 py-7 sm:rounded-[18px]"
      >
        {children}
      </div>
    </div>
  );
}
