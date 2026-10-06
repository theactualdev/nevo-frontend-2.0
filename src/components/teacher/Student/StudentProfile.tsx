"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ADAPTATIONS_FOOTNOTE_DESKTOP_TAIL,
  ADAPTATIONS_FOOTNOTE_MAIN,
  ADAPTATIONS_LABEL,
  STUDENT_ADAPTATIONS,
} from "@/lib/mocks/teacherIntelligence";
import {

  type SessionRow,
  type StudentProfileData,
} from "@/lib/mocks/teacherStudents";
import { OBSERVATION_COPY } from "@/lib/constants/observations";
import { cn } from "@/lib/utils";
import { MasteryDualTrack } from "./MasteryDualTrack";
import { RecommendSheet } from "./RecommendSheet";
import { SessionPanel } from "./SessionPanel";
import { ShareSheet } from "./ShareSheet";

/**
 * C08 Student Profile (teacher view) - how this student learns, in plain
 * words. There is no confidence rating of any kind (see below), and there is
 * zero clinical language: the page has to hold up if a parent
 * or the SENCo reads it.
 *
 * Two states, both designed: the full profile for a student with enough
 * history, and the calm early profile for one Nevo is still learning - which
 * carries the callout alone and simply has no Concept mastery, What Nevo has
 * seen or Recent sessions sections (no empty cards for them).
 *
 * Desktop and tablet genuinely differ here, per the frame: tablet drops the
 * breadcrumb, stacks the actions into their own wrapping row with a "Share"
 * pill in place of the kebab, and drops Recent sessions entirely. Both
 * divergences are flagged to design rather than smoothed over.
 *
 * THE ESCALATION SHEET STILL CONFIRMS NOTHING HERE, AND THAT IS NOW CORRECT.
 * C14 B5 draws a toast and a quiet "Shared with Learning Support" note, and
 * both were once built over a handler that posted nothing - a safeguarding
 * referral reported as delivered. The transport arrived on 15 Sep as
 * `POST /api/v1/escalations`, and the confirmation ritual arrived with it, on
 * `LiveStudentProfile`. It is not repeated here: this component renders a
 * FIXTURE student for a signed-out visitor, and a referral about a child who
 * does not exist should neither be sent nor claimed.
 */


const CHEVRON_LEFT = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="xl:size-[17px]">
    <path d="M15 6l-6 6 6 6" />
  </svg>
);

const MENU_ITEMS: { label: string; opens?: "message" }[] = [
  { label: "Message this student", opens: "message" },
  { label: "Print this profile" },
  { label: "Move to another class" },
  // The destructive slot is navy, deliberately not red.
  { label: "Remove from class" },
];

