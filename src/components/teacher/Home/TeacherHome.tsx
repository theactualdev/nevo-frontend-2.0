"use client";

import Link from "next/link";
import { MOCK_TEACHER } from "@/components/teacher/Shell/teacherNav";
import { useHasSession } from "@/hooks/useHasSession";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useTeacherClasses } from "@/hooks/useTeacherClasses";
import {
  GOOD_TO_KNOW,
  HOME_ACTIVITY,
  HOME_FLAGS,
} from "@/lib/mocks/teacherHome";
import { cn } from "@/lib/utils";
import { useTeacherFlags } from "@/hooks/useTeacherFlags";
import { useTeacherHome } from "@/hooks/useTeacherHome";
import { SampleRegion } from "@/components/shared/SampleRegion";
import { ClassPulse } from "./ClassPulse";
import { LiveClassPulse } from "./LiveClassPulse";
import { LiveFlagCard } from "./LiveFlagCard";
import { HomeClasses } from "./HomeClasses";
import { FlagCard } from "./FlagCard";

/**
 * Teacher Home (C03 / `Nevo Teacher Home` frame) - the 10-second scan: date +
 * greeting, "Worth your attention" flags (or the calm no-flags card), one
 * good-to-know note, the class trio, recent activity, and the Ask Nevo drawer.
 * Content column caps at 1040px centred, inner 940px.
 *
 * The flags are live; the pulse, the class trio and the activity list are not.
 * The page reads what it has to decide what it is honestly allowed to say:
 *
 *   - a real teacher with no classes gets the greeting and a line saying so,
 *     and the sections simply are not there. C14 draws no Home empty state, so
 *     rather than invent one this follows its stated principle for the quiet
 *     Insights week: "it isn't drawn as empty, the section simply isn't there".
 *   - the flags are LIVE, from `/api/intelligence/flags`. An empty list is a
 *     real calm morning and gets C03's own no-flags card, not fixtures - which
 *     is the whole point: "nothing needs you" is only reassuring if it is true.
 *   - the pulse and the activity list are live too, from
 *     `GET /api/v1/teachers/me/home` - the endpoint backend shipped against
 *     the blockers list. The pulse repeats per class, because that is how it
 *     arrives; see `LiveClassPulse`.
 *   - the greeting uses the teacher's real name, from `GET /api/v1/users/me`,
 *     and falls back to a nameless welcome rather than the fixture persona.
 *   - the SCHOOL CODE sits beside it (C03, 30 Sep), from the same read's
 *     `school.code`, because it is what a teacher now reads out to a class:
 *     children sign in with it and their own Student ID. It replaced the
 *     class code. No code, no box - and never on the signed-out walkthrough,
 *     where a sample code would be one a child could type.
 *
 * TODO(design): the pulse's number-to-word banding is ours - see
 * `useTeacherHome`.
 */

const SECTION_H =
  "text-[13.5px] font-semibold tracking-[0.04em] text-nevo-near-black/55 uppercase xl:text-sm";

/**
 * "Wednesday, 10 July", as the Build Lock fixes it - with the comma, which
 * en-GB's own long format leaves out.
 */
function todayLine(): string {
  const now = new Date();
  const weekday = now.toLocaleDateString("en-GB", { weekday: "long" });
  const dayMonth = now.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
  });
  return `${weekday}, ${dayMonth}`;
}

