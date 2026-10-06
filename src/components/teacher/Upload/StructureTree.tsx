"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * C07d Structure Preview (SCRUM-102.2 / 102.5): the parsed block as an
 * expandable three-level tree the teacher steers at every level. Drag is real
 * at all three sibling levels (lessons within the block, sections within a
 * lesson, segments within a section - the violet line shows where a drop
 * lands); Split starts a new lesson or section at a boundary; Merge folds a
 * node into the one before it; every title is editable; Remove keeps the
 * content for 7 days with an undo. A worth-a-glance dot marks a boundary
 * we're less sure of - tap it for the plain reason, never a number. Accept
 * all opens the calm 102.5 confirmation. A full page with a pinned commit
 * bar, never a modal.
 *
 * Frame defect fixed in passing: the frame's focus style on the navy block
 * title (cream background + cream text) made the title invisible - focus
 * here keeps the text readable. Flagged to design.
 *
 * THIS PAGE IS A SAMPLE, and it now says so at every point a teacher could
 * mistake it for their own work - the banner, and the confirmation.
 *
 * The staged upload contract landed on 31 Aug and most of it is real:
 * `POST /api/v1/uploads` stages a file, `GET /api/v1/uploads/{id}` returns a
 * TYPED structure, `PUT /api/v1/uploads/{id}/structure` saves an edit,
 * `POST .../confirm` commits and `POST .../undo` reverses. So the endpoints
 * this page needs exist.
 *
 * THIS COMPONENT IS THE SIGNED-OUT DEMO ONLY. `structure.lessons[]` shipped
 * on 1 Sep, so a unit becoming several lessons can be expressed - and a real
 * staged upload is rendered and steered by `LiveStructureTree`, which posts
 * to `PUT /uploads/{id}/structure` and commits through `.../confirm`.
 *
 * What remains here is the frame's canonical P5 Science block, kept because
 * the designed screen still needs somewhere to live. Nothing here writes, and
 * nothing here claims to: the fabricated "Adding to your library" beat and
 * its "Added to your library" success are gone, and Save draft - which
 * persisted nothing - is not drawn at all.
 */

type Seg = { id: number; title: string; mins: string };
type Section = {
  id: number;
  title: string;
  open: boolean;
  uncertain?: boolean;
  revealText?: string;
  segments: Seg[];
};
type Lesson = {
  id: number;
  title: string;
  open: boolean;
  uncertain?: boolean;
  revealText?: string;
  modules: Section[];
};
type Undo =
  | { kind: "lesson"; index: number; item: Lesson; label: string }
  | { kind: "module"; lessonId: number; index: number; item: Section; label: string };
type Drag = { kind: "lesson" | "module" | "segment"; id: number; lessonId?: number; moduleId?: number };

let sid = 200;
const seg = (title: string, mins: string): Seg => ({ id: ++sid, title, mins });

const FRESH: { blockTitle: string; lessons: Lesson[] } = {
  blockTitle: "P5 Science - Term 2, Chapter 3",
  lessons: [
    {
      id: 1, title: "Photosynthesis", open: true,
      modules: [
        { id: 11, title: "Introduction", open: false, segments: [seg("What plants need", "3 min"), seg("Inside a leaf", "4 min"), seg("Light, water and air", "3 min")] },
        { id: 12, title: "Practice", open: false, segments: [seg("The leaf-and-water test", "5 min"), seg("What to expect", "4 min"), seg("Recording results", "3 min")] },
        { id: 13, title: "Wrap-up", open: false, uncertain: true, revealText: "This boundary might be off. This section is short and could be part of the section before it.", segments: [seg("Pulling it together", "3 min"), seg("Quick check", "2 min")] },
      ],
    },
    {
      id: 2, title: "Plant transport", open: false,
      modules: [
        { id: 14, title: "Roots and water", open: false, segments: [seg("How roots take up water", "4 min"), seg("Root hair cells", "3 min"), seg("Water moving in", "3 min")] },
        { id: 15, title: "Xylem and phloem", open: false, segments: [seg("Two transport tubes", "3 min"), seg("Xylem: water up", "4 min"), seg("Phloem: food around", "4 min")] },
      ],
    },
    {
      id: 3, title: "Leaves and gas exchange", open: false, uncertain: true,
      revealText: "This boundary might be off. The section that follows is short and could be part of the previous lesson.",
      modules: [
        { id: 16, title: "Stomata", open: false, segments: [seg("What stomata are", "3 min"), seg("Opening and closing", "4 min"), seg("Guard cells", "3 min"), seg("Why size matters", "3 min")] },
        { id: 17, title: "Gas exchange", open: false, segments: [seg("Gases in and out", "4 min"), seg("Day and night", "3 min"), seg("Recap of exchange", "2 min")] },
      ],
    },
  ],
};

