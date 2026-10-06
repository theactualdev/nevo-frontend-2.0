"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Single-path Step 3: the SCRUM-101 module review (`Nevo Upload Module Step`),
 * amended per the SCRUM-101 default flip - modules are the platform's assumed
 * shape for any lesson of 6+ segments, so this is a review step, not an
 * opt-in. Keeping the lesson as one flow is a deliberate opt-out. Every
 * control is live: segments drag to reorder within and between modules (the
 * violet line shows where a drop lands), Split and Merge move real
 * boundaries, titles and the boundary recap/preview are editable, and the
 * no-suggestion state fires only for short lessons of 5 or fewer segments.
 *
 * Renders the step body AND its own C07c foot (Back / note / Reset structure
 * / "Looks right, continue") - the wizard suppresses its generic foot here.
 *
 * The signed-out walkthrough only, on the frame's canonical Photosynthesis
 * six. A signed-in teacher reviews what their own upload produced, in
 * `LiveModuleReview`.
 */

type Segment = { id: number; title: string; mins: string };
type Module = {
  title: string;
  recap: string;
  preview: string;
  segIds: number[];
};

const SEGMENTS: Segment[] = [
  { id: 1, title: "What plants need to live", mins: "3 min" },
  { id: 2, title: "Inside a leaf", mins: "4 min" },
  { id: 3, title: "Light, water and air", mins: "3 min" },
  { id: 4, title: "Try it: the leaf and water", mins: "5 min" },
  { id: 5, title: "What you'd expect to see", mins: "4 min" },
  { id: 6, title: "Quick recap", mins: "2 min" },
];

const suggested = (): Module[] => [
  {
    title: "Introduction",
    recap: "You saw what plants need and how a leaf is built to make food.",
    preview: "Now you'll try it yourself with a leaf and a glass of water.",
    segIds: [1, 2, 3],
  },
  {
    title: "Practice",
    recap: "You set up the leaf-and-water test and predicted what happens.",
    preview: "Finally, a short recap to lock it in.",
    segIds: [4, 5],
  },
  {
    title: "Wrap-up",
    recap: "You pulled the whole idea together in a quick recap.",
    preview: "",
    segIds: [6],
  },
];

const ghostBtn =
  "inline-flex cursor-pointer items-center gap-[7px] rounded-[10px] border-[1.5px] border-nevo-near-black/18 px-[15px] py-[9px] text-[13.5px] font-semibold text-nevo-near-black transition-colors hover:bg-nevo-near-black/5";
const inputBase =
  "nevo-in box-border rounded-[9px] border-[1.5px] border-nevo-navy/22 bg-nevo-cream/50 text-nevo-near-black outline-none transition-colors focus:border-nevo-navy focus:bg-nevo-cream";

function SegRow({ s }: { s: Segment }) {
  return (
    <>
      <span className="flex size-6 shrink-0 items-center justify-center rounded-[7px] bg-nevo-navy/10 text-xs font-semibold text-nevo-navy">
        {s.id}
      </span>
      <span className="min-w-0 flex-1 text-sm text-nevo-near-black">
        {s.title}
      </span>
      <span className="text-xs whitespace-nowrap text-nevo-near-black/50">
        {s.mins}
      </span>
    </>
  );
}

