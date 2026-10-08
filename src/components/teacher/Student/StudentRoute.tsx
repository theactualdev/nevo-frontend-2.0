"use client";

import { notFound } from "next/navigation";
import { useStudentProfile } from "@/hooks/useStudentProfile";
import { useHydrated } from "@/hooks/useHydrated";
import { getToken } from "@/lib/auth/session";
import type { StudentProfileData } from "@/lib/mocks/teacherStudents";
import { LiveStudentProfile } from "./LiveStudentProfile";
import { StudentProfile } from "./StudentProfile";
import { SampleRegion } from "@/components/shared/SampleRegion";

/**
 * Resolves a student route, live first - the same shape as the class and
 * lesson routes, and for the same reason: a real student is only ever
 * themselves, never a fixture that happens to share an id.
 *
 * A 404 is a 404. Any other failure is a retry, because telling a teacher a
 * child is gone when the network blinked is the worse error.
 */
export function StudentRoute({
  fixture,
  studentId,
  classHref,
  classId,
  recommendOpen,
}: {
  fixture: StudentProfileData | null;
  studentId: string;
  classHref?: string;
  /** The class the roster row came from, which is where observations live. */
  classId?: string;
  /** C08c opens as its own URL; the gate below has to cover both. */
  recommendOpen?: boolean;
}) {
  const state = useStudentProfile(studentId);
  const hydrated = useHydrated();

  // See LessonRoute: the server cannot read the token, so a real student's
  // page fell through to notFound() and answered 404 on any hard load.
  if (!hydrated) {
    return (
      <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
        <div className="mx-auto max-w-[860px]">
          <div className="h-8 w-64 animate-pulse rounded bg-nevo-cream-elevated" />
          <div className="mt-8 h-[280px] animate-pulse rounded-[12px] bg-nevo-cream-elevated" />
        </div>
      </div>
    );
  }

  if (state.profile) {
    return (
      <LiveStudentProfile
        state={state}
        studentId={studentId}
        classHref={classHref}
        classId={classId}
        /* DROPPED UNTIL 15 SEP. `/teacher/students/{id}/recommend` passes this,
           and the live branch ignored it - so the route existed, resolved, and
           rendered an ordinary profile. C08c was unreachable for every
           signed-in teacher. */
        recommendOpen={recommendOpen}
      />
    );
  }

  if (state.loading) {
    return (
      <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
        <div className="mx-auto max-w-[860px]">
          <div className="h-5 w-32 animate-pulse rounded bg-nevo-cream-elevated" />
          <div className="mt-4 flex items-center gap-4">
            <div className="size-14 animate-pulse rounded-full bg-nevo-cream-elevated xl:size-16" />
            <div className="h-8 w-56 animate-pulse rounded bg-nevo-cream-elevated" />
          </div>
          <div className="mt-8 h-[220px] animate-pulse rounded-[12px] bg-nevo-cream-elevated" />
        </div>
      </div>
    );
  }

  if (state.failed) {
    return (
      <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
        <div className="mx-auto max-w-[660px] rounded-[12px] bg-nevo-cream-elevated px-[26px] py-7 shadow-elevation-1">
          <h1 className="text-[17px] font-semibold text-nevo-near-black">
            We couldn&rsquo;t load this student
          </h1>
          <p className="mt-2 text-sm leading-[1.55] text-nevo-near-black/62">
            Nothing has changed for them. Try again in a moment.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 h-[46px] cursor-pointer rounded-[10px] bg-nevo-navy px-5 text-sm font-semibold text-nevo-cream transition-[filter] hover:brightness-93"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // Fixtures back the designed screen only when there is no live data at all.
  if (!getToken() && fixture)
    return (
      <SampleRegion kind="teacher:student-profile">
        <StudentProfile student={fixture} recommendOpen={recommendOpen} />
      </SampleRegion>
    );

  if (state.missing || !getToken()) notFound();

  return null;
}
