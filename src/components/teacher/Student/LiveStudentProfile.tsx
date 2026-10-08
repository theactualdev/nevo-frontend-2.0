"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSystemMessages } from "@/components/shared/SystemMessages";
import { useStudentFlags } from "@/hooks/useStudentFlags";
import { useStudentSessions } from "@/hooks/useStudentSessions";
import { useTeacherClasses } from "@/hooks/useTeacherClasses";
import { useRosterObservations } from "@/hooks/useRosterObservations";
import {
  OBSERVATION_COPY,
  observationCount,
} from "@/lib/constants/observations";
import { LiveSessionPanel } from "./LiveSessionPanel";
import { LiveRecommendSheet } from "./LiveRecommendSheet";
import { LiveShareSheet } from "./LiveShareSheet";
import type { StudentProfileState } from "@/hooks/useStudentProfile";
import {
  ADAPTATIONS_FOOTNOTE_DESKTOP_TAIL,
  ADAPTATIONS_FOOTNOTE_MAIN,
  ADAPTATIONS_LABEL,
} from "@/lib/mocks/teacherIntelligence";
import { cn } from "@/lib/utils";
import { MasteryDualTrack } from "./MasteryDualTrack";

/**
 * C08 Student Profile for a real student.
 *
 * WHAT IS SHOWN. Who they are, whether anything is flagged, how they are
 * doing per concept - the dual-track bars the frame already draws, from
 * `mastery/student` - and whatever Nevo recommends, which the backend writes
 * in plain language already.
 *
 * WHAT IS RULED OUT (Olayinka, 30 Aug 2026), not merely deferred: the
 * learner profile's `workingMemoryCapacity` and `attentionSpan` are never
 * rendered here or on any teacher surface - a number against a child's
 * working memory is the clinical framing C08 forbids and the D22 compliance
 * claim cannot survive.
 *
 * Backend enforced this at the source on 31 Aug: the teacher-scoped profile
 * read no longer returns either field, and they are gone from the type. The
 * ruling stands regardless - if they ever reappear in a payload, they still
 * do not get rendered.
 *
 * The C16c adaptation insights are live, from `/api/adaptations/student/{id}`,
 * with suppressed entries excluded - the section is what actually happened.
 *
 * Recent sessions come from `students/{id}/progress`. Its rows are not
 * clickable: C08d's session panel wants a section-by-section breakdown, and
 * nothing serves one. Its position indices are not shown either - the spec
 * does not say whether they are 0- or 1-based, and "section 0" in front of a
 * teacher is worse than no position.
 *
 * Accommodations are what Nevo is OFFERING, on stated evidence - which is a
 * different thing from the engine parameters above, and reads in the same
 * register the recommendations already do.
 *
 * THE NOTICING BANNER IS LIVE (17 Sep). This comment used to say it was
 * absent "for want of an endpoint", and that was never true: the flags route
 * has taken `studentId` all along and `description` is required on every flag
 * it returns. It renders Nevo's own sentences, dated, claiming no window - see
 * `useStudentFlags`.
 *
 * "WHAT NEVO HAS NOTICED" IS LIVE TOO (6 Oct). This comment used to fold it
 * into the confidence rating design deleted on 17 Sep, and they were never one
 * thing: the rating went, the observations stayed in C08. They arrive on the
 * class roster and not on the profile read, so they are read from the class
 * the row came from - see `useRosterObservations` - and the section is
 * absent when there is no class to ask.
 *
 * STILL ABSENT: the "what Nevo has seen" evidence list, which has an endpoint
 * that does not fit it - see `students.ts`.
 *
 * The early state is real: `status: not_observed_yet` is precisely the
 * student the frame's calm early profile was drawn for.
 */

const SECTION_H =
  "text-[13.5px] font-semibold tracking-[0.04em] text-nevo-near-black/55 uppercase xl:text-sm";


/** The support Nevo turned on, named the way the console talks about it. */
const ACCOMMODATION_LABEL: Record<string, string> = {
  reading: "Reading support",
  attention: "Attention support",
  numerical: "Number support",
};

