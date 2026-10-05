"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, apiErrorCode, apiErrorMessage } from "@/lib/api/client";
import { assignmentsApi } from "@/lib/api/assignments";
import { useLessonLibrary } from "@/hooks/useLessonLibrary";
import { useStudentDirectory } from "@/hooks/useStudentDirectory";
import { useHasSession } from "@/hooks/useHasSession";
import { useSystemMessages } from "@/components/shared/SystemMessages";
import { useTeacherClasses } from "@/hooks/useTeacherClasses";
import { cn } from "@/lib/utils";
import { MaybeSample } from "@/components/shared/SampleRegion";

/**
 * C07i Lesson Assignment: four steps, each a direct question - conversational
 * even though it's a form. Recipients are constrained to assigned classes.
 * No recurring schedules in v1. A standalone takeover per the frame (no
 * sidebar), with the dots strip and "N/4" counter.
 *
 * Interpretations flagged in the PR: the "Specific students" panel has no
 * frame - built from the step's own checkbox-card pattern over the class
 * rosters; Continue honest-disables while a step has no selection (the
 * sanctioned incomplete-form case); the "Available now" confirm sentence and
 * the post-confirm route (Library) are undesigned.
 *
 * WHAT A TEACHER IS TOLD AFTERWARDS, which was nothing until 26 Sep. QA: a
 * teacher assigned a lesson and got no sign anything had happened - the wizard
 * closed onto the Library and the SCRUM-152 bar never fired, though it fires
 * for the review on the very next screen they visit.
 *
 * THE SENTENCE IS DESIGN'S, NOT THIS FILE'S. The assign confirmation was never
 * written as a screen, but it WAS drawn: two of SM-01's own examples in
 * `43 System Messages` are assignments - *"Adding Fractions assigned to JSS
 * 2A."* and *"Simplifying Algebraic Fractions assigned to JSS 2A."* - under the
 * rule *"one line, past tense, names the thing... no 'Success', no
 * 'successfully'."* So the line is that shape, filled with the names this
 * wizard already shows on step 4 - the words the teacher has just read and
 * confirmed. For one lesson and one class it is design's example exactly.
 *
 * THE POST-CONFIRM ROUTE GETS IT TOO, by construction rather than a second
 * call. The bar's provider lives in `app/teacher/layout.tsx`, which stays
 * mounted as the wizard hands over to the Library, so a line raised here is
 * still on screen when the Library arrives - and the Library reads its lessons
 * fresh on mount, so the card beneath it already says the lesson is assigned.
 * WHERE it lands is still undesigned: opened from a lesson's own page, this
 * returns the teacher to the Library rather than to that lesson.
 *
 * Submit is live against POST /api/v1/assignments - one call per selected
 * class, since the payload takes many lessons but a single class, which the
 * backend expands to that class's current enrolment.
 *
 * Step 1 offers the teacher's real library when there is one, and step 2's
 * "Specific students" offers their real students.
 *
 * THAT SECOND HALF WAS REFUSED ON A FALSE PREMISE until 15 Sep. The guard said
 * "the live class list carries no roster, so there are no real ids to send",
 * which is true of the class LIST - `AssignedClassResponse` carries no roster -
 * and not true of the product: `GET /api/v1/classes/{class_id}/students`
 * returns `studentId` per child, `useStudentDirectory` already fans the class
 * list out across it for the compose picker, and `AssignmentCreate.studentIds`
 * accepts up to 500. Three pieces, all built, all tested, none joined up. The
 * refusal was correct when written and outlived its reason.
 *
 * SCHEDULING IS LIVE. `availableFrom` landed on 31 Aug 2026, so step 3 now
 * sends the date it has always been asking for. It is deliberately NOT
 * `dueAt`: a lesson scheduled to open on Friday is not a lesson due on
 * Friday, and mapping one onto the other would have said so on screen.
 *
 * The frame's date literal is `2026-07-11`, a placeholder that is now in the
 * past - shipping it as a live default would have scheduled every lesson to
 * open weeks ago. The field instead starts EMPTY and is filled with tomorrow
 * the moment a teacher chooses "Schedule for later", which is the only point
 * a default is meaningful. It is filled in the toggle's handler, not during
 * render, so there is no server/client date to disagree about.
 */

type Step = 1 | 2 | 3 | 4;

const LESSONS: { id: string; title: string; meta: string }[] = [
  {
    id: "simplifying-algebraic-fractions",
    title: "Simplifying Algebraic Fractions",
    meta: "Mathematics · This term",
  },
  {
    id: "solving-linear-equations",
    title: "Solving Linear Equations",
    meta: "Mathematics · This term",
  },
  {
    id: "angles-triangles",
    title: "Angles & Triangles",
    meta: "Mathematics · This term",
  },
  {
    id: "things-fall-apart",
    title: "Comprehension: Things Fall Apart",
    meta: "English · This term",
  },
];

