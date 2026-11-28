import type { MasteryLevel, MasteryLevelState, ReadingDemand } from "@/lib/api/students";
import { cn } from "@/lib/utils";

/**
 * MasteryByLevel (`Nevo Mastery By Level`, teacher/, 928cf30) - one concept's
 * mastery, a state per curriculum level, with reading beside them.
 *
 * Job 8: a child can recall an idea and not yet be able to apply it, and that
 * is the case a teacher most needs to see - so a concept is three states, not
 * one. The levels are named in the curriculum's own words and never
 * abbreviated, and the mark and the word always say the same thing, so a
 * state never rests on colour alone.
 *
 * NO BARS AND NO NUMBERS. The dual track this replaces drew two filled rails,
 * a numbered bar in everything but the number. S21 sends no probability,
 * score or percentage (backend 58f31a6), and this draws only the words the
 * engine's states map to.
 *
 * NO FLAG. The frame can carry one; the server sends none, so none is drawn -
 * and none is ever worked out here (rule 3).
 *
 * WHAT IS DRAWN FOR A LEVEL is the engine's state and nothing else:
 *  - `reached`, `working`, `not`: the frame's mark and word;
 *  - NO ENTRY: nothing was observed at that level - "an absent state and
 *    `not` are different facts and are drawn differently" (backend
 *    src/nevo/mastery/read.py:22-23). The frame's fallback (`look[v] ||
 *    look.not`) drew it as "Not arrived yet" whenever another level had a
 *    state: an untrue state, in a case its sample data never had. It is
 *    drawn as its own row, "Not checked yet" (Lydia, L99, 28 Nov): leaving
 *    it out was a false signal too, since a teacher could not tell a level
 *    never tested from one tested and not reached. See `UNCHECKED`;
 *  - a value this client does not know: the row is left out. "Not checked
 *    yet" would claim no check was seen, which cannot be said of a value we
 *    cannot read, and "Not arrived yet" belongs to `not` alone (rule 5).
 * With no level holding a state the engine sent - all three absent, or
 * unreadable - the frame's own sentence stands in for all three rows.
 */

/** In the order a learner works up through them, in the frame's words. */
const LEVELS: readonly (readonly [MasteryLevel, string])[] = [
  ["knowing_and_understanding", "Knowing and understanding"],
  ["application", "Application"],
  ["analysis_and_evaluation", "Analysis and evaluation"],
];

/**
 * The line under "Concept mastery", on the live profile and the walkthrough
 * alike. C08's frame still says "Two tracks per topic ... When the tracks
 * part company", which describes the deleted bars and would be untrue over
 * this design - so the live line, already true here, stays (Hub, 28 Nov;
 * with Lydia in L99).
 */
export const CONCEPT_MASTERY_LEAD =
  "How well each idea has landed, and how much the reading itself is shaping that.";

/** The frame's sentence when no level has a state. */
export const NOTHING_AT_ANY_LEVEL = "Nothing recorded at any level yet.";

const DOT =
  "flex size-3.5 shrink-0 items-center justify-center rounded-full box-border";

const LOOK: Record<
  MasteryLevelState,
  { mark: string; core: boolean; word: string; wordClass: string; nameClass: string }
> = {
  reached: {
    mark: "border-2 border-nevo-navy bg-nevo-navy",
    core: false,
    word: "Reached",
    wordClass: "font-semibold text-nevo-navy",
    nameClass: "text-nevo-near-black",
  },
  working: {
    mark: "border-2 border-nevo-violet bg-transparent",
    core: true,
    word: "Working at it",
    wordClass: "font-semibold text-nevo-violet-text",
    nameClass: "text-nevo-near-black",
  },
  not: {
    mark: "border-[1.5px] border-nevo-near-black/22 bg-transparent",
    core: false,
    word: "Not arrived yet",
    wordClass: "font-normal text-nevo-near-black/55",
    nameClass: "text-nevo-near-black/70",
  },
};

