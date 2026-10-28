"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useSystemMessages } from "@/components/shared/SystemMessages";
import { useUnsavedGuard } from "@/hooks/useUnsavedGuard";
import { ApiError, apiErrorCode, apiErrorMessage } from "@/lib/api/client";
import { lessonsApi, type LessonDetailResponse } from "@/lib/api/lessons";
import {
  draftFrom,
  foldIntoAbove,
  hasChanges,
  isStructural,
  missingNames,
  moveSection,
  moveSegment,
  moveSegmentAcross,
  segmentOrder,
  startSectionAfter,
  toPayload,
  type StructureDraft,
} from "@/lib/lessons/structureDraft";
import { cn } from "@/lib/utils";

/**
 * C07d, for a lesson already in the library (Teslim d78756b).
 *
 * WHERE IT IS REACHED FROM. C07d's own port note: the tree is "no longer a
 * required gate ... The reorder / split / merge / rename tools here are kept
 * as optional editing, reached from step 1 only when a teacher wants to change
 * something". And "a full page with a pinned commit bar, never a modal". So
 * step 1 of the review links here, and the page saves once, from its bar.
 *
 * SHIPPED REDUCED (the Hub, 28 Oct). The route renames everything and can
 * reorder and regroup, but cannot split, merge or remove a segment, so those
 * C07d controls are not here. Filed with Teslim.
 *
 * AN ASSIGNED LESSON KEEPS ITS ORDER. The route refuses any change of order,
 * membership or sections while the lesson is assigned (409
 * `lesson_structure_in_use`), so such a lesson offers renaming only, and says
 * why. A reorder also means signing the review again: the review is read in
 * section order, so its sign-offs no longer match. The bar says so.
 */

const ICON_BTN =
  "inline-flex size-[26px] shrink-0 cursor-pointer items-center justify-center rounded-[10px] text-nevo-near-black/45 transition-colors hover:bg-nevo-navy/8 hover:text-nevo-near-black/75 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent";
const TITLE_INPUT =
  "min-w-0 flex-1 rounded-[10px] bg-transparent px-1.5 py-1 text-nevo-near-black outline-none focus:bg-nevo-cream focus:ring-2 focus:ring-nevo-navy/30";
const KICKER =
  "shrink-0 font-mono text-[10px] font-bold tracking-[0.08em] text-nevo-violet uppercase";
const CARD = "rounded-[12px] bg-nevo-cream-elevated shadow-elevation-1";
const PRIMARY =
  "inline-flex h-[42px] shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-nevo-navy px-[18px] text-[13.5px] font-semibold whitespace-nowrap text-nevo-cream transition-[filter] hover:brightness-104 disabled:cursor-default disabled:opacity-55 xl:h-[46px] xl:px-[22px] xl:text-[14.5px]";
const GHOST =
  "inline-flex h-[42px] shrink-0 cursor-pointer items-center justify-center rounded-[10px] border-[1.5px] border-nevo-navy/30 px-[15px] text-[13px] font-medium whitespace-nowrap text-nevo-navy transition-colors hover:bg-nevo-navy/6 xl:h-[46px] xl:px-[18px] xl:text-[14px]";

/** Ours, for the route's refusals that come without a sentence. */
const REFUSED: Record<string, string> = {
  lesson_structure_in_use:
    "This lesson is assigned, so its order can’t change. Your new names are kept - save them on their own.",
  structure_title_required: "The lesson and every section need a name.",
  structure_segments_mismatch:
    "This lesson changed while you had it open. Reload the page to see it as it is now.",
  structure_modules_mismatch:
    "This lesson changed while you had it open. Reload the page to see it as it is now.",
  structure_module_segments_mismatch:
    "This lesson changed while you had it open. Reload the page to see it as it is now.",
};

function Arrow({ up }: { up: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={up ? "M12 19V5M6 11l6-6 6 6" : "M12 5v14M18 13l-6 6-6-6"} />
    </svg>
  );
}

