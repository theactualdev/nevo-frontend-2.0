"use client";

import { notFound } from "next/navigation";
import { useTeacherClasses } from "@/hooks/useTeacherClasses";
import { useHydrated } from "@/hooks/useHydrated";
import { getToken } from "@/lib/auth/session";
import type { TeacherClass } from "@/lib/mocks/teacherClasses";
import { ClassDetail } from "./ClassDetail";
import { LiveClassDetail } from "./LiveClassDetail";
import { SampleRegion } from "@/components/shared/SampleRegion";

/**
 * Resolves a class route. Most ids are fixture-backed and render the full
 * console detail. An id the fixtures don't know may still be a real class
 * the school assigned - those carry no roster or lessons yet, so they get
 * the honest minimal screen rather than a 404 that reads like the class
 * doesn't exist.
 *
 * The 404 is held back until the live list has actually answered, so a slow
 * backend never turns a real class into a missing one.
 */
export function ClassRoute({
  fixture,
  classId,
}: {
  fixture: TeacherClass | null;
  classId: string;
}) {
  const { liveClasses, live, sample, loading } = useTeacherClasses();
  const hydrated = useHydrated();

  // See LessonRoute: on the server this route rendered "This page doesn't
  // exist" for a signed-in teacher's own class, because getToken() is false
  // there. Decide nothing until the client is running.
  if (!hydrated) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <div className="h-[280px] w-full max-w-[860px] animate-pulse rounded-[12px] bg-nevo-cream-elevated" />
      </div>
    );
  }

  // A real class is only ever itself. This is checked before the fixtures so
  // that a live class can never be answered with a fixture of the same name.
  const assigned = liveClasses.find((c) => c.classId === classId);
  if (assigned) return <LiveClassDetail klass={assigned} />;

  // Fixtures back the designed screens only while there is no live data -
  // and "no live data" must not include "not back yet". `live` is false for
  // the whole in-flight window too, so without `!loading` a signed-in teacher
  // whose class id collides with a fixture's saw that fixture's invented
  // roster for a second or two before their own class replaced it. Signed
  // out, `useLiveQuery` reports `loading: false` immediately, so the designed
  // walkthrough is untouched by this guard.
  if (!live && !loading && fixture)
    return (
      <SampleRegion kind="teacher:class-detail">
        {/* Signed in, this is a failed read standing in - never a code. */}
        <ClassDetail klass={fixture} withCode={!getToken()} />
      </SampleRegion>
    );

  // Resolved and still unknown - THAT is a 404. `sample` is not resolution:
  // it means the class list could not be read, which is not evidence the
  // class does not exist. Treating it as proof gave a teacher "This page
  // doesn't exist" for their own class whenever the list read failed.
  if (live || !getToken()) notFound();

  if (sample) {
    return (
      <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
        <div className="mx-auto max-w-[660px] rounded-[12px] bg-nevo-cream-elevated px-[26px] py-7 shadow-elevation-1">
          <h2 className="text-[17px] font-semibold text-nevo-near-black">
            We couldn&rsquo;t load this class
          </h2>
          <p className="mt-2 text-sm leading-[1.55] text-nevo-near-black/62">
            It hasn&rsquo;t gone anywhere. Try again in a moment.
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

  return (
    <div className="flex flex-1 items-center justify-center p-12">
      <span
        role="status"
        aria-label="Looking for this class"
        className="size-6 rounded-full border-[2.5px] border-nevo-navy/20 border-t-nevo-navy motion-safe:animate-spin motion-safe:[animation-duration:800ms]"
      />
    </div>
  );
}
