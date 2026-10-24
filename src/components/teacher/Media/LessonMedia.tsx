"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { notFound } from "next/navigation";
import { MediaTile, PlayButton, duration, useNarrationSampler } from "@/components/teacher/Media/MediaPieces";
import { useHydrated } from "@/hooks/useHydrated";
import { ApiError, apiErrorMessage } from "@/lib/api/client";
import { lessonsApi, type LessonDetailResponse, type LessonSegment } from "@/lib/api/lessons";
import { mediaApi, type LessonMediaItem, type MediaKind } from "@/lib/api/media";
import { getToken } from "@/lib/auth/session";

/**
 * C06c Lesson Media (design 82c213b, 23 Oct): a lesson children are already
 * using, its live pictures and narration, and pulling one that shouldn't be
 * there.
 *
 * ONE QUIET ACTION, NO DIALOG. "Remove" takes the picture or recording out of
 * the lesson there and then (Teslim e03e0ae). The section then says what is
 * now true - "That picture is gone from this lesson. Children won't see it
 * again." - and what a child gets now, including text alone. Removing
 * regenerates nothing and re-runs no review.
 *
 * THE UNDO LASTS WHILE THE TEACHER STAYS. It sits beside what it undoes for
 * as long as this screen is open and is gone once they leave, with the reduced
 * section standing alone - no countdown, no deadline drawn. The server keeps
 * its own window; if it has closed, the undo says so instead of pretending.
 */

type Removal = { item: LessonMediaItem; restoring: boolean; refused: string | null };

const key = (segmentId: string, kind: MediaKind) => `${segmentId}|${kind}`;

