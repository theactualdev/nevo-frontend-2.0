"use client";

import { useState, type ReactNode } from "react";
import {
  lessonsOf,
  namedSegments,
  uploadsApi,
  type StructureLesson,
  type StructureModule,
  type UploadSegment,
  type UploadStructure,
} from "@/lib/api/uploads";
import { cn } from "@/lib/utils";

/**
 * The SCRUM-101 module review (`Nevo Upload Module Step`) for a REAL upload.
 *
 * WHAT WAS WRONG. C07g makes this step 3 of the single-lesson path - "Review
 * the sections. Segment and module review. No lesson-level pass." A signed-in
 * teacher never reached it. `SectionReview` beside this file draws the frame
 * faithfully over a hardcoded Photosynthesis six and is reachable only with no
 * token, so the designed step existed for visitors and not for teachers: on
 * live there was no split, no merge, no rename, no re-order and no "keep it as
 * one flow".
 *
 * WHY IT COULD NOT BE WIRED WHERE IT STOOD, and this is the part worth
 * knowing. `PUT /api/v1/uploads/{id}/structure` is the ONLY endpoint in the
 * contract that writes module boundaries - nothing amends the modules on a
 * lesson that already exists, and `LessonDetailResponse.modules` is read-only.
 * The single-lesson path used `POST /api/content/upload`, whose receipt
 * (`ParseAcceptedResponse`) carries `lessonId` and `parseRunId` and no upload
 * id at all. So there was no upload to ask about and nothing to write to.
 *
 * `POST /api/v1/uploads` takes `scope`, its pattern is `^(lesson|unit|term)$`
 * and its DEFAULT is `lesson`. The staged pipeline was built with a single
 * lesson as its base case; the single path simply was not using it. It does
 * now, and this screen is what that buys.
 *
 * NO SAVE BUTTON, and that is deliberate. The block path beside this one
 * refuses to commit while there are unsaved edits, because confirm acts on
 * the STORED structure - which means a teacher there can press a disabled
 * button and be told to press a different one first. The frame draws no save
 * at all: it draws Back, a note, Reset structure, and "Looks right, continue".
 * So continue saves and then confirms, in that order, and says so if the save
 * is what failed. Reset restores what Nevo proposed, which is the frame's own
 * remedy for having gone too far.
 *
 * BUTTONS, NOT DRAG HANDLES, and this is a divergence from the frame. The
 * frame moves segments with HTML5 drag; HTML5 drag does not fire on touch, so
 * on the tablet a teacher marks a class on, every one of those controls is
 * inert. `LiveStructureTree` made the same call for the same reason. The
 * operations are identical - move within a section, move to the section above
 * or below, split, merge - only the gesture differs.
 *
 * WHETHER NEVO PROPOSED SECTIONS IS THE SERVER'S ANSWER, never a count we do
 * here. The frame flips the default at 6+ segments and says so in its
 * no-suggestion copy. We render the state the structure arrives in: modules
 * present means Nevo proposed them, modules absent means it did not, and the
 * copy claims no reason it has not been told.
 */

type Saving = "idle" | "working" | "failed";

const ghostBtn =
  "inline-flex cursor-pointer items-center gap-[7px] rounded-[10px] border-[1.5px] border-nevo-near-black/18 px-[15px] py-[9px] text-[13.5px] font-semibold text-nevo-near-black transition-colors hover:bg-nevo-near-black/5";
const inputBase =
  "nevo-in box-border rounded-[9px] border-[1.5px] border-nevo-navy/22 bg-nevo-cream/50 text-nevo-near-black outline-none transition-colors focus:border-nevo-navy focus:bg-nevo-cream";
const iconBtn =
  "inline-flex size-[30px] shrink-0 cursor-pointer items-center justify-center rounded-lg text-nevo-near-black/45 transition-colors hover:bg-nevo-navy/8 hover:text-nevo-near-black/75 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent";