export function TeacherHome() {
  const { classes, liveClasses, live } = useTeacherClasses();
  // Live and genuinely empty - not merely "the fixtures did not match".
  const noClasses = live && classes.length === 0 && liveClasses.length === 0;
  // A teacher whose classes failed to load is still not the fixture persona.
  const signedIn = useHasSession();
  // Null while it loads, and if the profile call fails - both greet without a
  // name rather than borrowing one.
  const identity = useCurrentUser();
  const greetName = signedIn ? identity?.name : MOCK_TEACHER.name;
  // Live flags, with the fixtures reserved for the designed screens and the
  // failure fallback. A teacher with no classes has nothing to flag either way.
  const {
    flags: liveFlags,
    live: flagsLive,
    failed: flagsFailed,
    loading: flagsLoading,
    complete: flagsComplete,
  } = useTeacherFlags();
  const {
    pulse,
    activity,
    live: homeLive,
    failed: homeFailed,
  } = useTeacherHome();
  // Fixtures back the designed screens and the failure fallback only.
  const showFixtureHome = !homeLive && (!signedIn || homeFailed);
  const showFixtureFlags = !flagsLive && (!signedIn || flagsFailed);
  const flags = noClasses ? [] : liveFlags;
  const fixtureFlags = noClasses || !showFixtureFlags ? [] : HOME_FLAGS;
  const flagCount = flags.length + fixtureFlags.length;
  const hasFlags = flagCount > 0;

  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[940px]">
        <div className="flex items-start justify-between gap-[18px] xl:gap-6">
          <div className="min-w-0">
            <span className="text-[13px] text-nevo-near-black/55 xl:text-[13.5px]">
              {todayLine()}
            </span>
            <h2 className="mt-1 text-[23px] font-semibold tracking-[-0.015em] text-nevo-near-black xl:text-[26px]">
              {greetName ? `Welcome back, ${greetName}` : "Welcome back"}
            </h2>
          </div>
          {signedIn && identity?.schoolCode && (
            <div className="flex shrink-0 flex-col items-end gap-1 rounded-[12px] bg-nevo-cream-elevated px-3.5 py-2.5 shadow-[0_2px_8px_rgba(0,0,0,0.06)] xl:px-4 xl:py-3">
              <span className="text-xs font-semibold tracking-[0.05em] text-nevo-near-black/55 uppercase">
                School code
              </span>
              <span className="font-mono text-lg font-semibold tracking-[0.14em] text-nevo-navy xl:text-xl">
                {identity.schoolCode}
              </span>
            </div>
          )}
        </div>
        {/* The frame's line says "Three things"; the real count is whatever
            the flags endpoint returned. */}
        {/* The count is said only when it is the whole count. A fixture
            count is the walkthrough's own; a live one needs every page. */}
        {hasFlags && (fixtureFlags.length > 0 || flagsComplete) && (
          <p className="mt-2 hidden text-[15.5px] leading-[1.55] text-nevo-near-black/60 xl:block">
            {`${flagCount} ${flagCount === 1 ? "thing is" : "things are"} worth your eye before first period. Everything else is running smoothly.`}
          </p>
        )}

        {noClasses ? (
          <p className="mt-2.5 max-w-[560px] text-[15.5px] leading-[1.55] text-nevo-near-black/62">
            You don&rsquo;t have any classes yet. When your school adds you to
            one, your students&rsquo; week will show up here.
          </p>
        ) : (
          signedIn &&
          (showFixtureHome || showFixtureFlags) && (
            <p className="mt-2 max-w-[560px] text-[13px] leading-[1.5] text-nevo-near-black/55 italic">
              {/* Names the sections that are ACTUALLY fixture. The two reads
                  fail independently, and this line used to be gated on the
                  home read alone - so when only the flags call failed, three
                  invented children appeared under "Worth your attention" with
                  nothing anywhere saying they were not real. */}
              {showFixtureHome && showFixtureFlags
                ? "We couldn’t read your class activity just now, so what’s below is a sample."
                : showFixtureHome
                  ? "We couldn’t read your class activity just now, so the pulse and recent activity are samples."
                  : "We couldn’t read what needs your attention just now, so the flagged students below are a sample."}
            </p>
          )
        )}

        {/* C16a: the pulse leads - class weather first, specifics below. */}
        {!noClasses &&
          (homeLive
            ? pulse.map((p) => <LiveClassPulse key={p.classId} pulse={p} />)
            : showFixtureHome && (
                /*
                 * MARKED, and it was not until 14 Sep. Home rendered fixtures
                 * on a failed read - correctly, per the fallback design - but
                 * emitted no `data-nevo-sample` anywhere, while every sibling
                 * surface did. `e2e/teacher-signed-in.spec.ts` walks
                 * `/teacher/dashboard` asserting zero sample marks, so that
                 * assertion PASSED VACUOUSLY on the one screen a teacher opens
                 * first. An assertion that cannot fail is worse than none,
                 * because it is counted as coverage.
                 */
                <SampleRegion kind="teacher:home-pulse">
                  <ClassPulse />
                </SampleRegion>
              ))}

        {/* All of this is class-derived. With no classes there is nothing
            truthful to put here - including the calm no-flags card, which
            would claim everyone is moving along. */}
        {!noClasses && (
          <>
            {flagsLoading ? (
              /*
               * C03's FIRST LOAD, which was never built - so for the whole
               * 1-6 seconds the flags take, a teacher was told "Nothing needs
               * you right now" over a morning that may have three children in
               * it. Rule 5: not knowing yet is not knowing nothing.
               *
               * The frame's own shape: a 200px heading bar and three 118px
               * cards, no copy.
               */
              <div aria-busy="true" aria-label="Loading what needs your attention">
                <div className="mt-8 h-3.5 w-[200px] rounded-[6px] bg-nevo-near-black/9" />
                <div className="mt-4 flex flex-col gap-3.5">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-[118px] animate-pulse rounded-[12px] border border-nevo-near-black/5 bg-nevo-near-black/5"
                    />
                  ))}
                </div>
              </div>
            ) : hasFlags ? (
              <>
                <div className="mt-[26px] flex items-center gap-2.5 xl:mt-8">
                  <h3 className={SECTION_H}>Worth your attention</h3>
                  <span className="rounded-full bg-nevo-near-black/10 px-2 py-0.5 text-[12px] text-nevo-near-black/70 xl:px-[9px] xl:text-[12.5px]">
                    {flagCount}
                  </span>
                </div>
                <div className="mt-3.5 flex flex-col gap-3 xl:mt-4 xl:gap-3.5">
                  {flags.map((flag) => (
                    <LiveFlagCard key={flag.id} flag={flag} />
                  ))}
                  {fixtureFlags.length > 0 && (
                    <SampleRegion kind="teacher:home-flags">
                      {fixtureFlags.map((flag) => (
                        <FlagCard key={flag.id} flag={flag} />
                      ))}
                    </SampleRegion>
                  )}
                </div>

                {/* Good to know - a quiet win, never a flag. Fixture prose, so
                    it does not sit beside live flags pretending to be theirs. */}
                {fixtureFlags.length > 0 && (
                <SampleRegion kind="teacher:home-good-to-know">
                <div className="mt-[22px] flex max-w-[660px] items-start gap-3 rounded-[12px] bg-nevo-violet/14 px-[18px] py-4">
                  <span className="mt-px shrink-0 text-nevo-navy">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M12 3a5 5 0 0 0-3 9c.6.5 1 1.2 1 2h4c0-.8.4-1.5 1-2a5 5 0 0 0-3-9z" />
                      <path d="M10 20h4" />
                    </svg>
                  </span>
                  <p className="text-[14.5px] leading-[1.55] text-nevo-near-black/78">
                    <strong className="font-semibold text-nevo-near-black">
                      Good to know:
                    </strong>{" "}
                    {GOOD_TO_KNOW}
                  </p>
                </div>
                </SampleRegion>
                )}
              </>
            ) : (
              // Calm morning - nothing flagged (C03 no-flags state)
              <div className="mt-[26px] flex max-w-[660px] items-center gap-4 rounded-[12px] bg-nevo-cream-elevated px-[26px] py-6 shadow-elevation-1">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-nevo-violet/24 text-nevo-navy">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </span>
                <div>
                  <h3 className="text-[16px] font-semibold text-nevo-near-black xl:text-[17px]">
                    Nothing needs you right now
                  </h3>
                  <p className="mt-[5px] text-sm leading-[1.5] text-nevo-near-black/66 xl:text-[14.5px]">
                    Everyone&rsquo;s moving along at their own pace. We&rsquo;ll
                    let you know the moment something&rsquo;s worth a look.
                  </p>
                </div>
              </div>
            )}

            <h3 className={cn(SECTION_H, "mt-[30px] xl:mt-10")}>My classes</h3>
            <HomeClasses />

            {(homeLive ? activity.length > 0 : showFixtureHome) && (
              <h3 className={cn(SECTION_H, "mt-[30px] xl:mt-9")}>
                Recent activity
              </h3>
            )}
            {homeLive && activity.length > 0 && (
              <div className="mt-3.5 overflow-hidden rounded-[12px] bg-nevo-cream-elevated shadow-elevation-1 xl:mt-4">
                {activity.map((a, i) => {
                  const Row = a.href ? Link : "div";
                  return (
                    <Row
                      key={a.id}
                      href={a.href ?? "#"}
                      className={cn(
                        "flex items-center justify-between gap-4 px-[22px] py-4",
                        a.href &&
                          "cursor-pointer transition-[filter] hover:brightness-[0.985]",
                        i < activity.length - 1 &&
                          "border-b border-nevo-near-black/7",
                      )}
                    >
                      <div className="flex min-w-0 flex-col">
                        <span className="text-[15.5px] font-semibold text-nevo-near-black">
                          {a.title}
                        </span>
                        <span className="mt-[3px] text-[13px] text-nevo-near-black/55">
                          {[a.detail, a.when].filter(Boolean).join(" · ")}
                        </span>
                      </div>
                      {/*
                        HOW FAR THE CLASS GOT, which this row could not show
                        until 17 Sep because both fields were missing from the
                        client type and the poll dropped them. The sample row
                        below has drawn a bar and "{done} of {total} done"
                        throughout, so the LIVE list was strictly poorer than
                        the fallback.
                        
                        A SEPARATE ELEMENT, not interpolated into the line
                        above. Both values are nullable, and frontend section 6
                        is explicit: "values that may be null render as separate
                        elements that disappear when absent." Interpolating them
                        is how "null times" happened.
                        
                        Both or neither: a total with no completed count, or the
                        reverse, is not a fraction and must not be drawn as one.
                      */}
                      {a.completedCount != null && a.totalCount != null && (
                        <div className="flex shrink-0 items-center gap-3.5">
                          <div className="h-1.5 w-[130px] overflow-hidden rounded-full bg-nevo-navy/14">
                            <span
                              className="block h-full rounded-full bg-nevo-navy"
                              style={{
                                // Guarded: a class of nobody is 0/0 on the
                                // wire, and 0/0 is NaN, which renders as a
                                // broken bar rather than an empty one.
                                width: `${a.totalCount > 0 ? Math.round((a.completedCount / a.totalCount) * 100) : 0}%`,
                              }}
                            />
                          </div>
                          <span className="w-[120px] text-right text-sm text-nevo-near-black/68">
                            {`${a.completedCount} of ${a.totalCount} done`}
                          </span>
                        </div>
                      )}
                    </Row>
                  );
                })}
              </div>
            )}

            {showFixtureHome && (
            <SampleRegion kind="teacher:home-activity">
            <div className="mt-3.5 overflow-hidden rounded-[12px] bg-nevo-cream-elevated shadow-elevation-1 xl:mt-4">
              {HOME_ACTIVITY.map((a, i) => (
                <Link
                  key={a.lesson}
                  href={a.href}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-4 px-[22px] py-4 transition-[filter] hover:brightness-[0.985]",
                    i < HOME_ACTIVITY.length - 1 &&
                      "border-b border-nevo-near-black/7",
                  )}
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="text-[15.5px] font-semibold text-nevo-near-black">
                      {a.lesson}
                    </span>
                    <span className="mt-[3px] text-[13px] text-nevo-near-black/55">
                      {a.klass} · {a.when}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3.5">
                    <div className="h-1.5 w-[130px] overflow-hidden rounded-full bg-nevo-navy/14">
                      <span
                        className="block h-full rounded-full bg-nevo-navy"
                        style={{
                          width: `${Math.round((a.done / a.total) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="w-[120px] text-right text-sm text-nevo-near-black/68">
                      {a.done} of {a.total} done
                    </span>
                  </div>
                </Link>
              ))}
            </div>
            </SampleRegion>
            )}
          </>
        )}
      </div>
    </div>
  );
}