function humanList(parts: string[]): string {
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export function LessonMediaRoute({ lessonId }: { lessonId: string }) {
  const hydrated = useHydrated();
  const [lesson, setLesson] = useState<LessonDetailResponse | null>(null);
  const [items, setItems] = useState<LessonMediaItem[]>([]);
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState(false);

  const read = useCallback(
    () =>
      Promise.all([lessonsApi.detail(lessonId), mediaApi.list(lessonId).catch(() => null)]).then(
        ([detail, media]) => {
          setLesson(detail);
          setItems(media?.items ?? []);
        },
      ),
    [lessonId],
  );

  useEffect(() => {
    if (!getToken()) return;
    read().catch((err: unknown) => {
      if (err instanceof ApiError && (err.status === 404 || err.status === 422)) setMissing(true);
      else setFailed(true);
    });
  }, [read]);

  if (!hydrated) return null;
  if (!getToken() || missing) notFound();
  if (failed) {
    return (
      <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
        <div className="mx-auto max-w-[660px] rounded-[12px] bg-nevo-cream-elevated px-[26px] py-7 shadow-elevation-1">
          <h1 className="text-[17px] font-semibold text-nevo-near-black">We couldn&rsquo;t load this lesson&rsquo;s media</h1>
          <p className="mt-2 text-sm leading-[1.55] text-nevo-near-black/62">
            It hasn&rsquo;t gone anywhere. Try again in a moment.
          </p>
        </div>
      </div>
    );
  }
  if (!lesson) {
    return (
      <div className="flex min-h-0 flex-1 flex-col" aria-busy="true">
        <div className="h-[104px] flex-none border-b border-nevo-near-black/9" />
        <div className="mx-auto w-full max-w-[640px] px-[26px] py-[22px] xl:max-w-[820px] xl:px-10 xl:py-[26px]">
          <div className="h-5 w-48 animate-pulse rounded-[10px] bg-nevo-cream-elevated" />
          <div className="mt-4 h-[140px] animate-pulse rounded-[12px] bg-nevo-cream-elevated" />
        </div>
      </div>
    );
  }
  return <LessonMedia lesson={lesson} items={items} reread={read} />;
}

export function LessonMedia({
  lesson,
  items,
  reread,
}: {
  lesson: LessonDetailResponse;
  items: LessonMediaItem[];
  reread: () => Promise<unknown>;
}) {
  const segments = useMemo(
    () => [...lesson.segments].sort((a, b) => a.sequenceOrder - b.sequenceOrder),
    [lesson.segments],
  );
  /** Removed in this visit, by section and kind: the undo's whole lifetime. */
  const [removed, setRemoved] = useState<Record<string, Removal>>({});
  const [working, setWorking] = useState<string | null>(null);
  const [refused, setRefused] = useState<{ at: string; message: string } | null>(null);
  const sampler = useNarrationSampler();

  /** The approved media item for a section's live picture or recording, when there is one. */
  const itemFor = (segmentId: string, kind: MediaKind) =>
    items.find((m) => m.segmentId === segmentId && m.kind === kind && m.status === "approved");

  /*
   * WHICH SECTIONS. Those with a live picture or recording, and those whose
   * media was taken out - here, or on an earlier visit - so a teacher can see
   * that a section is text alone now. A section that never had media has
   * nothing to say on this screen.
   */
  const everWithdrawn = new Set(items.filter((m) => m.status === "withdrawn").map((m) => m.segmentId));
  const rows = segments
    .map((segment, index) => ({ segment, index }))
    .filter(
      ({ segment }) =>
        Boolean(segment.visualVariant?.imageUrl) ||
        Boolean(segment.audioVariant?.audioUrl) ||
        everWithdrawn.has(segment.id) ||
        Object.keys(removed).some((k) => k.startsWith(`${segment.id}|`)),
    );

  const hasPictures = segments.some((s) => s.visualVariant?.imageUrl);
  const hasNarration = segments.some((s) => s.audioVariant?.audioUrl);
  const classNames = (lesson.classes ?? []).map((c) => c.name);
  const meta = [
    classNames.length > 0 ? `Live with ${humanList(classNames)}` : null,
    `${segments.length} ${segments.length === 1 ? "section" : "sections"}`,
    hasPictures && hasNarration
      ? "pictures and narration"
      : hasPictures
        ? "pictures"
        : hasNarration
          ? "narration"
          : "text only",
  ].filter(Boolean);

  const remove = async (segment: LessonSegment, kind: MediaKind) => {
    const at = key(segment.id, kind);
    if (working) return;
    setWorking(at);
    setRefused(null);
    sampler.stop();
    try {
      const live = itemFor(segment.id, kind);
      const item = live
        ? await mediaApi.withdraw(lesson.id, live.id)
        : await mediaApi.withdrawLive(lesson.id, segment.id, kind);
      setRemoved((r) => ({ ...r, [at]: { item, restoring: false, refused: null } }));
      await reread().catch(() => {});
    } catch (err: unknown) {
      const detail = err instanceof ApiError ? err.detail : undefined;
      setRefused({
        at,
        message: apiErrorMessage(detail) ?? "That didn’t come out just now, and the lesson is unchanged. Try again in a moment.",
      });
    } finally {
      setWorking(null);
    }
  };

  const undo = async (at: string) => {
    const r = removed[at];
    if (!r || working) return;
    setWorking(at);
    setRemoved((all) => ({ ...all, [at]: { ...r, restoring: true, refused: null } }));
    try {
      await mediaApi.restore(lesson.id, r.item.id);
      setRemoved((all) => {
        const next = { ...all };
        delete next[at];
        return next;
      });
      await reread().catch(() => {});
    } catch (err: unknown) {
      const detail = err instanceof ApiError ? err.detail : undefined;
      setRemoved((all) => ({
        ...all,
        [at]: {
          ...r,
          restoring: false,
          refused: apiErrorMessage(detail) ?? "It can’t be put back now.",
        },
      }));
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-none border-b border-nevo-near-black/9 px-[22px] py-4 xl:px-8 xl:py-5">
        <Link
          href={`/teacher/lessons/${lesson.id}`}
          className="inline-flex items-center gap-[7px] text-[13.5px] text-nevo-near-black/60 hover:text-nevo-near-black"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 6l-6 6 6 6" />
          </svg>
          Lesson Detail
        </Link>
        <h1 className="mt-2.5 text-[21px] font-semibold tracking-[-0.014em] text-nevo-near-black xl:text-[24px]">
          {lesson.title}
        </h1>
        <span className="mt-[5px] block text-[13.5px] text-nevo-near-black/60">{meta.join(" · ")}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-[26px] py-[22px] xl:px-10 xl:py-[26px]">
        <div className="mx-auto max-w-[640px] xl:max-w-[820px]">
          {rows.length === 0 && (
            <p className="text-[14.5px] leading-[1.55] text-nevo-near-black/68">
              This lesson has no pictures or narration. Children read it as text.
            </p>
          )}
          {rows.map(({ segment, index }) => {
            const picture = segment.visualVariant?.imageUrl ? segment.visualVariant : null;
            const recording = segment.audioVariant?.audioUrl ? segment.audioVariant : null;
            const empty = !picture && !recording;
            const title = segment.title?.trim() || `Section ${index + 1}`;
            const parts = [...(picture ? ["1 picture"] : []), ...(recording ? ["narration"] : []), "text"];
            const notices = (["image", "audio"] as const)
              .map((kind) => ({ kind, at: key(segment.id, kind), r: removed[key(segment.id, kind)] }))
              .filter((n) => n.r);
            const refusedHere = (kind: MediaKind) =>
              refused?.at === key(segment.id, kind) ? refused.message : null;
            return (
              <section
                key={segment.id}
                aria-label={title}
                className="mb-[22px] border-b border-nevo-near-black/8 pb-[22px] last:mb-0 last:border-b-0"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h2 className="text-[14.5px] font-semibold text-nevo-near-black xl:text-[15.5px]">{title}</h2>
                  <span className="text-[13px] font-medium text-nevo-violet-text">
                    {empty ? "Children read this section as text only." : `Children get ${humanList(parts)}.`}
                  </span>
                </div>

                {notices.map(({ kind, at, r }) => (
                  <div
                    key={at}
                    role="status"
                    className="mt-3 flex items-center gap-[13px] rounded-[10px] bg-nevo-cream-elevated px-[15px] py-3 shadow-elevation-1 motion-safe:animate-nevo-rise"
                  >
                    <span className="min-w-0 flex-1 text-[14px] leading-[1.5] text-nevo-near-black">
                      {kind === "image"
                        ? "That picture is gone from this lesson. Children won’t see it again."
                        : "That recording is gone from this lesson. Children won’t hear it again."}
                      {empty && " This section is text only now."}
                      {r!.refused && (
                        <span className="mt-1 block text-[12.5px] font-medium text-nevo-navy">{r!.refused}</span>
                      )}
                    </span>
                    {!r!.refused && (
                      <button
                        type="button"
                        onClick={() => void undo(at)}
                        disabled={working !== null}
                        className="h-8 shrink-0 cursor-pointer rounded-full border-none bg-nevo-navy px-[15px] text-[13px] font-semibold text-nevo-cream disabled:cursor-default disabled:opacity-55"
                      >
                        {r!.restoring ? "Putting it back…" : "Undo"}
                      </button>
                    )}
                  </div>
                ))}

                {picture && (
                  <div className="mt-3.5 grid grid-cols-[repeat(auto-fill,minmax(124px,1fr))] gap-3 xl:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
                    <div>
                      <MediaTile image={picture} alt={picture.caption || `The picture for ${title}`} />
                      <button
                        type="button"
                        onClick={() => void remove(segment, "image")}
                        disabled={working !== null}
                        aria-label={`Remove the picture from ${title}`}
                        className="mt-[7px] inline-flex cursor-pointer border-none bg-transparent p-0 text-[12.5px] font-semibold text-nevo-navy underline underline-offset-[3px] disabled:cursor-default disabled:opacity-55"
                      >
                        {working === key(segment.id, "image") ? "Removing…" : "Remove"}
                      </button>
                      {refusedHere("image") && (
                        <span role="alert" className="mt-1 block text-[12.5px] font-medium text-nevo-navy">
                          {refusedHere("image")}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {recording && (
                  <div className="mt-3.5 overflow-hidden rounded-[12px] bg-nevo-cream-elevated shadow-elevation-1">
                    <div className="flex items-center gap-[13px] px-[15px] py-[11px]">
                      <PlayButton
                        playing={sampler.playing === segment.id}
                        label={`the narration for ${title}`}
                        onClick={() => sampler.toggle(segment.id, recording)}
                        disabled={sampler.unplayable.has(segment.id)}
                      />
                      <span className="min-w-0 flex-1 text-[14.5px] font-medium text-nevo-near-black xl:text-[15.5px]">
                        Narration
                        {sampler.unplayable.has(segment.id) && (
                          <span className="block text-[12px] font-normal text-nevo-near-black/55">
                            This one won&rsquo;t play just now.
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-[12.5px] text-nevo-near-black/50 tabular-nums">
                        {duration(recording.durationMs)}
                      </span>
                      <button
                        type="button"
                        onClick={() => void remove(segment, "audio")}
                        disabled={working !== null}
                        aria-label={`Remove the narration from ${title}`}
                        className="shrink-0 cursor-pointer border-none bg-transparent p-0 text-[12.5px] font-semibold text-nevo-navy underline underline-offset-[3px] disabled:cursor-default disabled:opacity-55"
                      >
                        {working === key(segment.id, "audio") ? "Removing…" : "Remove"}
                      </button>
                    </div>
                    {refusedHere("audio") && (
                      <span role="alert" className="block px-[15px] pb-[11px] text-[12.5px] font-medium text-nevo-navy">
                        {refusedHere("audio")}
                      </span>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