const ghostBtn =
  "inline-flex shrink-0 cursor-pointer items-center gap-[7px] rounded-[10px] border-[1.5px] border-nevo-near-black/18 px-3.5 py-[9px] text-[13px] font-semibold whitespace-nowrap text-nevo-near-black transition-colors hover:bg-nevo-near-black/5";
const primaryBtn =
  "inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-[10px] bg-nevo-navy px-[18px] py-[11px] text-[13.5px] font-semibold whitespace-nowrap text-nevo-cream transition-[filter] hover:brightness-93";
const iconBtn =
  "inline-flex size-[30px] cursor-pointer items-center justify-center rounded-lg bg-nevo-navy/8 text-nevo-navy transition-colors hover:bg-nevo-navy/14";
const treeInput =
  "min-w-0 flex-1 rounded-lg border-[1.5px] border-transparent bg-transparent text-nevo-near-black outline-none transition-colors hover:bg-nevo-cream/50 focus:border-nevo-navy focus:bg-nevo-cream";
const dotBtn =
  "size-3.5 shrink-0 cursor-pointer rounded-full bg-nevo-violet shadow-[0_0_0_4px_rgba(154,156,203,0.22)]";

const GripIcon = ({ className }: { className: string }) => (
  <span className={cn("shrink-0 cursor-grab", className)} aria-hidden>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
    </svg>
  </span>
);

const Caret = ({ open, onClick }: { open: boolean; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={open ? "Collapse" : "Expand"}
    className={cn(
      "flex size-[22px] shrink-0 cursor-pointer items-center justify-center rounded-[6px] text-nevo-near-black/55 transition-transform duration-[160ms] ease-out",
      open && "rotate-90",
    )}
  >
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 6l6 6-6 6" />
    </svg>
  </button>
);

const MergeGlyph = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M7 4l5 5 5-5M12 9v11" />
  </svg>
);
const TrashGlyph = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
  </svg>
);
const SplitGlyph = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M8 3v18M3 8h10M3 16h10M21 8l-3 4 3 4" />
  </svg>
);