const check = (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

function CheckCard({
  on,
  onClick,
  title,
  sub,
  compactTitle,
}: {
  on: boolean;
  onClick: () => void;
  title: string;
  sub?: string;
  compactTitle?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "flex w-full cursor-pointer items-center gap-3.5 rounded-xl bg-nevo-cream-elevated px-[18px] py-4 text-left shadow-[0_2px_8px_rgba(0,0,0,0.06)]",
        on && "outline-2 -outline-offset-2 outline-nevo-navy",
      )}
    >
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-[7px]",
          on
            ? "bg-nevo-navy text-nevo-cream"
            : "border-2 border-nevo-near-black/24",
        )}
      >
        {on && check}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "font-semibold text-nevo-near-black",
            compactTitle ? "text-[15px]" : "text-[15px] xl:text-[15.5px]",
          )}
        >
          {title}
        </span>
        {sub && (
          <span className="mt-[3px] block text-[12.5px] text-nevo-near-black/60 xl:text-[13px]">
            {sub}
          </span>
        )}
      </span>
    </button>
  );
}

function Toggle({
  left,
  right,
  value,
  onChange,
}: {
  left: string;
  right: string;
  value: "left" | "right";
  onChange: (v: "left" | "right") => void;
}) {
  const seg = (on: boolean) =>
    cn(
      "flex-1 cursor-pointer rounded-lg p-3 text-center text-[15px] font-medium transition-colors",
      on ? "bg-nevo-navy text-nevo-cream" : "text-nevo-near-black/60",
    );
  return (
    <div className="mt-[22px] flex rounded-[11px] bg-nevo-navy/8 p-1">
      <button
        type="button"
        onClick={() => onChange("left")}
        className={seg(value === "left")}
      >
        {left}
      </button>
      <button
        type="button"
        onClick={() => onChange("right")}
        className={seg(value === "right")}
      >
        {right}
      </button>
    </div>
  );
}

const fmtList = (names: string[]) =>
  names.length <= 1
    ? (names[0] ?? "")
    : names.length === 2
      ? `${names[0]} and ${names[1]}`
      : `${names[0]} and ${names.length - 1} more`;

/**
 * The server's sentence, then ours about what to do next.
 *
 * It ends the server's text properly first. The contract promises the message
 * names the lessons and what is outstanding; it does not promise a full stop,
 * and running two sentences together would read as one.
 */
function withNextStep(message: string): string {
  const said = message.trim();
  const stopped = /[.!?]$/.test(said) ? said : `${said}.`;
  return `${stopped} Open them from your Library and check them.`;
}

