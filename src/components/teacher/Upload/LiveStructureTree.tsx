"use client";

import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import {
  lessonsOf,
  namedSegments,
  uploadsApi,
  type StructureLesson,
  type UploadSegment,
  type UploadStructure,
} from "@/lib/api/uploads";
import { cn } from "@/lib/utils";
import { useSystemMessages } from "@/components/shared/SystemMessages";
import { useUnsavedGuard } from "@/hooks/useUnsavedGuard";

/**
 * C07d for a REAL staged upload: the unit Nevo made, the steering a teacher
 * does to it, and the commit that puts it in the library.
 *
 * WHAT CAN BE STEERED, and why not more. `PUT /uploads/{id}/structure` takes
 * the whole document back, so anything expressible in it is editable here:
 * renaming a lesson or a section, reordering either, moving a section to the
 * lesson beside it, and folding a lesson into the one before it.
 *
 * SPLIT IS HERE as of 3 Sep, and the way it works is worth knowing. It used
 * to be absent because starting a new lesson meant minting a `format: uuid`
 * identity this side of the wire, which would have been rejected or - worse -
 * accepted as an orphan. `lessonId` is now OPTIONAL on a structure lesson:
 * a split writes the new half with NO id, the server mints one, and confirm
 * returns them in `lessonIds` aligned with the lessons that were sent. The
 * client never invents identity for a row it does not own.
 *
 * The third level NAMES its rows, also as of 3 Sep. `segments` on the status
 * response carries `{segmentKey, title, estimatedMinutes, needsReview}` and
 * modules point at them by key, so a section can list what is under it. A
 * segment the parse did not name is NUMBERED, never given an invented title -
 * the rule `LiveModuleReview` already follows. With no `segments` at all (an
 * older upload) the section keeps its count and lists nothing.
 *
 * AND IT IS STEERED, as C07d asks at every level (6 Oct). A segment moves up
 * or down within its section, into the section above or below, and "Start a
 * new section after this segment" splits a section where the teacher says -
 * all expressible, because `PUT structure` takes `segmentIds` per module.
 * Buttons rather than drag handles, for the reason the rest of the tree uses
 * them: HTML5 drag does not fire on a tablet. Segment titles are not
 * editable: the structure document carries keys, not titles.
 *
 * NOTHING IS COMMITTED THAT THE SERVER HAS NOT SEEN. The commit acts on the
 * stored structure, so committing a draft would add a unit shaped differently
 * from the one on screen. That used to be enforced by greying the commit out
 * over unsaved edits, explained only by a hover title - a button a teacher
 * could press and be told nothing. It now saves first and asks second, as
 * `LiveModuleReview` does on the single path: if the save fails, the error
 * says so and nothing is asked.
 *
 * EXPAND AND COLLAPSE, as C07d draws them: a caret on each lesson and on each
 * section that has named rows under it, and "Expand all" / "Collapse all"
 * above the tree. It opens fully expanded, which is how it has always opened,
 * so the toggle starts as "Collapse all".
 */

type Saving = "idle" | "saving" | "saved" | "failed";