export function StudentProfile({
  student,
  recommendOpen = false,
}: {
  student: StudentProfileData;
  /** C08c opens as a real route over this page. */
  recommendOpen?: boolean;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [session, setSession] = useState<SessionRow | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const early = !student.chip && student.concepts.length === 0;
  const firstName = student.name.split(" ")[0];
  const recommendHref = `/teacher/students/${student.id}/recommend`;
  // Connect owns compose; the slug tells it who this is addressed to.
  const messageHref = `/teacher/connect?student=${student.id}`;


  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="xl:mx-auto xl:max-w-[900px]">
        {/* Breadcrumb - kept at both sizes on the early profile, desktop only
            on the full profile (per the frame). */}
        <Link
          href={`/teacher/classes/${student.classId}`}
          className={cn(
            "cursor-pointer items-center gap-[7px] text-[13.5px] text-nevo-near-black/60 transition-transform active:scale-[0.99] xl:text-sm",
            early ? "inline-flex" : "hidden xl:inline-flex",
          )}
        >
          {CHEVRON_LEFT}
          {/* One template expression - a JSX boundary here drops the space. */}
          {`${student.className} · Roster`}
        </Link>

        {/* Identity + actions */}
        <div
          className={cn(
            "flex items-center gap-3.5 xl:mt-4 xl:gap-4",
            early ? "mt-3.5" : "xl:flex-wrap xl:items-start xl:justify-between xl:gap-6",
          )}
        >
          <div className="flex items-center gap-3.5 xl:gap-4">
            <span className="flex size-[50px] shrink-0 items-center justify-center rounded-full bg-nevo-navy text-[17px] font-semibold text-nevo-cream xl:size-14 xl:text-[19px]">
              {student.initials}
            </span>
            <div>
              <div className="flex items-center gap-[9px] xl:gap-2.5">
                <h2 className="text-[22px] font-semibold tracking-[-0.015em] text-nevo-near-black xl:text-[27px]">
                  {student.name}
                </h2>
                {student.chip && (
                  <span className="rounded-full bg-nevo-violet/24 px-[9px] py-0.5 text-[11px] font-semibold text-nevo-navy xl:px-[11px] xl:py-[3px] xl:text-xs">
                    {student.chip}
                  </span>
                )}
              </div>
              <span className="mt-[3px] block text-sm text-nevo-near-black/60 xl:mt-[5px] xl:text-[14.5px]">
                {student.meta}
              </span>
            </div>
          </div>

          {/* The early profile carries no actions at all (frame) - flagged. */}
          {!early && (
            <div className="mt-4 flex flex-wrap items-center gap-2.5 xl:mt-0">
              <Link
                href={recommendHref}
                className="flex h-[42px] cursor-pointer items-center rounded-[10px] bg-nevo-navy px-[18px] text-sm font-semibold text-nevo-cream transition-[filter] hover:brightness-93 xl:h-11 xl:px-5 xl:text-[14.5px]"
              >
                Recommend a lesson
              </Link>
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                className="flex h-[42px] cursor-pointer items-center rounded-[10px] border-[1.5px] border-nevo-navy/35 px-4 text-sm font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6 xl:h-11 xl:px-[18px] xl:text-[14.5px]"
              >
                Flag for support
              </button>
              {/* Tablet trades the kebab for a Share pill (frame). */}
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                className="flex h-[42px] cursor-pointer items-center rounded-[10px] border-[1.5px] border-nevo-navy/35 px-4 text-sm font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6 xl:hidden"
              >
                Share
              </button>
              <div className="relative hidden xl:block">
                <button
                  type="button"
                  aria-label="More actions"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((v) => !v)}
                  className="flex size-11 cursor-pointer items-center justify-center rounded-[10px] border-[1.5px] border-nevo-navy/35 text-nevo-navy transition-colors hover:bg-nevo-navy/6"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <circle cx="12" cy="5" r="1.6" />
                    <circle cx="12" cy="12" r="1.6" />
                    <circle cx="12" cy="19" r="1.6" />
                  </svg>
                </button>
                {menuOpen && (
                  <>
                    <div
                      aria-hidden
                      className="fixed inset-0 z-30"
                      onClick={() => setMenuOpen(false)}
                    />
                    <div className="absolute top-[52px] right-0 z-[31] w-[238px] rounded-xl bg-nevo-cream p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.16)]">
                      {MENU_ITEMS.map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => {
                            setMenuOpen(false);
                            if (item.opens === "message") {
                              router.push(messageHref);
                            }
                          }}
                          className="block w-full cursor-pointer rounded-lg px-[13px] py-[11px] text-left text-[14.5px] text-nevo-near-black transition-colors hover:bg-nevo-navy/8"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Noticing banner (full) or calm callout (early) */}
        {student.noticing && (
          <div className="mt-[18px] rounded-xl border-l-[3px] border-nevo-violet bg-nevo-violet/16 px-[18px] py-4 xl:mt-7 xl:px-5 xl:py-[18px]">
            <p className="text-sm leading-[1.5] text-nevo-near-black/82 xl:text-[15px] xl:leading-[1.55]">
              <strong className="font-semibold text-nevo-near-black">
                This week:
              </strong>{" "}
              <span className="xl:hidden">{student.noticing.tablet}</span>
              <span className="hidden xl:inline">{student.noticing.desktop}</span>
            </p>
          </div>
        )}
        {student.earlyNote && (
          <div className="mt-5 flex items-start gap-3 rounded-xl bg-nevo-violet/16 px-[18px] py-4 xl:mt-[26px] xl:gap-[13px] xl:px-5 xl:py-[18px]">
            <span className="mt-px shrink-0 text-nevo-navy">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="xl:size-5">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
            </span>
            <p className="text-sm leading-[1.55] text-nevo-near-black/78 xl:text-[15px]">
              {student.earlyNote}
            </p>
          </div>
        )}

        {/* Retitled 17 Sep, matching design's own change in the pattern file:
            "How <name> learns" is the learning-styles framing rule 1 exists to
            keep out of the product, and it sat directly above the cards that
            used to carry the modality claims. The section says what Nevo saw. */}
        <h3 className="mt-[26px] text-[13.5px] font-semibold tracking-[0.04em] text-nevo-near-black/55 uppercase xl:mt-8 xl:text-sm">
          What Nevo has noticed
        </h3>
        {/*
          ONE SOURCE FOR THE WORDING, shared with the roster chips, so this
          screen and that one cannot say different things about the same child.
          No confidence rating: a rating turns an observation into a finding,
          and design removed it from C08 on 17 Sep along with the modality
          claim it sat under.
        */}
        <div className="mt-3.5 flex flex-col gap-3 xl:mt-4 xl:grid xl:grid-cols-2 xl:gap-3.5">
          {student.observations.map((pattern) => (
            <div
              key={pattern}
              className="rounded-xl bg-nevo-cream-elevated px-5 py-[18px] shadow-[0_2px_8px_rgba(0,0,0,0.06)] xl:p-[22px]"
            >
              <p className="font-mono text-[10.5px] tracking-[0.06em] text-nevo-near-black/50 uppercase">
                {OBSERVATION_COPY[pattern].title}
              </p>
              <p className="mt-1.5 text-[15.5px] leading-[1.45] font-medium text-nevo-near-black xl:text-[16.5px]">
                {OBSERVATION_COPY[pattern].body(firstName)}
              </p>
            </div>
          ))}
        </div>

        {/* Concept mastery */}
        {student.concepts.length > 0 && (
          <>
            <h3 className="mt-[26px] text-[13.5px] font-semibold tracking-[0.04em] text-nevo-near-black/55 uppercase xl:mt-9 xl:text-sm">
              Concept mastery
            </h3>
            <p className="mt-2 text-[13.5px] leading-[1.5] text-nevo-near-black/60 xl:mt-[9px] xl:max-w-[660px] xl:text-sm xl:leading-[1.55]">
              <span className="xl:hidden">
                Understanding and reading load, per topic. When they part
                company, it&apos;s usually the reading.
              </span>
              <span className="hidden xl:inline">
                {`Two tracks per topic: how well ${firstName} has understood it, and how much the reading load is shaping the result. When the tracks part company, it's usually the reading, not the maths.`}
              </span>
            </p>
            <div className="mt-3.5 flex flex-col gap-5 rounded-xl bg-nevo-cream-elevated px-[22px] py-5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] xl:mt-4 xl:gap-[22px] xl:px-[26px] xl:py-6">
              {student.concepts.map((c) => (
                <MasteryDualTrack
                  key={c.name}
                  concept={c.name}
                  understanding={c.u}
                  reading={c.r}
                  flag={c.flag}
                />
              ))}
            </div>
          </>
        )}

        {/* What Nevo has seen */}
        {student.evidence.length > 0 && (
          <>
            <h3 className="mt-[26px] text-[13.5px] font-semibold tracking-[0.04em] text-nevo-near-black/55 uppercase xl:mt-9 xl:text-sm">
              What Nevo has seen
            </h3>
            <p className="mt-2 text-[13.5px] leading-[1.5] text-nevo-near-black/60 xl:mt-[9px] xl:max-w-[660px] xl:text-sm xl:leading-[1.55]">
              <span className="xl:hidden">
                Evidence from her own work, in plain language. No transcripts.
              </span>
              <span className="hidden xl:inline">
                {`Evidence from ${firstName}'s own work, classified in plain language. No transcripts - just what the pattern shows.`}
              </span>
            </p>
            <div className="mt-3.5 flex flex-col gap-2.5 xl:mt-4">
              {student.evidence.map((e) => (
                <div
                  key={e.concept}
                  className="rounded-xl bg-nevo-cream-elevated px-[17px] py-[15px] shadow-[0_2px_8px_rgba(0,0,0,0.06)] xl:px-[18px] xl:py-4"
                >
                  <div className="flex flex-wrap items-center gap-[9px] xl:gap-2.5">
                    <span className="text-[14.5px] font-semibold text-nevo-near-black xl:text-[15px]">
                      {e.concept}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[11px] font-medium",
                        e.badge === "Demonstrated"
                          ? "bg-nevo-navy text-nevo-cream"
                          : "bg-nevo-navy/8 text-nevo-navy",
                      )}
                    >
                      {e.badge}
                    </span>
                    <span className="ml-auto text-xs text-nevo-near-black/55 xl:text-[12.5px]">
                      {e.when}
                    </span>
                  </div>
                  {e.desc && (
                    <p className="mt-[7px] text-sm leading-[1.5] text-nevo-near-black/78 xl:mt-2 xl:text-[14.5px]">
                      {e.desc}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Recent sessions - desktop only, per the frame (flagged). */}
        {student.sessions.length > 0 && (
          <div className="hidden xl:block">
            <h3 className="mt-9 text-sm font-semibold tracking-[0.04em] text-nevo-near-black/55 uppercase">
              Recent sessions
            </h3>
            <div className="mt-4 overflow-hidden rounded-xl bg-nevo-cream-elevated shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
              {student.sessions.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSession(s)}
                  className={cn(
                    "flex w-full cursor-pointer gap-[18px] px-[22px] py-[18px] text-left transition-[filter] hover:brightness-[0.985]",
                    i < student.sessions.length - 1 &&
                      "border-b border-nevo-near-black/7",
                  )}
                >
                  <span className="w-[70px] shrink-0 pt-0.5 text-[13.5px] text-nevo-near-black/55">
                    {s.date}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15.5px] font-semibold text-nevo-near-black">
                      {s.lesson}
                    </span>
                    <span className="mt-[5px] block text-[14.5px] leading-[1.5] text-nevo-near-black/72">
                      {s.note}
                    </span>
                  </span>
                  <span className="shrink-0 self-center text-nevo-near-black/40">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* C16c Adaptation Insights - what Nevo quietly adjusted, and why.
            Only students with history carry entries; early profiles get no
            section at all (the no-empty-cards rule). */}
        {(STUDENT_ADAPTATIONS[student.id] ?? []).length > 0 && (
          <>
            <h3 className="mt-6 block text-[11px] font-bold tracking-[0.14em] text-nevo-violet uppercase xl:mt-7">
              {ADAPTATIONS_LABEL}
            </h3>
            <p className="mt-2 text-[13px] text-nevo-near-black/60">
              {`Nevo quietly adjusts lessons based on how each student learns. Here is what has happened for ${student.name.split(" ")[0]} recently.`}
            </p>
            <div className="mt-3.5 flex flex-col gap-2 xl:mt-4">
              {(STUDENT_ADAPTATIONS[student.id] ?? []).map((entry) => (
                <div
                  key={`${entry.date}-${entry.lesson}`}
                  className="flex items-start gap-3.5 rounded-[8px] bg-nevo-cream-elevated px-[18px] py-4 xl:gap-4"
                >
                  <span className="w-[46px] shrink-0 pt-px text-[12px] text-nevo-near-black/55">
                    {entry.date}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-nevo-near-black">
                      {entry.lesson}
                    </span>
                    <p className="mt-1 text-[13px] leading-[1.55] text-nevo-near-black/72">
                      {entry.desc}
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
      </div>

      {recommendOpen && student.recommend && (
        <RecommendSheet
          student={student}
          onClose={() => router.push(`/teacher/students/${student.id}`)}
        />
      )}

      {shareOpen && (
        <ShareSheet
          studentName={student.name}
          onCancel={() => setShareOpen(false)}
          />
      )}

      {session && (
        <SessionPanel
          session={session}
          studentName={student.name}
          onClose={() => setSession(null)}
          onRecommend={() => router.push(recommendHref)}
          onMessage={() => router.push(messageHref)}
        />
      )}
    </div>
  );
}
