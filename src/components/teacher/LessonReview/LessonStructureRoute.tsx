"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { useEffect, useState } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import { ApiError } from "@/lib/api/client";
import { lessonsApi, type LessonDetailResponse } from "@/lib/api/lessons";
import { getToken } from "@/lib/auth/session";
import { LessonStructureEdit } from "./LessonStructureEdit";

/**
 * Resolves C07d's editor for one lesson in the library, live only - as the
 * review it is reached from is. Signed out, or a lesson that is not there,
 * is a 404 like any other lesson address a visitor cannot see.
 */
export function LessonStructureRoute({ lessonId }: { lessonId: string }) {
  const hydrated = useHydrated();
  const [lesson, setLesson] = useState<LessonDetailResponse | null>(null);
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    lessonsApi
      .detail(lessonId)
      .then((read) => {
        if (!cancelled) setLesson(read);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 404 || err.status === 422)) setMissing(true);
        else setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  if (!hydrated) return null;
  if (!getToken() || missing) notFound();

  if (lesson) {
    const ready =
      (lesson.status === "completed" || lesson.status === "completed_with_review") &&
      lesson.segments.length > 0;
    if (!ready) {
      return (
        <Message title={lesson.title} lessonId={lessonId}>
          {lesson.status === "failed"
            ? "Nevo couldn’t read this file, so there is nothing to change."
            : "Nevo is still reading this lesson. You can change it once it’s done."}
        </Message>
      );
    }
    return <LessonStructureEdit lesson={lesson} />;
  }

  if (failed) {
    return (
      <Message title="We couldn’t load this lesson" lessonId={lessonId}>
        It hasn&rsquo;t gone anywhere, and nothing you did is lost. Try again in a moment.
      </Message>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[640px] px-7 py-6 xl:max-w-[760px] xl:px-10 xl:py-8" aria-busy="true">
      <div className="h-3 w-32 animate-pulse rounded-full bg-nevo-cream-elevated" />
      <div className="mt-4 h-8 w-[60%] animate-pulse rounded-[10px] bg-nevo-cream-elevated" />
      <div className="mt-7 h-[220px] animate-pulse rounded-[12px] bg-nevo-cream-elevated" />
    </div>
  );
}

function Message({
  title,
  lessonId,
  children,
}: {
  title: string;
  lessonId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[660px] rounded-[12px] bg-nevo-cream-elevated px-[26px] py-7 shadow-elevation-1">
        <h1 className="text-[17px] font-semibold text-nevo-near-black">{title}</h1>
        <p className="mt-2 text-sm leading-[1.55] text-nevo-near-black/62">{children}</p>
        <Link
          href={`/teacher/lessons/${lessonId}`}
          className="mt-5 inline-flex h-[46px] cursor-pointer items-center rounded-[10px] bg-nevo-navy px-5 text-sm font-semibold text-nevo-cream transition-[filter] hover:brightness-93"
        >
          Back to the lesson
        </Link>
      </div>
    </div>
  );
}