export function LessonStructureEdit({ lesson }: { lesson: LessonDetailResponse }) {
  const router = useRouter();
  const say = useSystemMessages();
  const original = useMemo(() => draftFrom(lesson), [lesson]);
  const [draft, setDraft] = useState<StructureDraft>(original);
  /** Renaming only: the lesson is assigned, by its count or by the server's refusal. */
  const [assigned, setAssigned] = useState((lesson.assignmentCount ?? 0) > 0);
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const changed = hasChanges(draft, original);
  const structural = isStructural(draft, original);
  const unnamed = missingNames(draft);
  useUnsavedGuard(changed && !saving);

  const reviewHref = `/teacher/lessons/${lesson.id}/review?step=1`;
  const edit = (next: StructureDraft) => {
    setRefusal(null);
    setDraft(next);
  };
  const nameSegment = (id: string, value: string) =>
    edit({ ...draft, segmentTitles: { ...draft.segmentTitles, [id]: value } });
  const segmentLabel = (id: string, n: number) => draft.segmentTitles[id]?.trim() || `Segment ${n}`;

  const save = async () => {
    if (!changed || unnamed || saving) return;
    setSaving(true);
    setRefusal(null);
    try {
      await lessonsApi.editStructure(lesson.id, toPayload(draft));
      say.show({
        kind: "confirm",
        message: structural
          ? "Saved. The review needs your sign-off again before you assign it."
          : "Saved.",
      });
      router.push(reviewHref);
    } catch (err: unknown) {
      const detail = err instanceof ApiError ? err.detail : undefined;
      const code = apiErrorCode(detail);
      if (code === "lesson_structure_in_use") {
        // Keep every name they typed; put the order back as it was.
        setAssigned(true);
        setDraft({
          ...original,
          title: draft.title,
          segmentTitles: draft.segmentTitles,
          sections: original.sections.map((s) => ({
            ...s,
            title: draft.sections.find((d) => d.id === s.id)?.title ?? s.title,
          })),
        });
      }
      setRefusal(
        REFUSED[code ?? ""] ??
          apiErrorMessage(detail) ??
          "That didn’t save, and nothing has changed. Try again in a moment.",
      );
    } finally {
      setSaving(false);
    }
  };

  /** Each segment's place in the lesson, counted from 1, as the draft has them. */
  const numberOf = new Map(segmentOrder(draft).map((id, i) => [id, i + 1]));
  const segmentRow = (id: string, place: { first: boolean; last: boolean; section: number }) => {
    const n = numberOf.get(id) ?? 0;
    const label = segmentLabel(id, n);
    const inSections = draft.sections.length > 0;
    return (
      <li key={id} className="flex items-center gap-2 border-b border-nevo-near-black/6 px-[15px] py-2 last:border-b-0">
        <span className="w-5 shrink-0 text-[12.5px] text-nevo-near-black/40 tabular-nums">{n}</span>
        <input
          value={draft.segmentTitles[id] ?? ""}
          onChange={(e) => nameSegment(id, e.target.value)}
          placeholder={`Segment ${n}`}
          maxLength={255}
          aria-label={`Segment ${n} title`}
          className={cn(TITLE_INPUT, "text-[14px] xl:text-[14.5px]")}
        />
        {!assigned && (
          <span className="flex shrink-0 items-center gap-0.5">
            <button type="button" onClick={() => edit(moveSegment(draft, id, -1))} disabled={place.first} aria-label={`Move ${label} up`} title="Move up" className={ICON_BTN}>
              <Arrow up />
            </button>
            <button type="button" onClick={() => edit(moveSegment(draft, id, 1))} disabled={place.last} aria-label={`Move ${label} down`} title="Move down" className={ICON_BTN}>
              <Arrow up={false} />
            </button>
            {inSections && (
              <>
                <button type="button" onClick={() => edit(moveSegmentAcross(draft, id, -1))} disabled={place.section === 0} aria-label={`Move ${label} to the section above`} title="Move to the section above" className={ICON_BTN}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M9 14l-4-4 4-4M5 10h9a5 5 0 0 1 5 5v4" />
                  </svg>
                </button>
                <button type="button" onClick={() => edit(moveSegmentAcross(draft, id, 1))} disabled={place.section === draft.sections.length - 1} aria-label={`Move ${label} to the section below`} title="Move to the section below" className={ICON_BTN}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M9 10l-4 4 4 4M5 14h9a5 5 0 0 0 5-5V5" />
                  </svg>
                </button>
                {/* Not on a section's last segment, where it would start nothing. */}
                {!place.last && (
                  <button
                    type="button"
                    onClick={() =>
                      edit(startSectionAfter(draft, id, "New section"))
                    }
                    aria-label={`Start a new section after ${label}`}
                    title="Start a new section after this segment"
                    className="inline-flex size-[26px] shrink-0 cursor-pointer items-center justify-center rounded-[10px] border-[1.5px] border-nevo-navy/30 text-nevo-navy transition-colors hover:bg-nevo-navy/6"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M8 3v18M3 8h10M3 16h10M21 8l-3 4 3 4" />
                    </svg>
                  </button>
                )}
              </>
            )}
          </span>
        )}
      </li>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6 xl:px-10 xl:py-8">
        <div className="mx-auto w-full max-w-[640px] xl:max-w-[760px]">
          <Link
            href={reviewHref}
            className="inline-flex cursor-pointer items-center gap-[7px] text-[13px] text-nevo-near-black/55 xl:text-[13.5px]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 6l-6 6 6 6" />
            </svg>
            Lesson review
          </Link>
          <h1 className="mt-3 text-[22px] leading-[1.2] font-semibold tracking-[-0.014em] text-nevo-near-black xl:text-[26px]">
            Change how it&rsquo;s broken up
          </h1>
          <p className="mt-2.5 text-[13.5px] leading-[1.55] text-nevo-near-black/62 xl:text-[14.5px]">
            {assigned
              ? "This lesson is assigned, so its order can’t change while it is. You can still rename anything."
              : "Rename anything, or move things with the arrows. Nothing changes until you save."}
          </p>

          <label className="mt-6 block">
            <span className="block text-[12.5px] font-semibold text-nevo-near-black/55">Lesson title</span>
            <input
              value={draft.title}
              onChange={(e) => edit({ ...draft, title: e.target.value })}
              maxLength={255}
              className={cn(CARD, "mt-2 block w-full px-[15px] py-3 text-[15px] font-semibold text-nevo-near-black outline-none focus:ring-2 focus:ring-nevo-navy/30 xl:text-[16px]")}
            />
          </label>

          {draft.sections.length > 0 ? (
            <ol className="mt-6 flex list-none flex-col gap-3 p-0">
              {draft.sections.map((section, si) => (
                <li key={section.key} className={cn(CARD, "overflow-hidden")}>
                  <div className="flex items-center gap-2 border-b border-nevo-near-black/8 px-[15px] py-2.5">
                    <span className={KICKER}>{`Section ${si + 1}`}</span>
                    <input
                      value={section.title}
                      onChange={(e) =>
                        edit({
                          ...draft,
                          sections: draft.sections.map((s, i) => (i === si ? { ...s, title: e.target.value } : s)),
                        })
                      }
                      maxLength={255}
                      aria-label={`Section ${si + 1} title`}
                      className={cn(TITLE_INPUT, "text-[14px] font-semibold xl:text-[15px]")}
                    />
                    {!assigned && (
                      <span className="flex shrink-0 items-center gap-0.5">
                        <button type="button" onClick={() => edit(moveSection(draft, si, -1))} disabled={si === 0} aria-label={`Move section ${si + 1} up`} title="Move up" className={ICON_BTN}>
                          <Arrow up />
                        </button>
                        <button type="button" onClick={() => edit(moveSection(draft, si, 1))} disabled={si === draft.sections.length - 1} aria-label={`Move section ${si + 1} down`} title="Move down" className={ICON_BTN}>
                          <Arrow up={false} />
                        </button>
                        <button type="button" onClick={() => edit(foldIntoAbove(draft, si))} disabled={si === 0} aria-label={`Fold section ${si + 1} into the section above`} title="Fold into the section above" className={ICON_BTN}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M5 9h14M5 15h14M9 5l3-3 3 3" />
                          </svg>
                        </button>
                      </span>
                    )}
                  </div>
                  <ul className="m-0 list-none p-0">
                    {section.segmentIds.map((id, pi) =>
                      segmentRow(id, {
                        first: pi === 0,
                        last: pi === section.segmentIds.length - 1,
                        section: si,
                      }),
                    )}
                  </ul>
                </li>
              ))}
            </ol>
          ) : (
            <ul className={cn(CARD, "mt-6 list-none overflow-hidden p-0")}>
              {draft.order.map((id, i) =>
                segmentRow(id, { first: i === 0, last: i === draft.order.length - 1, section: 0 }),
              )}
            </ul>
          )}
        </div>
      </div>

      <div className="flex flex-none items-center gap-3.5 border-t border-nevo-near-black/10 bg-nevo-cream px-6 py-3 xl:px-8 xl:py-3.5">
        <Link href={reviewHref} className={GHOST}>
          Cancel
        </Link>
        <span
          role={refusal ? "alert" : undefined}
          className={cn(
            "min-w-0 flex-1 text-[12.5px] leading-[1.45]",
            refusal ? "font-medium text-nevo-navy" : "text-nevo-near-black/60",
          )}
        >
          {refusal ??
            (unnamed
              ? "The lesson and every section need a name."
              : structural
                ? "Changing the order means the review needs your sign-off again."
                : changed
                  ? "Only names change, so the review is not affected."
                  : "Nothing changed yet.")}
        </span>
        <button type="button" onClick={() => void save()} disabled={!changed || unnamed || saving} className={PRIMARY}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