export function StructureTree() {
  const [blockTitle, setBlockTitle] = useState(FRESH.blockTitle);
  const [lessons, setLessons] = useState<Lesson[]>(FRESH.lessons);
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [undo, setUndo] = useState<Undo | null>(null);
  const [phase, setPhase] = useState<"edit" | "confirm">("edit");
  const [allOpen, setAllOpen] = useState(false);
  const [over, setOver] = useState<string | null>(null);
  // The drag payload lives in a ref for the drop handlers; `dragging` mirrors
  // it as state purely for the frame's half-opacity on the lifted card.
  const [dragging, setDragging] = useState<Drag | null>(null);
  const drag = useRef<Drag | null>(null);
  const startDrag = (d: Drag) => {
    drag.current = d;
    setDragging(d);
  };
  const nextId = useRef(1000);

  const clone = () =>
    lessons.map((L) => ({ ...L, modules: L.modules.map((M) => ({ ...M, segments: [...M.segments] })) }));

  const counts = (() => {
    let modules = 0;
    let segments = 0;
    lessons.forEach((L) => {
      modules += L.modules.length;
      L.modules.forEach((M) => (segments += M.segments.length));
    });
    return { lessons: lessons.length, modules, segments };
  })();
  const summaryLine = `${counts.lessons} lessons · ${counts.modules} sections · ${counts.segments} segments`;

  const reorder = <T extends { id: number }>(arr: T[], fromId: number, toId: number) => {
    const a = [...arr];
    const fi = a.findIndex((x) => x.id === fromId);
    if (fi < 0) return arr;
    const [it] = a.splice(fi, 1);
    const ti = a.findIndex((x) => x.id === toId);
    if (ti < 0) return arr;
    a.splice(ti, 0, it);
    return a;
  };

  const clearDrag = () => {
    drag.current = null;
    setDragging(null);
    setOver(null);
  };

  const dropOn = (kind: Drag["kind"], id: number, lessonId?: number, moduleId?: number) => {
    const d = drag.current;
    setOver(null);
    setDragging(null);
    drag.current = null;
    if (!d || d.kind !== kind) return;
    // Drag reorders siblings: same block for lessons, same lesson for
    // sections, same section for segments (per the frame's constraint).
    if (kind === "lesson") {
      setLessons((ls) => reorder(ls, d.id, id));
    } else if (kind === "module") {
      if (d.lessonId !== lessonId) return;
      const s = clone();
      const L = s.find((x) => x.id === lessonId);
      if (L) L.modules = reorder(L.modules, d.id, id);
      setLessons(s);
    } else {
      if (d.lessonId !== lessonId || d.moduleId !== moduleId) return;
      const s = clone();
      const L = s.find((x) => x.id === lessonId);
      const M = L?.modules.find((x) => x.id === moduleId);
      if (M) M.segments = reorder(M.segments, d.id, id);
      setLessons(s);
    }
  };

  const toggleAll = () => {
    const next = !allOpen;
    setAllOpen(next);
    setLessons((ls) =>
      ls.map((L) => ({ ...L, open: next, modules: L.modules.map((M) => ({ ...M, open: next })) })),
    );
  };

  const mergeLesson = (id: number) => {
    const s = clone();
    const i = s.findIndex((x) => x.id === id);
    if (i < 1) return;
    s[i - 1].modules = [...s[i - 1].modules, ...s[i].modules];
    s.splice(i, 1);
    setLessons(s);
  };

  const mergeModule = (lid: number, mid: number) => {
    const s = clone();
    const L = s.find((x) => x.id === lid);
    if (!L) return;
    const i = L.modules.findIndex((x) => x.id === mid);
    if (i < 1) return;
    L.modules[i - 1].segments = [...L.modules[i - 1].segments, ...L.modules[i].segments];
    L.modules.splice(i, 1);
    setLessons(s);
  };

  const removeLesson = (id: number) => {
    const s = clone();
    const i = s.findIndex((x) => x.id === id);
    if (i < 0) return;
    setUndo({ kind: "lesson", index: i, item: s[i], label: s[i].title || `Lesson ${i + 1}` });
    s.splice(i, 1);
    setLessons(s);
  };

  const removeModule = (lid: number, mid: number) => {
    const s = clone();
    const L = s.find((x) => x.id === lid);
    if (!L) return;
    const i = L.modules.findIndex((x) => x.id === mid);
    if (i < 0) return;
    setUndo({ kind: "module", lessonId: lid, index: i, item: L.modules[i], label: L.modules[i].title || `Section ${i + 1}` });
    L.modules.splice(i, 1);
    setLessons(s);
  };

  const doUndo = () => {
    if (!undo) return;
    const s = clone();
    if (undo.kind === "lesson") s.splice(undo.index, 0, undo.item);
    else {
      const L = s.find((x) => x.id === undo.lessonId);
      if (L) L.modules.splice(undo.index, 0, undo.item);
    }
    setUndo(null);
    setLessons(s);
  };

  const splitModuleAfterSeg = (lid: number, mid: number, segId: number) => {
    const s = clone();
    const L = s.find((x) => x.id === lid);
    if (!L) return;
    const mi = L.modules.findIndex((x) => x.id === mid);
    const M = L.modules[mi];
    const si = M.segments.findIndex((x) => x.id === segId);
    const moved = M.segments.slice(si + 1);
    if (!moved.length) return;
    M.segments = M.segments.slice(0, si + 1);
    L.modules.splice(mi + 1, 0, { id: nextId.current++, title: "", open: true, segments: moved });
    setLessons(s);
  };

  const splitLessonAfterModule = (lid: number, mid: number) => {
    const s = clone();
    const li = s.findIndex((x) => x.id === lid);
    const L = s[li];
    const mi = L.modules.findIndex((x) => x.id === mid);
    const moved = L.modules.slice(mi + 1);
    if (!moved.length) return;
    L.modules = L.modules.slice(0, mi + 1);
    s.splice(li + 1, 0, { id: nextId.current++, title: "", open: true, modules: moved });
    setLessons(s);
  };

  const setTitleOf = (fn: (s: Lesson[]) => void) => {
    const s = clone();
    fn(s);
    setLessons(s);
  };

  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      {/* Page header */}
      <div className="shrink-0 border-b border-nevo-near-black/9 px-6 pt-4 pb-3.5 xl:px-8 xl:pt-5 xl:pb-[18px]">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1 basis-[300px]">
            <h2 className="text-[21px] font-semibold tracking-[-0.014em] text-nevo-near-black xl:text-2xl">
              Here&rsquo;s how we&rsquo;ve broken it up
            </h2>
            <p className="mt-1.5 max-w-[600px] text-sm leading-[1.55] text-nevo-near-black/62">
              Adjust anything at any level - drag to reorder, split, merge, or
              rename. Or accept it all and move on.
            </p>
          </div>
          <button type="button" onClick={toggleAll} className={ghostBtn}>
            {allOpen ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M7 11l5-5 5 5M7 17l5-5 5 5" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M7 13l5 5 5-5M7 7l5 5 5-5" />
              </svg>
            )}
            {allOpen ? "Collapse all" : "Expand all"}
          </button>
        </div>
      </div>

      {/* Tree */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-[18px] xl:px-8 xl:py-[22px]">
        {undo && (
          <div className="mb-3.5 flex items-center gap-3 rounded-[10px] bg-nevo-violet/16 px-[15px] py-[11px]">
            <span className="shrink-0 text-nevo-navy" aria-hidden>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 14L4 9l5-5" />
                <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
              </svg>
            </span>
            <span className="min-w-0 flex-1 text-[13px] leading-[1.5] text-nevo-near-black/78">
              {`Removed '${undo.label}'. We've kept it for 7 days.`}
            </span>
            <button
              type="button"
              onClick={doUndo}
              className="shrink-0 cursor-pointer text-[13px] font-bold text-nevo-navy underline underline-offset-[3px]"
            >
              Undo
            </button>
          </div>
        )}

        {/* Every tree on this page is the canonical fixture: `/api/content/parse`
            returns one lesson and a flat segment list, so nothing it sends back
            can fill a three-level block. Said plainly, because the card below
            is headed "THE BLOCK YOU UPLOADED". */}
        <div className="mb-3.5 flex items-start gap-3 rounded-[10px] bg-nevo-violet/16 px-[15px] py-[11px]">
          <span className="mt-px shrink-0 text-nevo-navy" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5M12 7.5v.5" />
            </svg>
          </span>
          <span className="min-w-0 flex-1 text-[13px] leading-[1.5] text-nevo-near-black/78">
            This is a sample structure, not your upload. We can&rsquo;t break a
            unit into separate lessons yet - you can still try the controls.
          </span>
        </div>

        {/* L1: the block */}
        <div className="mb-3.5 flex items-center gap-3 rounded-[12px] bg-nevo-navy px-[18px] py-[15px]">
          <span className="shrink-0 text-nevo-violet" aria-hidden>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z" />
              <path d="M20 5v14a2 2 0 0 0-2-2" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[10px] tracking-[0.14em] text-nevo-violet">
              THE BLOCK YOU UPLOADED
            </div>
            <input
              value={blockTitle}
              onChange={(e) => setBlockTitle(e.target.value)}
              className="mt-0.5 w-full rounded-lg border-[1.5px] border-transparent bg-transparent px-2 py-[5px] text-base font-semibold text-nevo-cream outline-none transition-colors hover:bg-nevo-cream/10 focus:border-nevo-violet focus:bg-nevo-navy"
            />
          </div>
          <span className="shrink-0 text-xs whitespace-nowrap text-nevo-cream/60">
            {summaryLine}
          </span>
        </div>

        {/* L2: lessons */}
        <div className="flex flex-col gap-[9px]">
          {lessons.map((les, li) => {
            const segTotal = les.modules.reduce((a, m) => a + m.segments.length, 0);
            return (
              <div
                key={les.id}
                draggable
                onDragStart={() => startDrag({ kind: "lesson", id: les.id })}
                onDragOver={(e) => e.preventDefault()}
                onDragEnter={() => drag.current?.kind === "lesson" && setOver(`L:${les.id}`)}
                onDrop={(e) => {
                  e.preventDefault();
                  dropOn("lesson", les.id);
                }}
                onDragEnd={clearDrag}
              >
                {over === `L:${les.id}` && (
                  <div className="mx-1 mb-[7px] h-[3px] rounded-full bg-nevo-violet" />
                )}
                <div
                  className={cn(
                    "rounded-[12px] bg-nevo-cream-elevated shadow-[0_2px_10px_rgba(0,0,0,0.05)]",
                    dragging?.kind === "lesson" && dragging.id === les.id && "opacity-50",
                  )}
                >
                  <div className="flex items-center gap-2.5 px-[15px] py-[13px]">
                    <GripIcon className="text-nevo-near-black/32" />
                    <Caret
                      open={les.open}
                      onClick={() =>
                        setTitleOf((s) => {
                          const L = s.find((x) => x.id === les.id);
                          if (L) L.open = !L.open;
                        })
                      }
                    />
                    <span className="shrink-0 font-mono text-[10px] font-bold tracking-[0.1em] text-nevo-violet">
                      LESSON {li + 1}
                    </span>
                    <input
                      value={les.title}
                      placeholder={`Lesson ${li + 1}`}
                      onChange={(e) =>
                        setTitleOf((s) => {
                          const L = s.find((x) => x.id === les.id);
                          if (L) L.title = e.target.value;
                        })
                      }
                      className={cn(treeInput, "px-[9px] py-1.5 text-[15px] font-semibold")}
                    />
                    {les.uncertain && (
                      <button
                        type="button"
                        title="Worth a glance"
                        aria-label="Worth a glance"
                        onClick={() => setReveal((r) => ({ ...r, [`L${les.id}`]: !r[`L${les.id}`] }))}
                        className={dotBtn}
                      />
                    )}
                    <span className="shrink-0 text-[11.5px] whitespace-nowrap text-nevo-near-black/50">
                      {`${les.modules.length} sections · ${segTotal} segments`}
                    </span>
                    <div className="flex shrink-0 items-center gap-[5px]">
                      {li > 0 && (
                        <button type="button" title="Merge into lesson above" onClick={() => mergeLesson(les.id)} className={iconBtn}>
                          {MergeGlyph}
                        </button>
                      )}
                      <button type="button" title="Remove lesson" onClick={() => removeLesson(les.id)} className={iconBtn}>
                        {TrashGlyph}
                      </button>
                    </div>
                  </div>

                  {les.uncertain && reveal[`L${les.id}`] && (
                    <div className="mx-[15px] mb-3 ml-[46px] rounded-[9px] border-l-[3px] border-nevo-violet bg-nevo-violet/16 px-3.5 py-[11px] text-[13px] leading-[1.5] text-nevo-near-black/78">
                      {les.revealText}
                    </div>
                  )}

                  {/* L3: sections */}
                  {les.open && (
                    <div className="flex flex-col gap-2 pr-3.5 pb-[13px] pl-10">
                      {les.modules.map((mod, mi) => (
                        <div
                          key={mod.id}
                          draggable
                          onDragStart={(e) => {
                            e.stopPropagation();
                            startDrag({ kind: "module", id: mod.id, lessonId: les.id });
                          }}
                          onDragOver={(e) => e.preventDefault()}
                          onDragEnter={(e) => {
                            if (drag.current?.kind === "module") {
                              e.stopPropagation();
                              setOver(`M:${mod.id}`);
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            dropOn("module", mod.id, les.id);
                          }}
                          onDragEnd={(e) => {
                            e.stopPropagation();
                            clearDrag();
                          }}
                        >
                          {over === `M:${mod.id}` && (
                            <div className="mx-1 mb-1.5 h-[2.5px] rounded-full bg-nevo-violet" />
                          )}
                          <div
                            className={cn(
                              "rounded-[10px] bg-nevo-cream/60",
                              dragging?.kind === "module" && dragging.id === mod.id && "opacity-50",
                            )}
                          >
                            <div className="flex items-center gap-2.5 px-[13px] py-[11px]">
                              <GripIcon className="text-nevo-near-black/30" />
                              <Caret
                                open={mod.open}
                                onClick={() =>
                                  setTitleOf((s) => {
                                    const M = s
                                      .find((x) => x.id === les.id)
                                      ?.modules.find((x) => x.id === mod.id);
                                    if (M) M.open = !M.open;
                                  })
                                }
                              />
                              <span className="shrink-0 font-mono text-[9.5px] font-bold tracking-[0.09em] text-nevo-navy/70">
                                SECTION {mi + 1}
                              </span>
                              <input
                                value={mod.title}
                                placeholder={`Section ${mi + 1}`}
                                onChange={(e) =>
                                  setTitleOf((s) => {
                                    const M = s
                                      .find((x) => x.id === les.id)
                                      ?.modules.find((x) => x.id === mod.id);
                                    if (M) M.title = e.target.value;
                                  })
                                }
                                className={cn(treeInput, "rounded-[7px] px-2 py-[5px] text-[13.5px] font-semibold")}
                              />
                              {mod.uncertain && (
                                <button
                                  type="button"
                                  title="Worth a glance"
                                  aria-label="Worth a glance"
                                  onClick={() => setReveal((r) => ({ ...r, [`M${mod.id}`]: !r[`M${mod.id}`] }))}
                                  className={dotBtn}
                                />
                              )}
                              <span className="shrink-0 text-[11px] whitespace-nowrap text-nevo-near-black/48">
                                {`${mod.segments.length} ${mod.segments.length === 1 ? "segment" : "segments"}`}
                              </span>
                              <div className="flex shrink-0 items-center gap-[5px]">
                                {mi > 0 && (
                                  <button type="button" title="Merge into section above" onClick={() => mergeModule(les.id, mod.id)} className={iconBtn}>
                                    {MergeGlyph}
                                  </button>
                                )}
                                <button type="button" title="Remove section" onClick={() => removeModule(les.id, mod.id)} className={iconBtn}>
                                  {TrashGlyph}
                                </button>
                              </div>
                            </div>

                            {mod.uncertain && reveal[`M${mod.id}`] && (
                              <div className="mx-[13px] mb-[11px] ml-[42px] rounded-lg border-l-[3px] border-nevo-violet bg-nevo-violet/16 px-[13px] py-2.5 text-[12.5px] leading-[1.5] text-nevo-near-black/78">
                                {mod.revealText}
                              </div>
                            )}

                            {/* L4: segments */}
                            {mod.open && (
                              <div className="flex flex-col gap-[5px] pr-[13px] pb-[11px] pl-10">
                                {mod.segments.map((sg, si) => (
                                  <div
                                    key={sg.id}
                                    draggable
                                    onDragStart={(e) => {
                                      e.stopPropagation();
                                      startDrag({ kind: "segment", id: sg.id, lessonId: les.id, moduleId: mod.id });
                                    }}
                                    onDragOver={(e) => e.preventDefault()}
                                    onDragEnter={(e) => {
                                      if (drag.current?.kind === "segment") {
                                        e.stopPropagation();
                                        setOver(`S:${sg.id}`);
                                      }
                                    }}
                                    onDrop={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      dropOn("segment", sg.id, les.id, mod.id);
                                    }}
                                    onDragEnd={(e) => {
                                      e.stopPropagation();
                                      clearDrag();
                                    }}
                                  >
                                    {over === `S:${sg.id}` && (
                                      <div className="mx-1 mb-[5px] h-[2px] rounded-full bg-nevo-violet" />
                                    )}
                                    <div className="flex items-center gap-[9px] rounded-lg bg-nevo-cream/55 px-[11px] py-2">
                                      <GripIcon className="text-nevo-near-black/28" />
                                      <input
                                        value={sg.title}
                                        onChange={(e) =>
                                          setTitleOf((s) => {
                                            const S = s
                                              .find((x) => x.id === les.id)
                                              ?.modules.find((x) => x.id === mod.id)
                                              ?.segments.find((x) => x.id === sg.id);
                                            if (S) S.title = e.target.value;
                                          })
                                        }
                                        className={cn(treeInput, "rounded-[6px] px-[7px] py-1 text-[13px] font-normal")}
                                      />
                                      <span className="shrink-0 text-[11px] whitespace-nowrap text-nevo-near-black/42">
                                        {sg.mins}
                                      </span>
                                      {si < mod.segments.length - 1 && (
                                        <button
                                          type="button"
                                          title="Start a new section after this segment"
                                          onClick={() => splitModuleAfterSeg(les.id, mod.id, sg.id)}
                                          className="inline-flex size-[26px] shrink-0 cursor-pointer items-center justify-center rounded-[7px] border-[1.5px] border-nevo-navy/30 text-nevo-navy transition-colors hover:bg-nevo-navy/6"
                                        >
                                          {SplitGlyph}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {mi < les.modules.length - 1 && (
                              <div className="pr-[13px] pb-[11px] pl-[42px]">
                                <button
                                  type="button"
                                  onClick={() => splitLessonAfterModule(les.id, mod.id)}
                                  className="inline-flex cursor-pointer items-center gap-[7px] rounded-[9px] border-[1.5px] border-dashed border-nevo-navy/35 px-3 py-[7px] text-xs font-semibold text-nevo-navy transition-colors hover:bg-nevo-navy/6"
                                >
                                  {SplitGlyph}
                                  Start a new lesson after this section
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pinned commit bar */}
      <div className="flex shrink-0 items-center gap-3.5 border-t border-nevo-near-black/10 bg-nevo-cream px-6 py-3 xl:px-8 xl:py-3.5">
        {/* The frame draws "Save draft" here. It is not drawn while this is a
            sample: it persisted nothing, and a button that reports "Draft
            saved" over a draft that was never sent is the same fabrication as
            the commit below. It returns with the real staged upload. */}
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-nevo-near-black/60">
          {summaryLine}
        </span>
        <button type="button" onClick={() => setPhase("confirm")} className={ghostBtn}>
          Accept all and continue
        </button>
        <button type="button" onClick={() => setPhase("confirm")} className={primaryBtn}>
          Looks right - add to my library
        </button>
      </div>

      {/* 102.5 confirmation - a sheet over the page, never a modal route */}
      {phase !== "edit" && (
        <div className="absolute inset-0 z-5 flex items-end justify-center bg-nevo-near-black/32 p-6">
          <div className="w-full max-w-[520px] rounded-[16px] bg-nevo-cream px-[26px] py-6 shadow-[0_20px_56px_rgba(0,0,0,0.24)] motion-safe:animate-nevo-rise">
            {phase === "confirm" && (
              <div>
                <span className="font-mono text-[10.5px] font-bold tracking-[0.14em] text-nevo-violet">
                  NOTHING WILL BE SAVED
                </span>
                <p className="mt-2.5 text-base leading-[1.55] font-medium text-nevo-near-black">
                  This is a sample structure, so there is nothing to add to
                  your library yet.
                </p>
                <p className="mt-2 text-[13px] leading-[1.5] text-nevo-near-black/60">
                  {`On your own upload this step would add ${counts.lessons} lessons, ${counts.modules} sections and ${counts.segments} segments.`}
                </p>
                <div className="mt-5 flex items-center gap-3">
                  <button type="button" onClick={() => setPhase("edit")} className={primaryBtn}>
                    Back to editing
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