export function AssignWizard({ preselect }: { preselect?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [chosen, setChosen] = useState<Set<string>>(
    () => new Set(preselect ? [preselect] : []),
  );
  const [who, setWho] = useState<"left" | "right">("left"); // left = whole class
  const [classes, setClasses] = useState<Set<string>>(new Set());
  // Recipients are the teacher's real assignments when a session has them.
  /*
   * `loading` WAS DROPPED HERE, and that was the hole.
   *
   * `useTeacherClasses` serves the six fixture classes whenever `data` is
   * null - which includes the ENTIRE in-flight window, not just a failure. The
   * sample notice below and the confirm guard both key on `sample`, which is
   * only true once the read has actually FAILED. So for as long as the class
   * list took to arrive, a signed-in teacher saw invented classes with nothing
   * saying so, and a class picked in that window was a FIXTURE ID on its way
   * to `POST /api/v1/assignments`.
   *
   * This is the same `live`-versus-`loading` confusion that put another
   * school's name under "My Classes", and `useTeacherClasses.loading` exists to
   * separate "not back yet" from "never coming". Signed out, `useLiveQuery`
   * reports `loading: false` immediately, so the designed walkthrough is
   * untouched by this.
   */
  const {
    options: myClasses,
    sample: classesSample,
    loading: classesLoading,
  } = useTeacherClasses();
  /*
   * The same fan-out the compose picker uses: the class list joined to each
   * class's roster. A class whose roster fails contributes nothing rather than
   * failing the whole directory, and `failed` says so - "we could not find
   * out" and "these classes have no students" are different sentences on the
   * screen that assigns work.
   */
  const {
    students: directory,
    loading: directoryLoading,
    failed: directoryFailed,
  } = useStudentDirectory();
  /** The directory, grouped for the picker. Class order follows the directory. */
  const byClass: [string, typeof directory][] = [];
  for (const s of directory) {
    const row = byClass.find(([name]) => name === s.className);
    if (row) row[1].push(s);
    else byClass.push([s.className, [s]]);
  }
  const [students, setStudents] = useState<Set<string>>(new Set());
  const [when, setWhen] = useState<"left" | "right">("left"); // left = available now
  // Empty until "Schedule for later" is chosen - see the note above.
  const [date, setDate] = useState("");
  const [time, setTime] = useState("08:00");
  const [submitting, setSubmitting] = useState(false);
  const signedIn = useHasSession();
  const [error, setError] = useState("");
  /**
   * Where the refusal sends them, when there is somewhere to send them.
   *
   * SCRUM-153's rule, and the one this screen broke: Nevo never points a
   * teacher at a page by a name that is not in the sidebar, and a message
   * that names a destination makes it reachable in one click.
   */
  const [errorHref, setErrorHref] = useState("");
  /*
   * THE SAME HOLE AS THE CLASS LIST, IN THE LIST BESIDE IT. QA, 22 Sep:
   * "fodder lessons flash before the real ones."
   *
   * `live` is false for the ENTIRE in-flight window, not just a failure, so
   * `: LESSONS` drew the frame's four invented lessons at every signed-in
   * teacher for as long as their library took to arrive - and then swapped
   * them for the real ones under the cursor. Worse than the flash: a lesson
   * chosen in that window is a FIXTURE ID on its way to
   * `POST /api/v1/assignments`.
   *
   * The comment forty lines above diagnoses this exactly, for classes, and
   * the fix landed there and not here. `sample` is the honest signal - it is
   * true only once the read has FAILED - and signed out, `useLiveQuery`
   * reports `loading: false` at once, so the designed walkthrough keeps its
   * four.
   */
  const {
    cards,
    live,
    sample: lessonsSample,
    loading: lessonsLoading,
  } = useLessonLibrary();
  /*
   * ONLY LESSONS THAT EXIST. `useLessonLibrary` returns three kinds - normal,
   * parsing and failed - and this list took all of them, so a lesson whose
   * parse died was selectable and its id went to `POST /api/v1/assignments`.
   *
   * That stopped being hypothetical this week: a failed parse leaves a lesson
   * row behind with zero segments, and there are two of them in the E2E tenant
   * right now. A teacher could send a child an empty lesson.
   *
   * The Library screen has always drawn both kinds correctly - a failed lesson
   * is a non-clickable "This lesson couldn't be processed." card - so it was
   * only this door that was missing the guard.
   *
   * Still parsing is left out too. It is not assignable YET, and this list has
   * no way to say "not yet" about one row; a disabled row is a state design has
   * not drawn. Absent is the honest version until they do.
   */
  /*
   * AND NOT THE FIXTURES, ONCE SIGNED IN. A failed library read put the
   * frame's four invented lessons in front of a signed-in teacher - pickable,
   * unmarked, and refused only at step 4 after classes and a time had been
   * chosen for them. The walkthrough keeps them; a real teacher is told the
   * read failed, in the sentence step 4 already used for it.
   */
  const lessons = live
    ? cards
        .filter((c) => c.kind === "normal")
        .map((c) => ({ id: c.id, title: c.title, meta: c.meta }))
    : !signedIn
      ? LESSONS
      : [];

  /** Tomorrow in `YYYY-MM-DD`, local. Called from a handler, never render. */
  const tomorrow = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  /**
   * Picking a different KIND of recipient clears the other kind. The two sets
   * were independent, so a teacher who chose classes, switched to "Specific
   * students" and ticked two names got a step-4 summary reading "2 students in
   * JSS 2A" over a request that assigned the lessons to every student in every
   * class still selected.
   */
  const chooseWho = (v: "left" | "right") => {
    setWho(v);
    if (v === "left") setStudents(new Set());
    else setClasses(new Set());
  };

  const chooseWhen = (v: "left" | "right") => {
    setWhen(v);
    // A default only means anything once "later" is actually chosen.
    if (v === "right" && !date) setDate(tomorrow());
  };

  const togIn = <T,>(set: Set<T>, v: T) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    return n;
  };

  const canContinue =
    step === 1
      ? chosen.size > 0
      : step === 2
        ? who === "left"
          ? classes.size > 0
          : students.size > 0
        : // Step 3: scheduling for later needs BOTH halves. `time` is a
          // clearable input, and an empty one built `new Date("2026-09-01T")`
          // - an Invalid Date that printed as "Invalid Date" on step 4 and
          // then threw out of `toISOString()`, leaving Confirm stuck on
          // "Assigning..." for ever with nothing sent and nothing said.
          when === "left" || (Boolean(date) && Boolean(time));

  const close = () => router.push("/teacher/lessons");
  const say = useSystemMessages();

  /**
   * One call per class. Nothing is claimed until every call has landed: a
   * partial failure says so rather than reporting an assignment that only
   * half happened.
   */
  const confirm = async () => {
    // A SIGNED-OUT visitor is walking the designed demo; closing is its end.
    // A SIGNED-IN teacher is not, and this used to close for them too whenever
    // the library had not loaded - so they saw "All set", pressed Confirm, and
    // were returned to their library with nothing assigned and nothing said.
    // Their chosen ids are fixture ids in that state, so the assignment cannot
    // be made at all; the only honest thing is to say so and stay put.
    if (!signedIn) {
      close();
      return;
    }
    if (classesLoading) {
      // Unreachable while the picker holds skeletons, kept because the cost of
      // being wrong here is a fixture id in a real school's assignments.
      setError(
        "Your classes are still loading. Give it a moment and try again.",
      );
      return;
    }
    if (classesSample) {
      setError(
        "We couldn’t reach your school, so we can’t assign to those classes. Nothing has been sent - try again in a moment.",
      );
      return;
    }
    if (!live) {
      setError(
        "We couldn’t load your lessons, so we can’t assign them. Nothing has been sent - reopen this from your library and try again.",
      );
      return;
    }
    if (who === "right" && students.size === 0) {
      setError("Choose at least one student before confirming.");
      return;
    }
    if (who === "left" && classes.size === 0) {
      setError("Choose at least one class before confirming.");
      return;
    }

    // "Available now" sends nothing rather than now-as-a-timestamp: the
    // absence is what "open immediately" means, and a stamped `now` would
    // drift by however long the request takes.
    let availableFrom: string | undefined;
    if (when === "right" && date && time) {
      const at = new Date(`${date}T${time}`);
      if (Number.isNaN(at.getTime())) {
        setError(
          "That date and time didn’t read properly - check them and try again.",
        );
        return;
      }
      availableFrom = at.toISOString();
    }

    setSubmitting(true);
    setError("");
    setErrorHref("");
    const lessonIds = [...chosen];
    /*
     * ONE REQUEST FOR A STUDENT PICK, one per class otherwise.
     *
     * `AssignmentCreate` takes `studentIds` up to 500, so every chosen student
     * goes in a single call - which also means the partial-failure story below
     * cannot apply to it: one request either lands or it does not. Whole
     * classes stay one request each, because `classId` is singular and a
     * teacher picking three classes is three assignments.
     */
    const targets: { classId?: string; studentIds?: string[] }[] =
      who === "right"
        ? [{ studentIds: [...students] }]
        : [...classes].map((classId) => ({ classId }));

    // allSettled, NOT all: `Promise.all` rejects on the FIRST failure while
    // the other requests are already in flight and still land server-side.
    // The teacher was then told "Nothing has been sent" over classes that HAD
    // been assigned, and the retry it invited assigned them a second time -
    // there is no idempotency key on this endpoint.
    const results = await Promise.allSettled(
      targets.map((t) =>
        assignmentsApi.create({ lessonIds, ...t, availableFrom }),
      ),
    );
    setSubmitting(false);

    const failed = targets.filter((_, i) => results[i].status === "rejected");
    const created = results.reduce(
      (n, r) => n + (r.status === "fulfilled" ? r.value.createdCount : 0),
      0,
    );
    /*
     * The other reason nothing was created. Absent is not zero: an older
     * deployment that does not send the field must not be read as "and none
     * of them were duplicates", so this counts only what was actually said.
     */
    const duplicates = results.reduce(
      (n, r) =>
        n + (r.status === "fulfilled" ? (r.value.duplicateCount ?? 0) : 0),
      0,
    );

    /*
     * A 409 IS NOT A FAILURE TO RETRY.
     *
     * From 17 Sep a lesson cannot be assigned until a teacher has approved
     * every one of its segments, and both assignment doors share the check.
     * The refusal is `409 lesson_not_approved`.
     *
     * "Try again" is the one instruction that cannot work here, and it is the
     * same class of mistake as telling a rate-limited teacher to retry: the
     * server is not failing, it is declining, and the teacher has an action
     * that fixes it. So this names the action and points at the screen that
     * performs it.
     */
    const refusal = results.find(
      (r) =>
        r.status === "rejected" &&
        r.reason instanceof ApiError &&
        r.reason.status === 409 &&
        apiErrorCode(r.reason.detail) === "lesson_not_approved",
    );
    const notApproved = refusal !== undefined;
    /**
     * THE SERVER NAMES THE LESSONS NOW, and until 24 Sep we threw that away.
     *
     * The 409 is documented: `detail.message names each lesson and what is
     * outstanding on it`. Our own sentence could not, because we had nothing
     * to name them with - so a teacher who chose four lessons was told "ONE of
     * these lessons still has sections waiting for you" and left to find out
     * which by opening all four.
     *
     * ONE REQUEST PER CLASS, so several refusals arrive for the same pick.
     * They carry the same facts: approval is a property of the LESSON, not of
     * the class it was going to, so the first one that speaks is read and the
     * rest are duplicates of it.
     *
     * AND YES, THIS IS THE OPPOSITE OF WHAT THE UPLOAD SCREEN DID YESTERDAY,
     * where the server's `error` stopped being rendered. The two are not the
     * same kind of string. That one is a background task's free text, undocumented,
     * and the first real one seen was an asyncpg exception. This one is a
     * documented field on a documented status whose contract states what it
     * contains, and it is written for the person who has to act on it. The
     * house rule is already on `apiErrorMessage`: where the server has
     * troubled to explain, show the explanation.
     */
    const named =
      refusal && refusal.status === "rejected"
        ? apiErrorMessage((refusal.reason as ApiError).detail)
        : null;

    if (failed.length === targets.length) {
      /*
       * "OPEN IT FROM MY LESSONS" WAS THIS LINE, and no such page has ever
       * existed - the sidebar has Library. A teacher whose lesson was
       * refused was sent looking for a screen that is not there, which is
       * how a demonstration ended on 19 September (SCRUM-153, item 1).
       *
       * One lesson is the case that can be pointed at precisely. Several
       * chosen at once cannot name one, so that message names none rather
       * than picking a lesson for them.
       */
      const single = lessonIds.length === 1 ? lessonIds[0] : null;
      setErrorHref(notApproved && single ? `/teacher/lessons/${single}` : "");
      setError(
        notApproved
          ? named
            ? /*
               * One lesson already gets a link to it, so the server's sentence
               * stands alone; several have nowhere to point, so they keep the
               * clause that says where to go.
               */
              single
              ? named
              : withNextStep(named)
            : single
              ? "This lesson still has sections waiting for you, so it cannot go to students yet."
              : "One of these lessons still has sections waiting for you, so it cannot go to students yet. Open it from your Library and check them."
          : "We couldn’t assign that just now. Nothing has been sent - try again.",
      );
      return;
    }
    if (failed.length > 0) {
      // Name what DID land, so a retry is an informed choice rather than a
      // gamble on double-assigning.
      //
      // Only reachable for a CLASS pick: a student pick is one request, so any
      // failure is total and the branch above has already returned. Reading
      // `classId` here is therefore always defined, but it is read defensively
      // rather than asserted.
      const names = failed
        .map(
          (t) => myClasses.find((c) => c.id === t.classId)?.name ?? "one class",
        )
        .join(", ");
      setError(
        `Assigned to the other classes, but ${names} didn’t go through. Don’t redo the whole thing - reopen this for ${names} only.`,
      );
      return;
    }
    if (created === 0) {
      /*
       * TWO REASONS NOTHING WAS CREATED, and this said the wrong one.
       *
       * A teacher re-assigning a lesson their class already has got "those
       * classes may have no students enrolled yet" - a sentence about their
       * roster, over a class that is full and already holding the lesson. The
       * server had said so all along in `duplicateCount`; nothing read it.
       */
      setError(
        duplicates > 0
          ? duplicates === 1
            ? "That student already has this lesson, so nothing was sent again."
            : `Those ${duplicates} students already have this lesson, so nothing was sent again.`
          : "Nothing was assigned - those classes may have no students enrolled yet.",
      );
      return;
    }
    /*
     * Said only HERE, where every request landed and something was created.
     * The signed-out demo closes above without it - nothing was assigned - and
     * a partial or refused assignment stays open with its own sentence rather
     * than being announced as done.
     */
    say.show({ kind: "confirm", message: confirmedLine() });
    close();
  };

  const lessonsText = fmtList(
    lessons.filter((l) => chosen.has(l.id)).map((l) => l.title),
  );
  const whoText =
    who === "left"
      ? fmtList(myClasses.filter((c) => classes.has(c.id)).map((c) => c.name))
      : (() => {
          /* The selection is `studentId`s now, not `${classId}:${name}`, so
             the classes named here come from the directory rather than from
             parsing a key apart. */
          const classNames = [
            ...new Set(
              directory
                .filter((d) => students.has(d.studentId))
                .map((d) => d.className),
            ),
          ];
          return `${students.size} ${students.size === 1 ? "student" : "students"}${
            classNames.length > 0 ? ` in ${fmtList(classNames)}` : ""
          }`;
        })();
  /**
   * SM-01: *"{lesson} assigned to {class}."* - design's drawn line, with this
   * wizard's own step-4 names in it. No date: the drawn sentence has none, and
   * "assigned" is as true of a lesson opening on Friday as of one open now.
   */
  const confirmedLine = () => `${lessonsText} assigned to ${whoText}.`;
  const whenText =
    when === "right" && date
      ? (() => {
          const d = new Date(`${date}T${time}`);
          const day = d.toLocaleDateString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
          });
          const t = d.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          });
          return `on ${day} at ${t}`;
        })()
      : "now";

  const heading = {
    1: "Choose lessons",
    2: "Who's this for?",
    3: "When should this be available?",
    4: "All set",
  }[step];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-nevo-cream text-nevo-near-black">
      {/* Top bar */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-nevo-near-black/8 px-7 xl:h-[72px] xl:px-8">
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="flex size-10 cursor-pointer items-center justify-center rounded-[10px] text-nevo-near-black/60 transition-colors hover:bg-nevo-near-black/5"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <span className="text-[14.5px] font-medium text-nevo-near-black/70 xl:text-[15px]">
          Assign lessons
        </span>
        <span className="w-10 text-right text-[13px] text-nevo-near-black/50 xl:text-[13.5px]">
          {step}/4
        </span>
      </div>

      {/* Progress dots */}
      <div className="flex shrink-0 justify-center gap-2 pt-[18px] pb-1 xl:pt-[22px] xl:pb-1.5">
        {([1, 2, 3, 4] as const).map((i) => (
          <span
            key={i}
            className={cn(
              "size-[9px] rounded-full",
              i === step
                ? "bg-nevo-navy"
                : i < step
                  ? "bg-nevo-navy/40"
                  : "bg-nevo-navy/15",
            )}
          />
        ))}
      </div>

      {/* Body */}
      {step === 4 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-7 py-5 xl:px-8">
          <div className="flex max-w-[420px] flex-col items-center text-center xl:max-w-[440px]">
            <div className="flex size-[54px] items-center justify-center rounded-full bg-nevo-navy text-nevo-cream motion-safe:animate-nevo-pop xl:size-14">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h2 className="mt-[18px] text-[23px] font-semibold tracking-[-0.015em] xl:mt-5 xl:text-[26px]">
              All set
            </h2>
            <p className="mt-3.5 text-base leading-[1.6] text-nevo-near-black/78 xl:mt-4 xl:text-[17px]">
              <strong className="font-semibold text-nevo-near-black">
                {lessonsText}
              </strong>{" "}
              will open for{" "}
              <strong className="font-semibold text-nevo-near-black">
                {whoText}
              </strong>{" "}
              {when === "right" ? (
                <>
                  on{" "}
                  <strong className="font-semibold text-nevo-near-black">
                    {whenText.replace(/^on /, "")}
                  </strong>
                </>
              ) : (
                <strong className="font-semibold text-nevo-near-black">
                  now
                </strong>
              )}
              .
            </p>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 justify-center overflow-y-auto px-7 pt-4 pb-7 xl:px-8 xl:pt-5 xl:pb-8">
          <div className="w-full max-w-[540px] xl:max-w-[560px]">
            <h2 className="mt-2 text-[23px] font-semibold tracking-[-0.015em] xl:mt-3.5 xl:text-[26px]">
              {heading}
            </h2>

            {step === 1 && (
              <div className="mt-[18px] flex flex-col gap-2.5 xl:mt-5 xl:gap-[11px]">
                {/* Skeletons, not fixtures - the same answer the class list
                    below already gives. A lesson that is never offered cannot
                    be picked. */}
                {lessonsLoading &&
                  [0, 1, 2].map((i) => (
                    <div
                      key={`skeleton-${i}`}
                      className="h-[74px] animate-pulse rounded-[12px] bg-nevo-cream-elevated"
                    />
                  ))}
                {signedIn && lessonsSample && (
                  <p className="text-[14px] leading-[1.55] text-nevo-near-black/68">
                    We couldn&rsquo;t load your lessons, so we can&rsquo;t
                    assign them. Nothing has been sent - reopen this from your
                    library and try again.
                  </p>
                )}
                {/* An empty library had no nothing-state: the heading over
                    nothing and a Continue that would not go. The recommend
                    sheet's sentence for the same empty shelf. */}
                {live && cards.length === 0 && (
                  <p className="text-[14px] leading-[1.55] text-nevo-near-black/68">
                    Your library is empty, so there is nothing to assign yet.
                    Upload a lesson and it will appear here.
                  </p>
                )}
                <MaybeSample showing={!live} kind="teacher:assign-lessons">
                {lessons.map((l) => (
                  <CheckCard
                    key={l.id}
                    on={chosen.has(l.id)}
                    onClick={() => setChosen((s) => togIn(s, l.id))}
                    title={l.title}
                    sub={l.meta}
                  />
                ))}
                </MaybeSample>
              </div>
            )}

            {step === 2 && (
              <>
                <Toggle
                  left="Whole class"
                  right="Specific students"
                  value={who}
                  onChange={chooseWho}
                />
                {classesSample && (
                  /* A signed-in teacher whose class list failed was shown
                     fixture classes, fixture headcounts and sixteen invented
                     children by name - on the screen that assigns work, with
                     nothing saying they were not real. */
                  <p className="mt-3 max-w-[560px] text-[13px] leading-[1.5] text-nevo-near-black/60 italic">
                    We couldn&rsquo;t reach your school just now, so these are
                    sample classes. Nothing you pick here will be assigned.
                  </p>
                )}
                {who === "left" ? (
                  <div className="mt-4 flex flex-col gap-2.5 xl:mt-[18px] xl:gap-[11px]">
                    {/*
                      Skeletons, not fixtures. The guard at confirm is a
                      backstop; THIS is the fix - a fixture that is never
                      offered cannot be picked, and a teacher who never saw
                      invented classes has nothing to un-choose.
                    */}
                    {classesLoading
                      ? [0, 1, 2].map((i) => (
                          <div
                            key={i}
                            className="h-[74px] animate-pulse rounded-[12px] bg-nevo-cream-elevated"
                          />
                        ))
                      : (
                        /* The sample classes carry the notice above AND the
                           mark, so the signed-in end-to-end check can see
                           them - it could not before. */
                        <>
                        {/* No classes yet: Home's sentence, not a heading
                            over nothing. Only reachable once the read has
                            answered - loading draws skeletons above, and a
                            failure or no session serves the fixtures. */}
                        {myClasses.length === 0 && (
                          <p className="text-[14px] leading-[1.55] text-nevo-near-black/68">
                            You don&rsquo;t have any classes yet. When your
                            school adds you to one, it will appear here.
                          </p>
                        )}
                        <MaybeSample
                          showing={classesSample || !signedIn}
                          kind="teacher:assign-classes"
                        >
                        {myClasses.map((c) => (
                          <CheckCard
                            key={c.id}
                            on={classes.has(c.id)}
                            onClick={() => setClasses((s) => togIn(s, c.id))}
                            title={c.name}
                            sub={
                              c.studentCount != null
                                ? `${c.studentCount} students`
                                : undefined
                            }
                          />
                        ))}
                        </MaybeSample>
                        </>
                      )}
                  </div>
                ) : (
                  <div className="mt-4 flex flex-col gap-4 xl:mt-[18px]">
                    {/*
                     * REAL STUDENTS, keyed by `studentId`. The fixture version
                     * keyed on `${classId}:${name}`, which is what a screen
                     * does when it has no ids - and it had none because nobody
                     * had joined the class list to the rosters. Two children
                     * sharing a name would also have shared a key.
                     */}
                    {directoryLoading && (
                      <p className="text-[13.5px] text-nevo-near-black/60">
                        Finding your students…
                      </p>
                    )}
                    {!directoryLoading && directory.length === 0 && (
                      <p className="text-[13.5px] leading-[1.5] text-nevo-near-black/60">
                        {directoryFailed
                          ? "We couldn’t reach your classes just now, so we can’t list your students. Nothing will be sent until we can."
                          : "There are no students in your classes yet. Once your school adds them they will appear here."}
                      </p>
                    )}
                    {byClass.map(([className, rows]) => (
                      <div key={className}>
                        <div className="font-mono text-[10.5px] font-bold tracking-[0.1em] text-nevo-violet">
                          {className.toUpperCase()}
                        </div>
                        <div className="mt-2 flex flex-col gap-2">
                          {rows.map((s) => (
                            <CheckCard
                              key={s.studentId}
                              on={students.has(s.studentId)}
                              onClick={() =>
                                setStudents((v) => togIn(v, s.studentId))
                              }
                              title={s.name}
                              compactTitle
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                    {directoryFailed && directory.length > 0 && (
                      /* A partial directory is still worth offering, but a
                         teacher must know a class is missing from it. */
                      <p className="text-[13px] leading-[1.5] text-nevo-near-black/60 italic">
                        One of your classes didn’t load, so some students may be
                        missing from this list.
                      </p>
                    )}
                  </div>
                )}
              </>
            )}

            {step === 3 && (
              <>
                {/* One control for everyone: `availableFrom` is live, so a
                    real teacher gets the frame's step rather than a notice
                    explaining why they cannot have it. */}
                <Toggle
                  left="Available now"
                  right="Schedule for later"
                  value={when}
                  onChange={chooseWhen}
                />
                {when === "right" && (
                  <div className="mt-4 flex gap-3.5 xl:mt-[18px]">
                    <div className="flex-1">
                      <label className="block text-[13.5px] font-semibold text-nevo-near-black/70">
                        Date
                        <span className="relative mt-2 block">
                          <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="h-[52px] w-full cursor-pointer rounded-[10px] border-[1.5px] border-nevo-near-black/16 bg-nevo-cream-elevated px-4 pr-11 text-[15.5px] font-normal text-nevo-near-black outline-none focus:border-nevo-navy [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
                          />
                          <svg
                            className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2"
                            width="19"
                            height="19"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="rgba(43,43,47,0.5)"
                            strokeWidth="1.9"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden
                          >
                            <rect x="3" y="5" width="18" height="16" rx="2" />
                            <path d="M3 9h18" />
                            <path d="M8 3v4M16 3v4" />
                          </svg>
                        </span>
                      </label>
                    </div>
                    <div className="flex-1">
                      <label className="block text-[13.5px] font-semibold text-nevo-near-black/70">
                        Time
                        <span className="relative mt-2 block">
                          <input
                            type="time"
                            value={time}
                            onChange={(e) => setTime(e.target.value)}
                            className="h-[52px] w-full cursor-pointer rounded-[10px] border-[1.5px] border-nevo-near-black/16 bg-nevo-cream-elevated px-4 pr-11 text-[15.5px] font-normal text-nevo-near-black outline-none focus:border-nevo-navy [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
                          />
                          <svg
                            className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2"
                            width="19"
                            height="19"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="rgba(43,43,47,0.5)"
                            strokeWidth="1.9"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden
                          >
                            <circle cx="12" cy="12" r="9" />
                            <path d="M12 7v5l3 2" />
                          </svg>
                        </span>
                      </label>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* A failed assignment owns the footer: the teacher must not leave this
          screen believing work was sent when it was not. */}
      {error && (
        <div className="shrink-0 px-7 pb-3 xl:px-8">
          <p className="mx-auto max-w-[560px] rounded-[10px] bg-nevo-violet/14 px-[14px] py-3 text-[13.5px] leading-[1.5] text-nevo-near-black/78">
            {error}
            {errorHref && (
              <>
                {" "}
                <Link
                  href={errorHref}
                  className="font-semibold text-nevo-navy underline-offset-2 hover:underline"
                >
                  Open the lesson and check them
                </Link>
              </>
            )}
          </p>
        </div>
      )}

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-between border-t border-nevo-near-black/8 px-7 py-4 xl:px-8 xl:py-5">
        {step === 1 ? (
          <span className="flex h-[46px] cursor-default items-center rounded-[10px] px-5 text-[14.5px] font-medium text-nevo-near-black/40 xl:h-12 xl:px-[22px] xl:text-[15px]">
            Back
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setStep((s) => (s - 1) as Step)}
            className="flex h-[46px] cursor-pointer items-center rounded-[10px] px-5 text-[14.5px] font-medium text-nevo-near-black/70 transition-colors hover:bg-nevo-near-black/5 xl:h-12 xl:px-[22px] xl:text-[15px]"
          >
            Back
          </button>
        )}
        <button
          type="button"
          disabled={!canContinue}
          onClick={() => {
            if (!canContinue || submitting) return;
            if (step < 4) setStep((s) => (s + 1) as Step);
            else void confirm();
          }}
          className={cn(
            "flex h-[46px] items-center rounded-[10px] px-[26px] text-[15px] font-semibold xl:h-12 xl:px-[30px] xl:text-[15.5px]",
            canContinue
              ? "cursor-pointer bg-nevo-navy text-nevo-cream transition-[filter] hover:brightness-93"
              : "cursor-not-allowed bg-nevo-navy/18 text-nevo-near-black/40",
          )}
        >
          {step === 4
            ? submitting
              ? "Assigning…"
              : "Confirm assignment"
            : "Continue"}
        </button>
      </div>
    </div>
  );
}