const Arrow = ({ up }: { up: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={up ? "M12 19V5M6 11l6-6 6 6" : "M12 5v14M18 13l-6 6-6-6"} />
  </svg>
);

/** A module with nothing left in it is not a module. */
const pruned = (mods: StructureModule[]) =>
  mods.filter((m) => m.segmentIds.length > 0);

export function LiveModuleReview({
  uploadId,
  structure,
  segments,
  banner,
  onBack,
  onConfirmed,
}: {
  uploadId: string;
  structure: UploadStructure;
  /** Named rows for the segment list. Absent on an older upload. */
  segments?: UploadSegment[];
  /**
   * Anything the wizard needs to say above the review - today, the faint
   * pages line and its retry. It arrives built rather than as data because
   * the retry belongs to the staged upload, not to the structure.
   */
  banner?: ReactNode;
  onBack: () => void;
  /** The lesson this upload became, once it is committed. */
  onConfirmed: (lessonId: string) => void;
}) {
  const [lessons, setLessons] = useState<StructureLesson[]>(() =>
    lessonsOf(structure),
  );
  /**
   * What "Keep as one flow" put aside, so "Add sections back" can restore the
   * teacher's own grouping rather than Nevo's proposal.
   *
   * It doubles as the difference between the two module-less states: set means
   * the teacher chose one flow, null means Nevo never proposed sections.
   */
  const [setAside, setSetAside] = useState<StructureModule[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState<Saving>("idle");
  const [error, setError] = useState("");

  const modules = lessons[0]?.modules ?? [];
  const flat = modules.length === 0 && setAside !== null;
  const noSuggestion = modules.length === 0 && setAside === null;

  /** Every edit goes through here, so nothing changes without marking dirty. */
  const setModules = (mods: StructureModule[]) => {
    setLessons((ls) =>
      ls.length === 0
        ? [
            {
              // Nullable in the contract since 23 Sep - a parse still running
              // has produced no lesson. It cannot be null HERE, because this
              // screen renders only once the upload reports ready, and an
              // omitted id would tell confirm to mint a second lesson.
              lessonId: structure.lessonId ?? undefined,
              title: "",
              sequenceOrder: 1,
              modules: mods,
            },
          ]
        : ls.map((l, i) => (i === 0 ? { ...l, modules: mods } : l)),
    );
    setDirty(true);
    setSaving("idle");
    setError("");
  };

  /**
   * Every segment key this lesson holds, in order.
   *
   * Read off the modules while there are any. With none, it is whatever was
   * set aside; and failing that the parse's own order, which is the only
   * source left once a teacher has never grouped anything.
   */
  const orderedKeys = modules.length
    ? modules.flatMap((m) => m.segmentIds)
    : (setAside?.flatMap((m) => m.segmentIds) ??
      [...(segments ?? [])]
        .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
        .map((s) => s.segmentKey));

  const rows = namedSegments(orderedKeys, segments);
  const minutes = rows.reduce((n, r) => n + r.minutes, 0);
  const plural = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`;

  const update = (mi: number, patch: Partial<StructureModule>) =>
    setModules(modules.map((m, i) => (i === mi ? { ...m, ...patch } : m)));

  /**
   * Split after the segment at `pos`: it stays where it is, everything after
   * it moves to a new untitled section inserted directly below.
   */
  const split = (mi: number, pos: number) => {
    const moved = modules[mi].segmentIds.slice(pos + 1);
    if (moved.length === 0) return;
    const next = modules.map((m) => ({ ...m, segmentIds: [...m.segmentIds] }));
    next[mi].segmentIds = next[mi].segmentIds.slice(0, pos + 1);
    next.splice(mi + 1, 0, {
      title: "",
      sequenceOrder: mi + 2,
      segmentIds: moved,
      recap: null,
      preview: null,
    });
    setModules(next);
  };

  /** Fold a section into the one above it, as the frame's Merge does. */
  const merge = (mi: number) => {
    if (mi < 1) return;
    const next = modules.map((m) => ({ ...m, segmentIds: [...m.segmentIds] }));
    next[mi - 1].segmentIds = [
      ...next[mi - 1].segmentIds,
      ...next[mi].segmentIds,
    ];
    // The preview belongs to whatever now comes last, so an emptied section's
    // preview is inherited rather than dropped.
    if (!next[mi - 1].preview) next[mi - 1].preview = next[mi].preview;
    next.splice(mi, 1);
    setModules(next);
  };

  const moveSegment = (mi: number, pos: number, by: -1 | 1) => {
    const to = pos + by;
    const ids = modules[mi].segmentIds;
    if (to < 0 || to >= ids.length) return;
    const nextIds = [...ids];
    [nextIds[pos], nextIds[to]] = [nextIds[to], nextIds[pos]];
    setModules(
      modules.map((m, i) => (i === mi ? { ...m, segmentIds: nextIds } : m)),
    );
  };

  /** Move a segment into the section above or below it. */
  const moveSegmentAcross = (mi: number, pos: number, by: -1 | 1) => {
    const to = mi + by;
    if (to < 0 || to >= modules.length) return;
    const key = modules[mi].segmentIds[pos];
    const next = modules.map((m, i) => {
      if (i === mi) {
        return { ...m, segmentIds: m.segmentIds.filter((_, j) => j !== pos) };
      }
      if (i === to) {
        return {
          ...m,
          segmentIds:
            by === -1 ? [...m.segmentIds, key] : [key, ...m.segmentIds],
        };
      }
      return m;
    });
    setModules(pruned(next));
  };

  const keepAsOneFlow = () => {
    setSetAside(modules);
    setModules([]);
  };

  const addSectionsBack = () => {
    const restored = setAside ?? [];
    setSetAside(null);
    setModules(restored);
  };

  const addModulesMyself = () =>
    setModules([
      {
        title: "",
        sequenceOrder: 1,
        segmentIds: orderedKeys,
        recap: null,
        preview: null,
      },
    ]);

  const reset = () => {
    setLessons(lessonsOf(structure));
    setSetAside(null);
    setDirty(false);
    setSaving("idle");
    setError("");
  };

  /** Renumber before sending: `sequenceOrder` is the order, not a label. */
  const normalised = (): UploadStructure => {
    const next = lessons.map((l, i) => ({
      ...l,
      sequenceOrder: i + 1,
      modules: pruned(l.modules).map((m, j) => ({ ...m, sequenceOrder: j + 1 })),
    }));
    return {
      ...structure,
      lessons: next,
      // Keep the legacy mirror coherent with `lessons`, so a reader of either
      // shape sees the same lesson.
      lessonId: next[0]?.lessonId ?? structure.lessonId,
      modules: next[0]?.modules ?? [],
    };
  };

  /**
   * Save, then commit. Both, because confirm acts on the stored structure -
   * committing without the save would add a lesson shaped differently from
   * the one on screen.
   */
  const continueOn = async () => {
    if (saving === "working") return;
    setSaving("working");
    setError("");
    try {
      if (dirty) {
        await uploadsApi.updateStructure(uploadId, normalised());
        setDirty(false);
      }
    } catch {
      setSaving("failed");
      setError(
        "We couldn’t save how you’ve split this up. Your changes are still here, and nothing has been added to your library. Try again in a moment.",
      );
      return;
    }
    try {
      const res = await uploadsApi.confirm(uploadId);
      onConfirmed(res.lessonId);
    } catch {
      setSaving("failed");
      setError(
        "We couldn’t add this to your library just now. How you’ve split it up is saved, so trying again won’t lose it.",
      );
    }
  };

  // The frame's own two notes for the two module-less states. Keeping the
  // no-suggestion sentence out of here as well: it is already the heading of
  // that state, and saying it twice reads as two different facts.
  const footNote = flat
    ? "Saved as one flow - no boundaries."
    : noSuggestion
      ? "Staying as one flow."
      : `${plural(modules.length, "section", "sections")} ready.`;

  const segmentRow = (r: (typeof rows)[number], n: number) => (
    <>
      <span className="flex size-6 shrink-0 items-center justify-center rounded-[7px] bg-nevo-navy/10 text-xs font-semibold text-nevo-navy">
        {n}
      </span>
      <span className="min-w-0 flex-1 text-sm text-nevo-near-black">
        {/* Named where the parse named it, numbered where it did not - never
            a title invented on this side of the wire. */}
        {r.title ?? `Segment ${n}`}
      </span>
      {r.needsReview && (
        <span className="shrink-0 rounded-full bg-nevo-violet/16 px-2 py-0.5 text-[11px] whitespace-nowrap text-nevo-near-black/70">
          needs a look
        </span>
      )}
      {r.minutes > 0 && (
        <span className="text-xs whitespace-nowrap text-nevo-near-black/50">
          {`${r.minutes} min`}
        </span>
      )}
    </>
  );

  const flatRows = rows.map((r, i) => (
    <div
      key={r.key}
      className="flex items-center gap-3 rounded-[10px] bg-nevo-cream-elevated px-4 py-[13px]"
    >
      {segmentRow(r, i + 1)}
    </div>
  ));

  /** Where a section's first segment falls in the lesson as a whole. */
  const firstIn = (mi: number) =>
    modules.slice(0, mi).reduce((n, m) => n + m.segmentIds.length, 0);

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-[22px] xl:px-8 xl:py-7">
        {banner}

        {flat && (
          <div className="flex max-w-[720px] flex-col gap-2.5">
            <div className="flex items-center gap-3 rounded-[12px] bg-nevo-violet/14 px-4 py-3.5">
              <span className="shrink-0 text-nevo-navy" aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </span>
              <span className="min-w-0 flex-1 text-[13.5px] leading-[1.5] text-nevo-near-black/78">
                {`This lesson will play as one continuous flow, with no section breaks. ${plural(rows.length, "segment", "segments")}.`}
              </span>
              <button type="button" onClick={addSectionsBack} className={ghostBtn}>
                Add sections back
              </button>
            </div>
            {flatRows}
          </div>
        )}

        {noSuggestion && (
          <div className="flex max-w-[720px] flex-col gap-2.5">
            <div className="rounded-[12px] bg-nevo-cream-elevated px-5 py-[18px]">
              <div className="text-[15px] font-semibold text-nevo-near-black">
                {/* The frame says "this lesson is short - 5 segments or fewer".
                    We are not told why Nevo proposed nothing, so we do not say
                    why. */}
                Nevo didn&rsquo;t propose any sections for this lesson.
              </div>
              <p className="mt-1.5 text-[13.5px] leading-[1.55] text-nevo-near-black/66">
                It will play as one continuous flow. You can add sections
                yourself if you&rsquo;d like to give it named parts.
              </p>
              <button
                type="button"
                onClick={addModulesMyself}
                disabled={rows.length === 0}
                className="mt-3.5 inline-flex cursor-pointer items-center gap-[7px] rounded-[10px] bg-nevo-navy px-[15px] py-[9px] text-[13.5px] font-semibold text-nevo-cream transition-[filter] hover:brightness-93 disabled:cursor-default disabled:opacity-45"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add sections myself
              </button>
            </div>
            {flatRows}
          </div>
        )}

        {modules.length > 0 && (
          <div className="flex max-w-[720px] flex-col gap-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[13px] text-nevo-near-black/60">
                {[
                  plural(modules.length, "section", "sections"),
                  plural(rows.length, "segment", "segments"),
                  // Estimated minutes default to 0 in the contract, so a parse
                  // that measured nothing says nothing rather than "0 minutes".
                  ...(minutes > 0 ? [`about ${minutes} minutes`] : []),
                ].join(" · ")}
              </span>
              <div className="flex flex-col items-end gap-1">
                <button type="button" onClick={keepAsOneFlow} className={ghostBtn}>
                  Keep as one flow
                </button>
                <span className="max-w-[280px] text-right text-[11.5px] leading-[1.4] text-nevo-near-black/50">
                  A deliberate opt-out: students will see one continuous lesson,
                  with no section breaks.
                </span>
              </div>
            </div>

            {modules.map((m, mi) => {
              const segs = namedSegments(m.segmentIds, segments);
              return (
                <div
                  key={`${mi}-${m.segmentIds[0] ?? "empty"}`}
                  className="overflow-hidden rounded-[14px] bg-nevo-cream-elevated shadow-[0_2px_10px_rgba(0,0,0,0.05)]"
                >
                  <div className="border-b border-nevo-near-black/8 px-[18px] pt-4 pb-3.5">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[10.5px] font-bold tracking-[0.1em] whitespace-nowrap text-nevo-violet">
                        {`SECTION ${mi + 1}`}
                      </span>
                      <input
                        value={m.title}
                        onChange={(e) => update(mi, { title: e.target.value })}
                        aria-label={`Section ${mi + 1} title`}
                        placeholder={`Section ${mi + 1}`}
                        className={cn(
                          inputBase,
                          "min-w-0 flex-1 px-3 py-[9px] text-[15.5px] font-semibold",
                        )}
                      />
                      <span className="text-xs whitespace-nowrap text-nevo-near-black/50">
                        {plural(segs.length, "segment", "segments")}
                      </span>
                    </div>
                    {segs.length === 1 && (
                      <div className="mt-[11px] flex items-center gap-2.5 rounded-[9px] bg-nevo-violet/14 px-[13px] py-2.5">
                        <span className="shrink-0 text-nevo-navy" aria-hidden>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="9" />
                            <path d="M12 11v5" />
                            <circle cx="12" cy="7.6" r="0.6" fill="currentColor" />
                          </svg>
                        </span>
                        <span className="min-w-0 flex-1 text-[12.5px] leading-[1.45] text-nevo-near-black/72">
                          A section with just one segment usually reads better
                          merged into the next. You can leave it if it&rsquo;s a
                          deliberate wrap-up.
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-[7px] px-3.5 py-2.5">
                    {segs.map((r, pi) => {
                      const counter = firstIn(mi) + pi + 1;
                      return (
                        <div key={r.key}>
                          <div className="flex items-center gap-[11px] rounded-[9px] bg-nevo-cream/55 px-[13px] py-[11px]">
                            {segmentRow(r, counter)}
                            <span className="flex shrink-0 items-center">
                              <button
                                type="button"
                                onClick={() => moveSegment(mi, pi, -1)}
                                disabled={pi === 0}
                                aria-label={`Move ${r.title ?? `segment ${counter}`} up`}
                                title="Move up"
                                className={iconBtn}
                              >
                                <Arrow up />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveSegment(mi, pi, 1)}
                                disabled={pi === segs.length - 1}
                                aria-label={`Move ${r.title ?? `segment ${counter}`} down`}
                                title="Move down"
                                className={iconBtn}
                              >
                                <Arrow up={false} />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveSegmentAcross(mi, pi, -1)}
                                disabled={mi === 0}
                                aria-label={`Move ${r.title ?? `segment ${counter}`} to the section above`}
                                title="Move to the section above"
                                className={iconBtn}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                  <path d="M9 14l-4-4 4-4M5 10h9a5 5 0 0 1 5 5v4" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => moveSegmentAcross(mi, pi, 1)}
                                disabled={mi === modules.length - 1}
                                aria-label={`Move ${r.title ?? `segment ${counter}`} to the section below`}
                                title="Move to the section below"
                                className={iconBtn}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                  <path d="M9 10l-4 4 4 4M5 14h9a5 5 0 0 0 5-5V5" />
                                </svg>
                              </button>
                            </span>
                          </div>
                          {pi < segs.length - 1 && (
                            <div className="flex items-center gap-2 py-[5px] pl-[46px]">
                              <button
                                type="button"
                                onClick={() => split(mi, pi)}
                                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border-[1.5px] border-nevo-navy/35 px-[11px] py-1.5 text-xs font-semibold text-nevo-navy transition-colors hover:bg-nevo-navy/6"
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                  <path d="M8 3v18M3 8h10M3 16h10M21 8l-3 4 3 4" />
                                </svg>
                                Split here
                              </button>
                              <span className="text-[11.5px] text-nevo-near-black/40">
                                start a new section after this segment
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-col gap-2.5 px-[18px] pt-1 pb-4">
                    {(
                      [
                        {
                          key: "recap" as const,
                          label: "What you just did - shown at the boundary",
                        },
                        { key: "preview" as const, label: "What's coming next" },
                      ]
                    ).map((f) => (
                      <div key={f.key}>
                        <label className="mb-[5px] block text-[11px] font-semibold tracking-[0.05em] text-nevo-near-black/48 uppercase">
                          {f.label}
                          <textarea
                            // Nullable in the contract, and an empty box is
                            // how a teacher removes one.
                            value={m[f.key] ?? ""}
                            onChange={(e) =>
                              update(mi, { [f.key]: e.target.value || null })
                            }
                            rows={2}
                            className={cn(
                              inputBase,
                              "mt-[5px] w-full resize-none px-3 py-[9px] text-[13.5px] leading-[1.5] font-normal tracking-normal normal-case",
                            )}
                          />
                        </label>
                      </div>
                    ))}
                  </div>

                  {mi > 0 && (
                    <div className="px-[18px] pb-4">
                      <button
                        type="button"
                        onClick={() => merge(mi)}
                        className="inline-flex cursor-pointer items-center gap-[7px] rounded-[9px] border-[1.5px] border-dashed border-nevo-navy/35 px-[13px] py-2 text-[12.5px] font-semibold text-nevo-navy transition-colors hover:bg-nevo-navy/6"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M7 4l5 5 5-5M12 9v11" />
                        </svg>
                        {`Merge into Section ${mi}`}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {error && (
          <p className="mt-4 max-w-[600px] rounded-[10px] bg-nevo-violet/14 px-[15px] py-3 text-[13px] leading-[1.5] text-nevo-near-black/78">
            {error}
          </p>
        )}
      </div>

      {/* The step's own C07c foot. The wizard suppresses its generic one. */}
      <div className="flex shrink-0 items-center gap-3.5 border-t border-nevo-near-black/10 px-6 py-3.5 xl:px-8 xl:py-4">
        <button type="button" onClick={onBack} className={ghostBtn}>
          Back
        </button>
        <span className="flex-1 text-[12.5px] text-nevo-near-black/55">
          {footNote}
        </span>
        <button
          type="button"
          onClick={reset}
          disabled={!dirty}
          className="cursor-pointer text-[12.5px] whitespace-nowrap text-nevo-violet underline underline-offset-[3px] disabled:cursor-default disabled:text-nevo-near-black/30 disabled:no-underline"
        >
          Reset structure
        </button>
        <button
          type="button"
          onClick={() => void continueOn()}
          disabled={saving === "working"}
          className="inline-flex cursor-pointer items-center gap-2 rounded-[10px] bg-nevo-navy px-[18px] py-[11px] text-sm font-semibold text-nevo-cream transition-[filter] hover:brightness-93 disabled:cursor-default disabled:opacity-55"
        >
          {saving === "working"
            ? "Adding…"
            : saving === "failed"
              ? "Try again"
              : "Looks right, continue"}
        </button>
      </div>
    </>
  );
}