export function SectionReview({
  onBack,
  onDone,
}: {
  onBack: () => void;
  onDone: () => void;
}) {
  /*
   * The canonical fixture throughout - but NOT because nothing could deliver
   * the real thing, which is what this comment used to say.
   *
   * `GET /api/v1/uploads/{upload_id}` returns `segments` (and `structure`),
   * wrapped at `lib/api/uploads.ts:155` and typed at `:100`; the block path
   * beside this one already consumes them (`UploadWizard.tsx:575-581`). What
   * is actually missing is smaller and local: this component takes no
   * `uploadId` prop, so it has no upload to ask about.
   */
  const allSegments: Segment[] = SEGMENTS;
  const seg = (id: number) => allSegments.find((x) => x.id === id)!;
  const totalMin = allSegments.reduce(
    (a, x) => a + (parseInt(x.mins, 10) || 0),
    0,
  );
  const proposed = suggested;
  // Per the default flip: lessons of 6+ segments arrive with the proposed
  // modules; 5 or fewer arrive flat with no suggestion.
  const noSuggestionLesson = allSegments.length <= 5 || proposed().length === 0;
  const [modules, setModules] = useState<Module[]>(
    noSuggestionLesson ? [] : proposed(),
  );
  const [flat, setFlat] = useState(false);
  const [over, setOver] = useState<string | null>(null);
  const [overCard, setOverCard] = useState<number | null>(null);
  const drag = useRef<number | null>(null);

  const grouped = !flat && modules.length > 0;
  const noSuggestion = !flat && modules.length === 0;

  const update = (mi: number, patch: Partial<Module>) =>
    setModules((ms) => ms.map((m, i) => (i === mi ? { ...m, ...patch } : m)));

  // Split after the segment at posInModule: it stays, the rest move to a new
  // untitled module inserted right after.
  const split = (mi: number, posInModule: number) =>
    setModules((ms) => {
      const mods = ms.map((m) => ({ ...m, segIds: [...m.segIds] }));
      const moved = mods[mi].segIds.slice(posInModule + 1);
      if (!moved.length) return ms;
      mods[mi].segIds = mods[mi].segIds.slice(0, posInModule + 1);
      mods.splice(mi + 1, 0, {
        title: "",
        recap: "",
        preview: "",
        segIds: moved,
      });
      return mods;
    });

  const merge = (mi: number) =>
    setModules((ms) => {
      if (mi < 1) return ms;
      const mods = ms.map((m) => ({ ...m, segIds: [...m.segIds] }));
      mods[mi - 1].segIds = [...mods[mi - 1].segIds, ...mods[mi].segIds];
      if (!mods[mi - 1].preview) mods[mi - 1].preview = mods[mi].preview;
      mods.splice(mi, 1);
      return mods;
    });

  const clearDrag = () => {
    drag.current = null;
    setOver(null);
    setOverCard(null);
  };

  const moveSeg = (toMi: number, toPos: number) => {
    const segId = drag.current;
    if (segId === null) return;
    drag.current = null;
    setModules((ms) => {
      let mods = ms.map((m) => ({ ...m, segIds: [...m.segIds] }));
      let fromMi = -1;
      let fromPos = -1;
      mods.forEach((m, i) => {
        const p = m.segIds.indexOf(segId);
        if (p > -1) {
          fromMi = i;
          fromPos = p;
        }
      });
      if (fromMi < 0) return ms;
      mods[fromMi].segIds.splice(fromPos, 1);
      let insertPos = toPos;
      if (fromMi === toMi && fromPos < toPos) insertPos = toPos - 1;
      mods[toMi].segIds.splice(insertPos, 0, segId);
      mods = mods.filter((m) => m.segIds.length > 0);
      return mods;
    });
    setOver(null);
    setOverCard(null);
  };

  const reset = () => {
    setFlat(false);
    setModules(noSuggestionLesson ? [] : proposed());
  };

  const footNote = flat
    ? "Saved as one flow - no boundaries."
    : noSuggestion
      ? "Staying as one flow."
      : `${modules.length} modules ready.`;

  const flatRows = allSegments.map((s) => (
    <div
      key={s.id}
      className="flex items-center gap-3 rounded-[10px] bg-nevo-cream-elevated px-4 py-[13px]"
    >
      <SegRow s={s} />
    </div>
  ));

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-[22px] xl:px-8 xl:py-7">
        {flat && (
          <div className="flex max-w-[720px] flex-col gap-2.5">
            <div className="flex items-center gap-3 rounded-xl bg-nevo-violet/14 px-4 py-3.5">
              <span className="shrink-0 text-nevo-navy">
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
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </span>
              <span className="min-w-0 flex-1 text-[13.5px] leading-[1.5] text-nevo-near-black/78">
                {`This lesson will play as one continuous flow, with no module boundaries. ${allSegments.length} segments, about ${totalMin} minutes.`}
              </span>
              <button
                type="button"
                onClick={() => setFlat(false)}
                className={ghostBtn}
              >
                Add sections back
              </button>
            </div>
            {flatRows}
          </div>
        )}

        {noSuggestion && (
          <div className="flex max-w-[720px] flex-col gap-2.5">
            <div className="rounded-xl bg-nevo-cream-elevated px-5 py-[18px]">
              <div className="text-[15px] font-semibold text-nevo-near-black">
                This lesson is short - 5 segments or fewer - so it stays as one
                flow.
              </div>
              <p className="mt-1.5 text-[13.5px] leading-[1.55] text-nevo-near-black/66">
                Longer lessons are split into modules by default; short ones
                like this would only gain ceremony from it. You can still add
                modules if you&rsquo;d like to give it named sections.
              </p>
              <button
                type="button"
                onClick={() =>
                  setModules([
                    {
                      title: "",
                      recap: "",
                      preview: "",
                      segIds: allSegments.map((s) => s.id),
                    },
                  ])
                }
                className="mt-3.5 inline-flex cursor-pointer items-center gap-[7px] rounded-[10px] bg-nevo-navy px-[15px] py-[9px] text-[13.5px] font-semibold text-nevo-cream transition-[filter] hover:brightness-93"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add modules myself
              </button>
            </div>
            {flatRows}
          </div>
        )}

        {grouped && (
          <div className="flex max-w-[720px] flex-col gap-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[13px] text-nevo-near-black/60">
                {`${modules.length} sections · ${allSegments.length} segments · about ${totalMin} minutes`}
              </span>
              <div className="flex flex-col items-end gap-1">
                <button
                  type="button"
                  onClick={() => setFlat(true)}
                  className={ghostBtn}
                >
                  Keep as one flow
                </button>
                <span className="max-w-[280px] text-right text-[11.5px] leading-[1.4] text-nevo-near-black/50">
                  A deliberate opt-out: students will see one continuous lesson,
                  with no module breaks.
                </span>
              </div>
            </div>

            {modules.map((m, mi) => {
              const segs = m.segIds.map(seg);
              return (
                <div
                  key={mi}
                  className={cn(
                    "overflow-hidden rounded-[14px] bg-nevo-cream-elevated shadow-[0_2px_10px_rgba(0,0,0,0.05)]",
                    overCard === mi &&
                      "outline-2 -outline-offset-2 outline-nevo-violet",
                  )}
                >
                  <div className="border-b border-nevo-near-black/8 px-[18px] pt-4 pb-3.5">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[10.5px] font-bold tracking-[0.1em] whitespace-nowrap text-nevo-violet">
                        MODULE {mi + 1}
                      </span>
                      <input
                        value={m.title}
                        onChange={(e) => update(mi, { title: e.target.value })}
                        placeholder={`Module ${mi + 1}`}
                        className={cn(
                          inputBase,
                          "min-w-0 flex-1 px-3 py-[9px] text-[15.5px] font-semibold",
                        )}
                      />
                      <span className="text-xs whitespace-nowrap text-nevo-near-black/50">
                        {`${segs.length} ${segs.length === 1 ? "segment" : "segments"}`}
                      </span>
                    </div>
                    {segs.length === 1 && (
                      <div className="mt-[11px] flex items-center gap-2.5 rounded-[9px] bg-nevo-violet/14 px-[13px] py-2.5">
                        <span className="shrink-0 text-nevo-navy">
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.9"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden
                          >
                            <circle cx="12" cy="12" r="9" />
                            <path d="M12 11v5" />
                            <circle
                              cx="12"
                              cy="7.6"
                              r="0.6"
                              fill="currentColor"
                            />
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

                  <div
                    className="flex flex-col gap-[7px] px-3.5 py-2.5"
                    onDragOver={(e) => e.preventDefault()}
                    onDragEnter={() => setOverCard(mi)}
                    onDrop={(e) => {
                      e.preventDefault();
                      moveSeg(mi, segs.length);
                    }}
                  >
                    {segs.map((s, pi) => (
                      <div
                        key={s.id}
                        draggable
                        onDragStart={(e) => {
                          drag.current = s.id;
                          setOverCard(mi);
                          try {
                            e.dataTransfer.effectAllowed = "move";
                          } catch {}
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDragEnter={() => {
                          setOver(`${mi}:${pi}`);
                          setOverCard(mi);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          moveSeg(mi, pi);
                        }}
                        onDragEnd={clearDrag}
                      >
                        {over === `${mi}:${pi}` && (
                          <div className="mx-1 mb-1.5 h-[2.5px] rounded-full bg-nevo-violet" />
                        )}
                        <div className="flex items-center gap-[11px] rounded-[9px] bg-nevo-cream/55 px-[13px] py-[11px]">
                          <span
                            className="shrink-0 cursor-grab text-nevo-near-black/30"
                            aria-hidden
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                            >
                              <circle cx="9" cy="6" r="1.6" />
                              <circle cx="15" cy="6" r="1.6" />
                              <circle cx="9" cy="12" r="1.6" />
                              <circle cx="15" cy="12" r="1.6" />
                              <circle cx="9" cy="18" r="1.6" />
                              <circle cx="15" cy="18" r="1.6" />
                            </svg>
                          </span>
                          <SegRow s={s} />
                        </div>
                        {pi < segs.length - 1 && (
                          <div className="flex items-center gap-2 py-[5px] pl-[46px]">
                            <button
                              type="button"
                              onClick={() => split(mi, pi)}
                              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border-[1.5px] border-nevo-navy/35 px-[11px] py-1.5 text-xs font-semibold text-nevo-navy transition-colors hover:bg-nevo-navy/6"
                            >
                              <svg
                                width="13"
                                height="13"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden
                              >
                                <path d="M8 3v18M3 8h10M3 16h10M21 8l-3 4 3 4" />
                              </svg>
                              Split here
                            </button>
                            <span className="text-[11.5px] text-nevo-near-black/40">
                              start a new module after this segment
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-col gap-2.5 px-[18px] pt-1 pb-4">
                    {[
                      {
                        key: "recap" as const,
                        label: "What you just did - shown at the boundary",
                        glyph: (
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden
                          >
                            <path d="M9 11l3 3L22 4" />
                            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                          </svg>
                        ),
                      },
                      {
                        key: "preview" as const,
                        label: "What's coming next",
                        glyph: (
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden
                          >
                            <circle cx="12" cy="12" r="9" />
                            <path d="M10 8l4 4-4 4" />
                          </svg>
                        ),
                      },
                    ].map((f) => (
                      <div key={f.key}>
                        <div className="mb-[5px] flex items-center gap-[7px]">
                          <span className="inline-flex text-nevo-violet">
                            {f.glyph}
                          </span>
                          <span className="text-[11px] font-semibold tracking-[0.05em] text-nevo-near-black/48 uppercase">
                            {f.label}
                          </span>
                        </div>
                        <textarea
                          value={m[f.key]}
                          onChange={(e) =>
                            update(mi, { [f.key]: e.target.value })
                          }
                          rows={2}
                          className={cn(
                            inputBase,
                            "w-full resize-none px-3 py-[9px] text-[13.5px] leading-[1.5]",
                          )}
                        />
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
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <path d="M7 4l5 5 5-5M12 9v11" />
                        </svg>
                        Merge into Module {mi}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* The step's own C07c foot */}
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
          className="cursor-pointer text-[12.5px] whitespace-nowrap text-nevo-violet underline underline-offset-[3px]"
        >
          Reset structure
        </button>
        <button
          type="button"
          onClick={onDone}
          className="inline-flex cursor-pointer items-center gap-2 rounded-[10px] bg-nevo-navy px-[18px] py-[11px] text-sm font-semibold text-nevo-cream transition-[filter] hover:brightness-93"
        >
          Looks right, continue
        </button>
      </div>
    </>
  );
}