/** `LessonCompletionStatus`, in the frame's plain register. */
const SESSION_NOTE: Record<string, string> = {
  completed: "Finished this lesson",
  in_progress: "Working through it",
  exited: "Left partway through",
};

function initialsOf(first: string | null, last: string | null): string {
  const a = first?.trim()?.[0] ?? "";
  const b = last?.trim()?.[0] ?? "";
  return (a + b).toUpperCase() || "?";
}

export function LiveStudentProfile({
  state,
  studentId,
  classHref,
  classId,
  recommendOpen = false,
}: {
  state: StudentProfileState;
  /**
   * The route already has it, and the sessions hook needs it BEFORE `profile`
   * is destructured - hooks cannot run after the `if (!profile) return null`
   * that guards everything below.
   */
  studentId: string;
  classHref?: string;
  /** The class the roster row came from; observations are read from it. */
  classId?: string;
  recommendOpen?: boolean;
}) {
  const router = useRouter();
  const [recommending, setRecommending] = useState(recommendOpen);
  /*
   * C08d, finally reachable (17 Sep). This was the fourth of the four actions
   * the frame draws and the only one that could not be built: the panel has
   * been complete for weeks and nothing handed a teacher a session id. Backend
   * shipped the sessions list and this is the id it hands over.
   */
  const [openSession, setOpenSession] = useState<string | null>(null);
  const {
    sessions: realSessions,
    failed: sessionsFailed,
    loading: sessionsLoading,
  } = useStudentSessions(studentId);
  /* The noticing banner's source. Like the sessions list, it needs the id
     before `profile` is destructured. */
  const { noticed } = useStudentFlags(studentId);
  /* C08's "What Nevo has noticed", from the class this profile was opened
     from. Also before the guard below. */
  const observations = useRosterObservations(classId, studentId);
  /* C08 and C14 A5 both draw the way back as "{class} · Roster". */
  const { liveClasses } = useTeacherClasses();
  const className = classId
    ? liveClasses.find((c) => c.classId === classId)?.className
    : undefined;
  const [sharing, setSharing] = useState(false);
  /**
   * C14 B5's two halves, both driven only by a stored escalation.
   *
   * `shared` is session-local on purpose. The obvious alternative - reading
   * `GET /api/v1/escalations` on mount to show "already shared" - is a worse
   * answer than none: that read is documented as the SENCo/admin view, a
   * teacher's access to it is untested, and a 403 would render as "not shared
   * yet" for a child who has been escalated twice already. So this reports
   * what THIS teacher just did, which it knows for certain, and claims
   * nothing about history.
   */
  const [shared, setShared] = useState(false);
  /* C14 B5's toast is the shared bar now: frame 43 made them one thing. */
  const say = useSystemMessages();
  const {
    profile,
    concepts,
    recommendations,
    adaptations,
    // `state.sessions` is deliberately NOT read here any more. It is
    // `progress.lessons` - one row per LESSON, with no session id and no way
    // to tell a second visit from a first - and this screen now reads the real
    // session list instead. The field stays on the state for the fixture
    // profile next door, which has no live read to replace it with.
    accommodations,
    observed,
    reads,
  } = state;
  if (!profile) return null;

  /** Absent means a fixture state, every read in. */
  const read = (key: keyof NonNullable<typeof reads>) => reads?.[key] ?? "ready";

  const { student, openFlagCount } = profile;
  const name = [student.firstName, student.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  /*
   * "STILL GETTING TO KNOW THEM" IS A CLAIM, and it needs both reads it rests
   * on to have answered. It was drawn over in-flight and failed reads alike,
   * for a child with weeks of history: absence of an answer read as absence
   * of a profile.
   */
  const early =
    read("learnerProfile") === "ready" &&
    read("mastery") === "ready" &&
    !observed &&
    concepts.length === 0;
  /**
   * C14 A5 rather than C08's early card: no session and no pattern at all.
   * Only once the sessions read has answered - a list still loading is not
   * a child who has never started.
   */
  const tooEarly =
    early &&
    !sessionsLoading &&
    !sessionsFailed &&
    realSessions.length === 0 &&
    observations.length === 0;
  const first = student.firstName?.trim() || name.split(" ")[0] || "them";
  /** The sessions section's own failure line, for any section that failed. */
  const failedLine = `We couldn${"’"}t load these just now. Nothing has changed for ${student.firstName ?? "them"}, so you can try again in a moment.`;

  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[860px]">
        <Link
          href={classHref ?? "/teacher/classes"}
          className="inline-flex cursor-pointer items-center gap-[7px] text-sm text-nevo-near-black/60 transition-transform active:scale-[0.99]"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 6l-6 6 6 6" />
          </svg>
          {className ? `${className} · Roster` : "My Classes"}
        </Link>

        {/*
          C08's HEADER: who this is, then what a teacher can do about it -
          beside the name on desktop, in a row of their own under it on tablet
          ("actions wrap"). The actions used to sit at the very foot of the
          page, under every section, at both widths: a teacher who came to
          recommend a lesson scrolled past the whole profile to find the
          button. The fixture profile always had them here.
        */}
        <div className="mt-3.5 flex flex-col items-start gap-4 xl:mt-4 xl:flex-row xl:flex-wrap xl:justify-between xl:gap-6">
          <div className="flex items-center gap-3.5 xl:gap-4">
            <span className="flex size-[50px] shrink-0 items-center justify-center rounded-full bg-nevo-navy text-[17px] font-semibold text-nevo-cream xl:size-16 xl:text-xl">
              {initialsOf(student.firstName, student.lastName)}
            </span>
            <div className="min-w-0">
              <h1 className="text-[22px] font-semibold tracking-[-0.015em] text-nevo-near-black xl:text-[26px]">
                {name || "This student"}
              </h1>
              <span className="mt-[3px] block text-sm text-nevo-near-black/60 xl:text-[14.5px]">
                {[
                  student.ageBand,
                  // Only once the learner profile has answered: "No profile
                  // yet" over a read in flight, or one that failed, is a claim
                  // about this child made from our own network.
                  read("learnerProfile") !== "ready"
                    ? null
                    : observed
                      ? "Learning profile building"
                      : "No profile yet",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              {/* C14 B5's quiet note. The frame writes it with a dash; design
                  ruled on 15 Sep that Nevo copy carries no dashes anywhere, so
                  it reads straight. It appears only after a stored escalation. */}
              {shared && (
                <span className="mt-[3px] block text-sm text-nevo-near-black/60 xl:text-[14.5px]">
                  Shared with Learning Support today
                </span>
              )}
            </div>
          </div>

          {/* C08's order: the primary action first. `flex-wrap` since 15 Sep -
              a third action turned a bare row into one that ran off a tablet. */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setRecommending(true)}
              className="inline-flex h-[42px] cursor-pointer items-center rounded-[10px] bg-nevo-navy px-[18px] text-sm font-semibold text-nevo-cream transition-[filter] hover:brightness-93 xl:h-11 xl:px-5 xl:text-[14.5px]"
            >
              Recommend a lesson
            </button>
            {/* `POST /api/v1/escalations` landed 15 Sep; before it this action
                existed only on the fixture profile. C08's label - the sheet it
                opens is "Share with Learning Support"; the button is not. */}
            <button
              type="button"
              onClick={() => setSharing(true)}
              className="inline-flex h-[42px] cursor-pointer items-center rounded-[10px] border-[1.5px] border-nevo-navy/35 px-4 text-sm font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6 xl:h-11 xl:px-[18px] xl:text-[14.5px]"
            >
              Flag for support
            </button>
            <Link
              /* With the child's id: compose opens on them rather than on
                 an empty recipient list. */
              href={`/teacher/connect?student=${student.id}`}
              className="inline-flex h-[42px] cursor-pointer items-center rounded-[10px] border-[1.5px] border-nevo-navy/35 px-4 text-sm font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6 xl:h-11 xl:px-[18px] xl:text-[14.5px]"
            >
              Send them a message
            </Link>
          </div>
        </div>

        {/* C08's noticing banner, in the frame's own treatment: the violet
            left rule, Nevo's sentences, and nothing of ours added to them.
            One line per open flag - the frame draws a single line because the
            fixture has a single flag, and dropping the rest would hide the
            thing this banner exists to show. */}
        {noticed.length > 0 && (
          <div className="mt-6 max-w-[660px] rounded-[12px] border-l-[3px] border-nevo-violet bg-nevo-violet/16 px-[18px] py-4 xl:px-5 xl:py-[18px]">
            <span className="block text-sm font-semibold text-nevo-near-black xl:text-[15px]">
              What Nevo noticed
            </span>
            <div className="mt-2 flex flex-col gap-2.5">
              {noticed.map((n) => (
                <p
                  key={n.id}
                  className="flex gap-3 text-sm leading-[1.5] text-nevo-near-black/82 xl:text-[15px] xl:leading-[1.55]"
                >
                  {/* Where the frame writes "This week:". The flag carries a
                      date and the route declares no window, so this says when
                      rather than implying a period nobody promised. */}
                  <span className="w-[46px] shrink-0 text-nevo-near-black/55">
                    {new Date(n.generatedAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                  <span className="min-w-0">{n.note}</span>
                </p>
              ))}
            </div>
          </div>
        )}

        {/* The count, for when the prose is NOT in hand - a failed flags read,
            or a count that does not agree with the list. It is the weaker of
            the two screens: it states a number and sends the teacher somewhere
            else to find out what it is about. So it appears only where the
            banner cannot, and it was the whole of this screen until today. */}
        {noticed.length === 0 && openFlagCount > 0 && (
          <div className="mt-6 flex max-w-[660px] items-start gap-3.5 rounded-[12px] bg-nevo-violet/14 px-[18px] py-4">
            <span className="mt-px shrink-0 text-nevo-navy">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8h.01M11 12h1v4h1" />
              </svg>
            </span>
            <p className="text-[14.5px] leading-[1.55] text-nevo-near-black/78">
              {`${openFlagCount} ${openFlagCount === 1 ? "thing is" : "things are"} worth your attention for ${name.split(" ")[0] || "this student"}.`}{" "}
              <Link href="/teacher/dashboard" className="font-semibold text-nevo-navy">
                See what Nevo noticed
              </Link>
            </p>
          </div>
        )}

        {/* Mutually exclusive with the banner, as the frame has it: "Nevo is
            still getting to know them" underneath a sentence about what Nevo
            noticed contradicts it. A flag means something was observed, so the
            banner wins and the calm note stands down. */}
        {/*
          TWO EARLY STATES, AS THE FRAMES DRAW THEM, where there used to be
          one card of our own words that matched neither.
          - C08's early card: Nevo has started to see something - a session,
            or a pattern on the roster - but not enough to read much into.
          - C14 A5, "too early, no data yet": nothing at all. It is a line
            under "What Nevo has noticed", further down.
        */}
        {early && noticed.length === 0 && !tooEarly && !sessionsLoading && (
          <div className="mt-[26px] flex max-w-[660px] items-start gap-[13px] rounded-[12px] bg-nevo-violet/16 px-5 py-[18px]">
            <span className="mt-px shrink-0 text-nevo-navy">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
            </span>
            <p className="text-[15px] leading-[1.55] text-nevo-near-black/78">
              {`Still getting a picture of ${first}${"’"}s work. A few more sessions and this will fill in - for now, here${"’"}s the early picture.`}
            </p>
          </div>
        )}

        {/*
          C08's "What Nevo has noticed": the engine's own patterns, in the
          copy file's sentences - the same source as the roster's chips, so
          the two screens cannot say different things about one child. A
          count shows only as its own chip, and only where that file allows.
        */}
        {/* C14 A5's own line, under C08's heading, when there is nothing. */}
        {early && noticed.length === 0 && tooEarly && (
          <>
            <h3 className={cn(SECTION_H, "mt-8")}>What Nevo has noticed</h3>
            <p className="mt-3 max-w-[560px] text-[14.5px] leading-[1.55] text-nevo-near-black/68">
              {`Nevo has not seen enough of ${first}${"’"}s work yet to say anything useful.`}
            </p>
          </>
        )}

        {observations.length > 0 && (
          <>
            <h3 className={cn(SECTION_H, "mt-8")}>What Nevo has noticed</h3>
            <div className="mt-3.5 flex flex-col gap-3.5 xl:mt-4 xl:grid xl:grid-cols-2">
              {observations.map((o) => {
                const chip = observationCount(o.pattern, o.count);
                return (
                  <div
                    key={o.pattern}
                    className="flex items-start justify-between gap-4 rounded-[12px] bg-nevo-cream-elevated p-[22px] shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
                  >
                    <p className="text-[15.5px] leading-[1.45] font-medium text-pretty text-nevo-near-black xl:text-[16.5px]">
                      {OBSERVATION_COPY[o.pattern].body(
                        student.firstName?.trim() || "They",
                      )}
                    </p>
                    {chip && (
                      <span className="shrink-0 rounded-full bg-nevo-violet/24 px-[11px] py-1 text-[12.5px] font-semibold whitespace-nowrap text-nevo-navy">
                        {chip}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {concepts.length === 0 && read("mastery") === "failed" && (
          <>
            <h3 className={cn(SECTION_H, "mt-8")}>Concept mastery</h3>
            <p className="mt-3 text-[14px] leading-[1.55] text-nevo-near-black/68">
              {failedLine}
            </p>
          </>
        )}

        {concepts.length > 0 && (
          <>
            <h3 className={cn(SECTION_H, "mt-8")}>Concept mastery</h3>
            <p className="mt-2 max-w-[62ch] text-[13px] leading-[1.5] text-nevo-near-black/60">
              How well each idea has landed, and how much the reading itself is
              shaping that.
            </p>
            <div className="mt-4 flex flex-col gap-5 rounded-[12px] bg-nevo-cream-elevated px-[22px] py-6 shadow-elevation-1 xl:px-[26px]">
              {concepts.map((c) => (
                <MasteryDualTrack
                  key={c.conceptId}
                  concept={c.name}
                  understanding={c.understanding}
                  reading={c.reading}
                />
              ))}
            </div>
          </>
        )}

        {accommodations && accommodations.activeAccommodations.length > 0 && (
          <>
            <h3 className={cn(SECTION_H, "mt-8")}>What Nevo is offering</h3>
            <p className="mt-2 max-w-[62ch] text-[13px] leading-[1.5] text-nevo-near-black/60">
              Support Nevo has turned on, and what it saw that led there.
            </p>
            <div className="mt-3.5 divide-y divide-nevo-near-black/7 overflow-hidden rounded-[12px] bg-nevo-cream-elevated shadow-elevation-1">
              {accommodations.signals.map((sig) => (
                <div key={sig.accommodation} className="px-[22px] py-4">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-[15px] font-semibold text-nevo-near-black">
                      {ACCOMMODATION_LABEL[sig.accommodation] ??
                        sig.accommodation}
                    </span>
                    <span className="rounded-full bg-nevo-navy/9 px-[9px] py-0.5 text-[11px] font-semibold whitespace-nowrap text-nevo-near-black/55">
                      {`across ${sig.lessonCount} ${sig.lessonCount === 1 ? "lesson" : "lessons"}`}
                    </span>
                  </div>
                  {sig.evidence.length > 0 && (
                    <p className="mt-1.5 max-w-[62ch] text-[13.5px] leading-[1.5] text-nevo-near-black/70">
                      {sig.evidence.join(" · ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {read("accommodations") === "failed" && (
          <>
            <h3 className={cn(SECTION_H, "mt-8")}>What Nevo is offering</h3>
            <p className="mt-3 text-[14px] leading-[1.55] text-nevo-near-black/68">
              {failedLine}
            </p>
          </>
        )}

        {recommendations.length === 0 && read("recommendations") === "failed" && (
          <>
            <h3 className={cn(SECTION_H, "mt-8")}>What might help</h3>
            <p className="mt-3 text-[14px] leading-[1.55] text-nevo-near-black/68">
              {failedLine}
            </p>
          </>
        )}

        {recommendations.length > 0 && (
          <>
            <h3 className={cn(SECTION_H, "mt-8")}>What might help</h3>
            <div className="mt-3.5 divide-y divide-nevo-near-black/7 overflow-hidden rounded-[12px] bg-nevo-cream-elevated shadow-elevation-1">
              {recommendations.map((r) => (
                <p
                  key={r.id}
                  className="px-[22px] py-4 text-[14.5px] leading-[1.55] text-nevo-near-black/82"
                >
                  {r.recommendationText}
                </p>
              ))}
            </div>
          </>
        )}

        {/*
          REAL SESSIONS, NOT LESSON PROGRESS.
          
          This list used to be built from `progress.lessons` - one row per
          LESSON, keyed by lessonId, with no session behind it. It could not
          open C08d because it had no session id, and it could not tell a
          second visit from a first, which is the thing backend was explicit
          about: "a child's second visit to the same lesson means something
          their first doesn't."
          
          `GET /api/v1/students/{id}/sessions` carries the id and enough to
          render the row without opening it.
        */}
        {realSessions.length > 0 && (
          <>
            <h3 className={cn(SECTION_H, "mt-8")}>Recent sessions</h3>
            <div className="mt-3.5 divide-y divide-nevo-near-black/7 overflow-hidden rounded-[12px] bg-nevo-cream-elevated shadow-elevation-1">
              {realSessions.map((sn) => (
                <button
                  key={sn.sessionId}
                  type="button"
                  onClick={() => setOpenSession(sn.sessionId)}
                  className="flex w-full cursor-pointer gap-[18px] px-[22px] py-4 text-left transition-[filter] hover:brightness-[0.985]"
                >
                  <span className="w-[70px] shrink-0 pt-0.5 text-[13.5px] text-nevo-near-black/55">
                    {new Date(sn.occurredAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-nevo-near-black">
                      {sn.lessonTitle}
                    </span>
                    <span className="mt-[5px] block text-[14px] leading-[1.5] text-nevo-near-black/72">
                      {SESSION_NOTE[sn.completionStatus] ??
                        sn.completionStatus.replace(/_/g, " ")}
                      {/* Only from the second visit on. "Visit 1" says nothing
                          a teacher did not already assume. */}
                      {sn.sitting > 1 && ` · visit ${sn.sitting}`}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* A failed read is not "no sessions". Saying nothing here would tell a
            teacher this child has never worked, which is a claim about a named
            child made from our own network trouble. */}
        {/* C14 A5, verbatim with this child's own name. An empty list
            rendered nothing at all, so a child who had never started a lesson
            looked the same as a page that had not finished loading. Only once
            the read has answered, and answered with none. */}
        {realSessions.length === 0 && !sessionsLoading && !sessionsFailed && (
          <>
            <h3 className={cn(SECTION_H, "mt-8")}>Recent sessions</h3>
            <p className="mt-3 max-w-[560px] text-[13px] leading-[1.6] text-nevo-near-black/50">
              {student.firstName
                ? `No sessions yet - ${student.firstName} hasn${"’"}t started a lesson.`
                : "No sessions yet."}
            </p>
          </>
        )}

        {realSessions.length === 0 && sessionsFailed && (
          <>
            <h3 className={cn(SECTION_H, "mt-8")}>Recent sessions</h3>
            <p className="mt-3 text-[14px] leading-[1.55] text-nevo-near-black/68">
              {`We couldn${"’"}t load these just now. Nothing has changed for ${student.firstName ?? "them"}, so you can try again in a moment.`}
            </p>
          </>
        )}

        {/* C16c - what Nevo quietly adjusted, and why. BELOW the lesson
            history, where C16c places it; it sat above the sessions. The
            frame draws no "After noticing" line, and `trigger` is a free
            string nobody has reviewed for this screen, so it is not shown. */}
        {adaptations.length === 0 && read("adaptations") === "failed" && (
          <>
            <h3 className="mt-8 block text-[11px] font-bold tracking-[0.14em] text-nevo-violet uppercase">
              {ADAPTATIONS_LABEL}
            </h3>
            <p className="mt-3 text-[14px] leading-[1.55] text-nevo-near-black/68">
              {failedLine}
            </p>
          </>
        )}

        {adaptations.length > 0 && (
          <>
            <h3 className="mt-8 block text-[11px] font-bold tracking-[0.14em] text-nevo-violet uppercase">
              {ADAPTATIONS_LABEL}
            </h3>
            <p className="mt-2 text-[13px] text-nevo-near-black/60">
              {`Nevo quietly adjusts lessons based on how each student learns. Here is what has happened for ${name.split(" ")[0] || "them"} recently.`}
            </p>
            <div className="mt-3.5 flex flex-col gap-2 xl:mt-4">
              {adaptations.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-3.5 rounded-[8px] bg-nevo-cream-elevated px-[18px] py-4 xl:gap-4"
                >
                  <span className="w-[46px] shrink-0 pt-px text-[12px] text-nevo-near-black/55">
                    {new Date(entry.timestamp).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-nevo-near-black">
                      {entry.lessonTitle}
                    </span>
                    <p className="mt-1 text-[13px] leading-[1.55] text-nevo-near-black/72">
                      {entry.adaptation}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[12px] leading-[1.55] text-nevo-near-black/55 italic">
              {ADAPTATIONS_FOOTNOTE_MAIN}
              <span className="hidden xl:inline">
                {" "}
                {ADAPTATIONS_FOOTNOTE_DESKTOP_TAIL}
              </span>
            </p>
          </>
        )}

        {/* C08's help-seeking line, per design (1 Sep): the activity section,
            below the engagement data, one plain line at the surrounding scale
            - not a card, not a badge.

            Deliberately OUTSIDE the sessions block: a child can have asked
            Nevo for help without a completed session in that list, and the
            line is about their help-seeking, not their sessions. Aggregate
            only, and absent entirely when the server withholds it. */}
        {state.helpSeeking && (
          <p className="mt-8 text-[14.5px] leading-[1.55] text-nevo-near-black/72">
            {state.helpSeeking}
          </p>
        )}


        {/*
          C08d. The panel makes no request while `openSession` is null, so a
          profile nobody has clicked into costs nothing extra.
        */}
        <LiveSessionPanel
          studentId={studentId}
          sessionId={openSession}
          studentName={name}
          onClose={() => setOpenSession(null)}
          onRecommend={() => {
            setOpenSession(null);
            setRecommending(true);
          }}
          onMessage={() => {
            setOpenSession(null);
            router.push(`/teacher/connect?student=${studentId}`);
          }}
        />

        {recommending && (
          <LiveRecommendSheet
            studentId={student.id}
            firstName={student.firstName ?? name}
            /* Nevo's own sentence, never invented. `Recommendation` carries
               prose and no lesson id, so this is context for the teacher's
               choice rather than a preselection. */
            suggestion={recommendations[0]?.recommendationText ?? null}
            onClose={() => setRecommending(false)}
          />
        )}

        {sharing && (
          <LiveShareSheet
            studentId={student.id}
            firstName={student.firstName ?? name}
            onCancel={() => setSharing(false)}
            /* C14 B5, and every part of it waits on a stored escalation: the
               sheet dismisses, the bar confirms, the quiet note settles. */
            onSent={() => {
              setSharing(false);
              setShared(true);
              say.show({
                kind: "confirm",
                message: `Sent to Learning Support. They${"’"}ll take it from here.`,
              });
            }}
          />
        )}

      </div>
    </div>
  );
}