export function LiveStructureTree({
  uploadId,
  structure,
  segments,
  blockName,
}: {
  uploadId: string;
  structure: UploadStructure;
  /** Named rows for the third level. Absent on an older upload. */
  segments?: UploadSegment[];
  blockName: string;
}) {
  const router = useRouter();
  const say = useSystemMessages();
  const [draft, setDraft] = useState<StructureLesson[]>(() =>
    lessonsOf(structure),
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState<Saving>("idle");
  const [canUndo, setCanUndo] = useState(false);
  const [phase, setPhase] = useState<"idle" | "confirm" | "committing">("idle");
  const [error, setError] = useState("");
  /** What a teacher has folded away. Empty is everything open. */
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  // Edits the server has not seen yet.
  useUnsavedGuard(dirty);

  const lessonKey = (lesson: StructureLesson, li: number) =>
    lesson.lessonId ?? `new-${li}`;
  const moduleKey = (lesson: StructureLesson, li: number, mi: number) =>
    `${lessonKey(lesson, li)}:${mi}`;
  const toggle = (key: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const allOpen = closed.size === 0;
  const toggleAll = () =>
    setClosed(
      allOpen
        ? new Set(
            draft.flatMap((l, li) => [
              lessonKey(l, li),
              ...l.modules.map((_, mi) => moduleKey(l, li, mi)),
            ]),
          )
        : new Set(),
    );

  const plural = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`;

  const totals = draft.reduce(
    (acc, l) => ({
      modules: acc.modules + l.modules.length,
      segments:
        acc.segments + l.modules.reduce((n, m) => n + m.segmentIds.length, 0),
    }),
    { modules: 0, segments: 0 },
  );

  const summary = [
    plural(draft.length, "lesson", "lessons"),
    plural(totals.modules, "section", "sections"),
    plural(totals.segments, "segment", "segments"),
  ].join(" · ");

  /** Every edit goes through here, so nothing changes without marking dirty. */
  const edit = (next: StructureLesson[]) => {
    setDraft(next);
    setDirty(true);
    setSaving("idle");
    setError("");
  };

  const renameLesson = (li: number, title: string) =>
    edit(draft.map((l, i) => (i === li ? { ...l, title } : l)));

  const renameModule = (li: number, mi: number, title: string) =>
    edit(
      draft.map((l, i) =>
        i === li
          ? {
              ...l,
              modules: l.modules.map((m, j) =>
                j === mi ? { ...m, title } : m,
              ),
            }
          : l,
      ),
    );

  const moveLesson = (li: number, by: -1 | 1) => {
    const to = li + by;
    if (to < 0 || to >= draft.length) return;
    const next = [...draft];
    [next[li], next[to]] = [next[to], next[li]];
    edit(next);
  };

  /** Fold a lesson's sections into the one before it. */
  /**
   * Split a lesson at a section boundary: everything from `mi` onward becomes
   * a new lesson directly after this one.
   *
   * The new lesson carries NO `lessonId`. That is the whole mechanism - the
   * server mints identity for a lesson that arrives without it, and hands the
   * ids back from confirm. Minting one here would name nothing that exists.
   *
   * Splitting at the first section would leave an empty lesson behind, so the
   * control is offered from the second section down.
   */
  const splitLessonAt = (li: number, mi: number) => {
    if (mi <= 0) return;
    const lesson = draft[li];
    const next = [...draft];
    next[li] = { ...lesson, modules: lesson.modules.slice(0, mi) };
    next.splice(li + 1, 0, {
      // no lessonId - the server assigns it
      title: "",
      sequenceOrder: lesson.sequenceOrder + 1,
      modules: lesson.modules.slice(mi),
    });
    // Sequence is positional, so renumber rather than leave a duplicate.
    edit(next.map((l, i) => ({ ...l, sequenceOrder: i + 1 })));
  };

  const mergeLessonUp = (li: number) => {
    if (li === 0) return;
    const next = [...draft];
    next[li - 1] = {
      ...next[li - 1],
      modules: [...next[li - 1].modules, ...next[li].modules],
    };
    next.splice(li, 1);
    edit(next);
  };

  const moveModule = (li: number, mi: number, by: -1 | 1) => {
    const to = mi + by;
    const mods = draft[li].modules;
    if (to < 0 || to >= mods.length) return;
    const nextMods = [...mods];
    [nextMods[mi], nextMods[to]] = [nextMods[to], nextMods[mi]];
    edit(draft.map((l, i) => (i === li ? { ...l, modules: nextMods } : l)));
  };

  /** Move a section into the lesson above or below it. */
  const moveModuleAcross = (li: number, mi: number, by: -1 | 1) => {
    const to = li + by;
    if (to < 0 || to >= draft.length) return;
    const moving = draft[li].modules[mi];
    const next = draft.map((l, i) => {
      if (i === li) {
        return { ...l, modules: l.modules.filter((_, j) => j !== mi) };
      }
      if (i === to) {
        return {
          ...l,
          modules: by === -1 ? [...l.modules, moving] : [moving, ...l.modules],
        };
      }
      return l;
    });
    // A lesson emptied by the move is no longer a lesson.
    edit(next.filter((l) => l.modules.length > 0));
  };

  /** Replace one lesson's sections, through `edit` so it marks dirty. */
  const withModules = (li: number, mods: StructureLesson["modules"]) =>
    edit(draft.map((l, i) => (i === li ? { ...l, modules: mods } : l)));

  /** Reorder a segment within its section. */
  const moveSegment = (li: number, mi: number, pi: number, by: -1 | 1) => {
    const ids = draft[li].modules[mi].segmentIds;
    const to = pi + by;
    if (to < 0 || to >= ids.length) return;
    const nextIds = [...ids];
    [nextIds[pi], nextIds[to]] = [nextIds[to], nextIds[pi]];
    withModules(
      li,
      draft[li].modules.map((m, j) => (j === mi ? { ...m, segmentIds: nextIds } : m)),
    );
  };

  /**
   * Move a segment into the section above or below it, in the same lesson:
   * to the end of the one above, the start of the one below. A section the
   * move empties is no longer a section.
   */
  const moveSegmentAcross = (li: number, mi: number, pi: number, by: -1 | 1) => {
    const mods = draft[li].modules;
    const to = mi + by;
    if (to < 0 || to >= mods.length) return;
    const key = mods[mi].segmentIds[pi];
    const next = mods.map((m, j) => {
      if (j === mi) {
        return { ...m, segmentIds: m.segmentIds.filter((_, k) => k !== pi) };
      }
      if (j === to) {
        return {
          ...m,
          segmentIds: by === -1 ? [...m.segmentIds, key] : [key, ...m.segmentIds],
        };
      }
      return m;
    });
    withModules(li, next.filter((m) => m.segmentIds.length > 0));
  };

  /**
   * C07d's "Start a new section after this segment": everything after it
   * moves to a new, untitled section directly below. Offered on every segment
   * but the last, where it would split off nothing.
   */
  const splitSectionAfter = (li: number, mi: number, pi: number) => {
    const mods = draft[li].modules;
    const moved = mods[mi].segmentIds.slice(pi + 1);
    if (moved.length === 0) return;
    const next = mods.map((m) => ({ ...m, segmentIds: [...m.segmentIds] }));
    next[mi].segmentIds = next[mi].segmentIds.slice(0, pi + 1);
    next.splice(mi + 1, 0, {
      title: "",
      sequenceOrder: mi + 2,
      segmentIds: moved,
      recap: null,
      preview: null,
    });
    withModules(li, next);
  };

  /** Renumber before sending: `sequenceOrder` is the order, not a label. */
  const normalised = (): UploadStructure => {
    const lessons = draft.map((l, i) => ({
      ...l,
      sequenceOrder: i + 1,
      modules: l.modules.map((m, j) => ({ ...m, sequenceOrder: j + 1 })),
    }));
    return {
      ...structure,
      lessons,
      // The legacy mirror is the first lesson; keeping it coherent means a
      // reader of either shape sees the same unit.
      lessonId: lessons[0]?.lessonId ?? structure.lessonId,
      modules: lessons[0]?.modules ?? [],
    };
  };

  /** Resolves true once the server holds what is on screen. */
  const save = async (): Promise<boolean> => {
    if (saving === "saving") return false;
    setSaving("saving");
    setError("");
    try {
      const res = await uploadsApi.updateStructure(uploadId, normalised());
      setDraft(lessonsOf(res.structure));
      setCanUndo(Boolean(res.canUndo));
      setDirty(false);
      setSaving("saved");
      return true;
    } catch {
      setSaving("failed");
      setError(
        "We couldn’t save that just now. Your changes are still here. Try again in a moment.",
      );
      return false;
    }
  };

  /** Save what is on screen first, then ask: confirm acts on what is stored. */
  const addToLibrary = async () => {
    if (phase === "committing" || saving === "saving") return;
    if (dirty && !(await save())) return;
    setPhase("confirm");
  };

  const undo = async () => {
    try {
      const res = await uploadsApi.undo(uploadId);
      setDraft(lessonsOf(res.structure));
      setCanUndo(Boolean(res.canUndo));
      setDirty(false);
      setSaving("idle");
    } catch {
      setError("We couldn’t undo that just now.");
    }
  };

  const commit = async () => {
    setPhase("committing");
    setError("");
    try {
      await uploadsApi.confirm(uploadId);
      // C07d draws "Added to your library." and then Done. The shared bar
      // carries it across to the Library, as the assign wizard's does.
      say.show({ kind: "confirm", message: "Added to your library." });
      router.push("/teacher/lessons");
    } catch {
      setPhase("idle");
      setError(
        "We couldn’t add that to your library just now. Nothing has changed. Try again in a moment.",
      );
    }
  };

  const iconBtn =
    "inline-flex size-[26px] shrink-0 cursor-pointer items-center justify-center rounded-lg text-nevo-near-black/45 transition-colors hover:bg-nevo-navy/8 hover:text-nevo-near-black/75 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent";
  const titleInput =
    "min-w-0 flex-1 rounded-[6px] bg-transparent px-1 py-0.5 outline-none focus:bg-nevo-cream focus:ring-2 focus:ring-nevo-navy/30";

  /** C07d's caret: points right when folded, down when open. */
  const caret = (open: boolean) =>
    cn(
      "inline-flex size-[22px] shrink-0 cursor-pointer items-center justify-center rounded-md text-nevo-near-black/55 transition-transform duration-[160ms] ease-out",
      open && "rotate-90",
    );
  const Caret = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );

  const Arrow = ({ up }: { up: boolean }) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={up ? "M12 19V5M6 11l6-6 6 6" : "M12 5v14M18 13l-6 6-6-6"} />
    </svg>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-[22px] xl:px-8 xl:py-7">
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={toggleAll}
            className="inline-flex shrink-0 cursor-pointer items-center gap-[7px] rounded-[10px] border-[1.5px] border-nevo-near-black/18 px-3.5 py-[9px] text-[13px] font-semibold whitespace-nowrap text-nevo-near-black transition-colors hover:bg-nevo-near-black/5"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d={allOpen ? "M7 11l5-5 5 5M7 17l5-5 5 5" : "M7 13l5 5 5-5M7 7l5 5 5-5"} />
            </svg>
            {allOpen ? "Collapse all" : "Expand all"}
          </button>
        </div>
        <div className="mb-3.5 flex items-center gap-3 rounded-[12px] bg-nevo-navy px-[18px] py-[15px]">
          <span className="shrink-0 text-nevo-violet" aria-hidden>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[10.5px] font-bold tracking-[0.14em] text-nevo-violet/80">
              THE BLOCK YOU UPLOADED
            </div>
            <div className="truncate text-[17px] font-semibold text-nevo-cream">
              {blockName}
            </div>
          </div>
          <span className="shrink-0 text-[13px] text-nevo-cream/70">
            {summary}
          </span>
        </div>

        {draft.map((lesson, li) => {
          const lessonOpen = !closed.has(lessonKey(lesson, li));
          return (
          <div
            /* A split lesson has no id until the server mints one, so the
               key falls back to position rather than going undefined. */
            key={lessonKey(lesson, li)}
            className="mb-3 rounded-[12px] bg-nevo-cream-elevated px-[18px] py-4 shadow-elevation-1"
          >
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => toggle(lessonKey(lesson, li))}
                aria-expanded={lessonOpen}
                aria-label={`Lesson ${li + 1} sections`}
                className={caret(lessonOpen)}
              >
                <Caret />
              </button>
              <span className="shrink-0 font-mono text-[10.5px] font-bold tracking-[0.12em] text-nevo-violet">
                {`LESSON ${li + 1}`}
              </span>
              <input
                value={lesson.title}
                onChange={(e) => renameLesson(li, e.target.value)}
                aria-label={`Lesson ${li + 1} title`}
                placeholder="Untitled lesson"
                className={cn(
                  titleInput,
                  "text-[15.5px] font-semibold text-nevo-near-black",
                )}
              />
              <span className="shrink-0 text-[12.5px] text-nevo-near-black/55">
                {plural(lesson.modules.length, "section", "sections")}
              </span>
              <button type="button" onClick={() => moveLesson(li, -1)} disabled={li === 0} aria-label="Move lesson up" title="Move up" className={iconBtn}>
                <Arrow up />
              </button>
              <button type="button" onClick={() => moveLesson(li, 1)} disabled={li === draft.length - 1} aria-label="Move lesson down" title="Move down" className={iconBtn}>
                <Arrow up={false} />
              </button>
              <button type="button" onClick={() => mergeLessonUp(li)} disabled={li === 0} aria-label="Merge into the lesson above" title="Merge into the lesson above" className={iconBtn}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 9h14M5 15h14M9 5l3-3 3 3" />
                </svg>
              </button>
            </div>

            {lessonOpen && (
            <div className="mt-2.5 flex flex-col gap-2">
              {lesson.modules.map((m, mi) => {
                // The third level: every segment, named where the parse
                // named it and numbered where it did not. An older upload
                // with no segment rows keeps its count and opens nothing.
                const named = segments ? namedSegments(m.segmentIds, segments) : [];
                // Numbered across the lesson, as the single path numbers them.
                const before = lesson.modules
                  .slice(0, mi)
                  .reduce((n, x) => n + x.segmentIds.length, 0);
                const moduleOpen = !closed.has(moduleKey(lesson, li, mi));
                return (
                <Fragment key={`${lesson.lessonId ?? "new"}-${li}-${mi}`}>
                <div
                  className="flex items-center gap-2.5 rounded-[10px] bg-nevo-cream-inset px-3.5 py-2.5"
                >
                  {named.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => toggle(moduleKey(lesson, li, mi))}
                      aria-expanded={moduleOpen}
                      aria-label={`Section ${mi + 1} segments`}
                      className={caret(moduleOpen)}
                    >
                      <Caret />
                    </button>
                  ) : (
                    <span className="size-[22px] shrink-0" aria-hidden />
                  )}
                  <span className="shrink-0 font-mono text-[10px] font-bold tracking-[0.1em] text-nevo-near-black/45">
                    {`SECTION ${mi + 1}`}
                  </span>
                  <input
                    value={m.title}
                    onChange={(e) => renameModule(li, mi, e.target.value)}
                    aria-label={`Section ${mi + 1} title`}
                    placeholder="Untitled section"
                    className={cn(titleInput, "text-[14px] text-nevo-near-black")}
                  />
                  {/* Named where the parse named them, counted where it did
                      not - never an invented title. */}
                  <span className="shrink-0 text-[12.5px] text-nevo-near-black/55">
                    {plural(m.segmentIds.length, "segment", "segments")}
                  </span>
                  <button type="button" onClick={() => moveModule(li, mi, -1)} disabled={mi === 0} aria-label="Move section up" title="Move up" className={iconBtn}>
                    <Arrow up />
                  </button>
                  <button type="button" onClick={() => moveModule(li, mi, 1)} disabled={mi === lesson.modules.length - 1} aria-label="Move section down" title="Move down" className={iconBtn}>
                    <Arrow up={false} />
                  </button>
                  <button type="button" onClick={() => moveModuleAcross(li, mi, -1)} disabled={li === 0} aria-label="Move to the lesson above" title="Move to the lesson above" className={iconBtn}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M9 14l-4-4 4-4M5 10h9a5 5 0 0 1 5 5v4" />
                    </svg>
                  </button>
                  <button type="button" onClick={() => moveModuleAcross(li, mi, 1)} disabled={li === draft.length - 1} aria-label="Move to the lesson below" title="Move to the lesson below" className={iconBtn}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M9 10l-4 4 4 4M5 14h9a5 5 0 0 0 5-5V5" />
                    </svg>
                  </button>
                  {/* Split here. Disabled on the first section, where it would
                      leave an empty lesson behind rather than divide one. */}
                  <button type="button" onClick={() => splitLessonAt(li, mi)} disabled={mi === 0} aria-label="Start a new lesson at this section" title="Start a new lesson here" className={iconBtn}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M3 12h18M8 7l-3 5 3 5M16 7l3 5-3 5" />
                    </svg>
                  </button>
                </div>
                {moduleOpen && named.length > 0 && (
                    <ul className="mb-1 ml-9 mt-0.5 flex list-none flex-col gap-[5px] p-0">
                      {named.map((seg, pi) => {
                        const label = seg.title ?? `Segment ${before + pi + 1}`;
                        return (
                        <li
                          key={seg.key}
                          className="flex items-center gap-2 rounded-lg bg-nevo-cream/55 px-[11px] py-2 text-[13px] leading-[1.45] text-nevo-near-black"
                        >
                          <span className="min-w-0 flex-1 truncate">{label}</span>
                          {seg.minutes > 0 && (
                            <span className="shrink-0 text-[11px] text-nevo-near-black/42">
                              {seg.minutes} min
                            </span>
                          )}
                          {seg.needsReview && (
                            <span className="shrink-0 rounded-full bg-nevo-violet/16 px-1.5 py-0.5 text-[11px] text-nevo-near-black/70">
                              needs a look
                            </span>
                          )}
                          <button type="button" onClick={() => moveSegment(li, mi, pi, -1)} disabled={pi === 0} aria-label={`Move ${label} up`} title="Move up" className={iconBtn}>
                            <Arrow up />
                          </button>
                          <button type="button" onClick={() => moveSegment(li, mi, pi, 1)} disabled={pi === named.length - 1} aria-label={`Move ${label} down`} title="Move down" className={iconBtn}>
                            <Arrow up={false} />
                          </button>
                          <button type="button" onClick={() => moveSegmentAcross(li, mi, pi, -1)} disabled={mi === 0} aria-label={`Move ${label} to the section above`} title="Move to the section above" className={iconBtn}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M9 14l-4-4 4-4M5 10h9a5 5 0 0 1 5 5v4" />
                            </svg>
                          </button>
                          <button type="button" onClick={() => moveSegmentAcross(li, mi, pi, 1)} disabled={mi === lesson.modules.length - 1} aria-label={`Move ${label} to the section below`} title="Move to the section below" className={iconBtn}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M9 10l-4 4 4 4M5 14h9a5 5 0 0 0 5-5V5" />
                            </svg>
                          </button>
                          {/* C07d's own control and title. Not on the last
                              segment, where it would split off nothing. */}
                          {pi < named.length - 1 && (
                            <button
                              type="button"
                              onClick={() => splitSectionAfter(li, mi, pi)}
                              aria-label={`Start a new section after ${label}`}
                              title="Start a new section after this segment"
                              className="inline-flex size-[26px] shrink-0 cursor-pointer items-center justify-center rounded-[7px] border-[1.5px] border-nevo-navy/30 text-nevo-navy transition-colors hover:bg-nevo-navy/6"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <path d="M8 3v18M3 8h10M3 16h10M21 8l-3 4 3 4" />
                              </svg>
                            </button>
                          )}
                        </li>
                        );
                      })}
                    </ul>
                )}
                </Fragment>
                );
              })}
              {lesson.modules.length === 0 && (
                <p className="text-[13px] text-nevo-near-black/55">
                  Nevo didn&rsquo;t split this lesson into sections.
                </p>
              )}
            </div>
            )}
          </div>
          );
        })}

        {error && (
          <p className="mt-3 max-w-[600px] rounded-[10px] bg-nevo-violet/14 px-[15px] py-3 text-[13px] leading-[1.5] text-nevo-near-black/78">
            {error}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3 border-t border-nevo-near-black/10 bg-nevo-cream px-6 py-3 xl:px-8 xl:py-3.5">
        <button
          type="button"
          onClick={() => void save()}
          disabled={!dirty || saving === "saving"}
          className={cn(
            "inline-flex h-[42px] items-center rounded-[10px] border-[1.5px] px-4 text-[13.5px] font-semibold transition-colors",
            dirty && saving !== "saving"
              ? "cursor-pointer border-nevo-navy/35 text-nevo-navy hover:bg-nevo-navy/6"
              : "cursor-not-allowed border-nevo-near-black/12 text-nevo-near-black/35",
          )}
        >
          {saving === "saving"
            ? "Saving…"
            : saving === "failed"
              ? "Try again"
              : saving === "saved" && !dirty
                ? "Saved"
                : "Save changes"}
        </button>

        {canUndo && !dirty && (
          <button
            type="button"
            onClick={() => void undo()}
            className="inline-flex h-[42px] cursor-pointer items-center rounded-[10px] px-3 text-[13.5px] font-semibold text-nevo-navy transition-colors hover:bg-nevo-navy/6"
          >
            Undo
          </button>
        )}

        <span className="min-w-0 flex-1 truncate text-[12.5px] text-nevo-near-black/60">
          {dirty ? "Unsaved changes" : summary}
        </span>

        <button
          type="button"
          onClick={() => void addToLibrary()}
          disabled={phase === "committing" || saving === "saving"}
          className={cn(
            "flex h-[46px] items-center rounded-[10px] px-[26px] text-[15px] font-semibold",
            phase === "committing" || saving === "saving"
              ? "cursor-not-allowed bg-nevo-navy/18 text-nevo-near-black/40"
              : "cursor-pointer bg-nevo-navy text-nevo-cream transition-[filter] hover:brightness-93",
          )}
        >
          {phase === "committing"
            ? "Adding…"
            : "Looks right - add to my library"}
        </button>
      </div>

      {phase === "confirm" && (
        <div className="absolute inset-0 z-5 flex items-end justify-center bg-nevo-near-black/32 p-6">
          <div className="w-full max-w-[520px] rounded-[16px] bg-nevo-cream px-[26px] py-6 shadow-[0_20px_56px_rgba(0,0,0,0.24)] motion-safe:animate-nevo-rise">
            <span className="font-mono text-[10.5px] font-bold tracking-[0.14em] text-nevo-violet">
              ADD TO LIBRARY
            </span>
            <p className="mt-2.5 text-base leading-[1.55] font-medium text-nevo-near-black">
              {`This will add ${summary.replace(/ · /g, ", ")} to your library.`}
            </p>
            <p className="mt-2 text-[13px] leading-[1.5] text-nevo-near-black/60">
              You can still edit any lesson later.
            </p>
            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => void commit()}
                className="flex h-[46px] cursor-pointer items-center rounded-[10px] bg-nevo-navy px-5 text-[15px] font-semibold text-nevo-cream transition-[filter] hover:brightness-93"
              >
                Yes, add them
              </button>
              <button
                type="button"
                onClick={() => setPhase("idle")}
                className="flex h-[46px] cursor-pointer items-center rounded-[10px] border-[1.5px] border-nevo-near-black/18 px-5 text-[15px] font-semibold text-nevo-near-black transition-colors hover:bg-nevo-near-black/5"
              >
                Let me review first
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