/**
 * A LEVEL WITH NOTHING OBSERVED (Lydia, L99, 28 Nov): "Not checked yet",
 * which is distinct from "Not arrived yet" and literally true - no check at
 * that level has been seen. It reads as an absence rather than a negative
 * result, so in her words it takes "a lighter treatment and none of the
 * state colours": no navy and no lavender, a mark fainter than `not`'s hollow
 * dot, and greys lighter than `not`'s for the name and the word.
 *
 * THE FRAME DOES NOT DRAW THIS ROW YET. The treatment is built from L99's
 * words alone; the exact greys and the border are ours until the frame has
 * it, and change to the frame's then.
 */
const UNCHECKED = {
  mark: "border-[1.5px] border-nevo-near-black/14 bg-transparent",
  core: false,
  word: "Not checked yet",
  wordClass: "font-normal text-nevo-near-black/45",
  nameClass: "text-nevo-near-black/50",
};

const known = (v: unknown): v is MasteryLevelState =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(LOOK, v);

/** No entry at all: nothing observed. Not the same as a value we cannot read. */
const absent = (v: unknown): boolean => v === undefined || v === null;

/** The frame's words for reading. `none`, absent or unknown: no row. */
const READING: Partial<Record<ReadingDemand, { word: string; wordClass: string }>> = {
  at: { word: "At level", wordClass: "font-normal text-nevo-near-black/60" },
  support: { word: "Support needed", wordClass: "font-semibold text-nevo-violet-text" },
};

export function MasteryByLevel({
  concept,
  levels,
  reading,
}: {
  concept: string;
  /** Only the levels the engine observed something at, as sent. */
  levels: Partial<Record<MasteryLevel, MasteryLevelState>>;
  reading: ReadingDemand | null;
}) {
  const rows = LEVELS.flatMap(([key, name]) => {
    const state: unknown = levels?.[key];
    if (known(state)) return [{ key, name, state, look: LOOK[state] }];
    if (absent(state)) return [{ key, name, state: "unchecked", look: UNCHECKED }];
    // A value we cannot read: no row at all.
    return [];
  });
  /** At least one level holds a state the engine sent; otherwise one line. */
  const anyObserved = rows.some((r) => r.state !== "unchecked");
  const readingLook =
    typeof reading === "string" && Object.prototype.hasOwnProperty.call(READING, reading)
      ? READING[reading]
      : undefined;

  return (
    <div className="flex w-full flex-col gap-2.5">
      {concept && (
        <div className="flex items-center gap-2.5">
          <span className="text-[14.5px] font-semibold tracking-[-0.005em] text-nevo-near-black">
            {concept}
          </span>
        </div>
      )}

      {!anyObserved ? (
        <p className="m-0 text-[12.5px] leading-[1.55] text-nevo-near-black/55">
          {NOTHING_AT_ANY_LEVEL}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-[7px] p-0">
          {rows.map(({ key, name, state, look }) => (
            <li key={key} className="flex items-center gap-2.5" data-level={key} data-state={state}>
              <span aria-hidden className={cn(DOT, look.mark)}>
                {look.core && <span className="block size-[5px] rounded-full bg-nevo-violet" />}
              </span>
              <span
                className={cn(
                  "min-w-0 flex-auto text-[12.5px] leading-[1.4]",
                  look.nameClass,
                )}
              >
                {name}
              </span>
              <span className={cn("shrink-0 text-xs whitespace-nowrap", look.wordClass)}>
                {look.word}
              </span>
            </li>
          ))}
        </ul>
      )}

      {readingLook && (
        <div className="flex items-center gap-2.5 border-t border-nevo-near-black/8 pt-2">
          <span className="flex-auto text-[12.5px] text-nevo-near-black/70">Reading level</span>
          <span className={cn("shrink-0 text-xs whitespace-nowrap", readingLook.wordClass)}>
            {readingLook.word}
          </span>
        </div>
      )}
    </div>
  );
}
