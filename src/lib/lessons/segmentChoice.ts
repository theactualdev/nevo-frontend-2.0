import type {
  ChoiceDepth,
  LessonChoice,
  SegmentChoice,
  SegmentChoiceWrite,
  SegmentFormatChoice,
} from "@/lib/api/lessons";
import { DENSITY, MODALITY, type Density, type Modality } from "@/lib/constants";
import type { ChosenVersion } from "@/lib/types";

/**
 * Between the server's record of what a child chose (K4, SCRUM-272) and the
 * player's own words for it.
 *
 * Lydia, 21 Oct: "A reload keeps the child's chosen version, and that now
 * covers format as well: text, audio, picture or activity. Slower is
 * included." Held server-side, per sitting - never in browser storage, never
 * on the child (rule 1).
 *
 * TWO SCOPES (Lydia, 22 Oct: "depth holds for the lesson, format is per
 * section"; the server since 741685e). The format is held for one section,
 * in the sitting's `segmentChoices`. Depth and Slower are held for the whole
 * sitting, in its `lessonPreferences`, whichever section they were picked
 * on - and a section's own `deliveryPreference` shows them as they take
 * effect there.
 *
 * TWO VOCABULARIES. The wire keeps `depth` (original, simplified, expanded)
 * and `slower` apart; the player has one pace (`Density`: simplify, expand
 * or slower), because its chips are one row and one pick at a time. So a
 * pick of Slower clears the depth, and a depth clears Slower, in one write.
 */

const MODALITIES: readonly string[] = Object.values(MODALITY);

/**
 * One stored choice as the player reads it, or nothing where it says nothing.
 *
 * `density` null is the standard text CHOSEN (`depth: "original"` or
 * `slower: false`); absent is no choice about pace at all. Slower is read
 * first where a choice somehow holds both - this player never writes both,
 * and Slower is the one that changes how much arrives at once.
 */
export function chosenFrom(
  choice: SegmentChoice | null | undefined,
): ChosenVersion | undefined {
  if (!choice || typeof choice !== "object") return undefined;
  const out: ChosenVersion = {};
  if (typeof choice.modality === "string" && MODALITIES.includes(choice.modality)) {
    out.modality = choice.modality as Modality;
  }
  if (choice.slower === true) out.density = DENSITY.SLOWER;
  else if (choice.depth === "simplified") out.density = DENSITY.SIMPLIFY;
  else if (choice.depth === "expanded") out.density = DENSITY.EXPAND;
  else if (choice.depth === "original" || choice.slower === false) {
    out.density = null;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * The sitting's pace as `POST /session` names it (`lessonPreferences`), or
 * none. An empty one - a new sitting, which inherits nothing - is none.
 */
export function paceOf(choice: LessonChoice | null | undefined): Density | null {
  return chosenFrom(choice)?.density ?? null;
}

/**
 * THE SITTING'S PACE, AS THE LESSON READ SHOWS IT (741685e). The read has no
 * `lessonPreferences` of its own: each section's `deliveryPreference` shows
 * the sitting's depth and Slower as they take effect on that section. So
 * the pace is the one the sections show - nothing worked out, the server's
 * one value read back.
 *
 * A SECTION SHOWING THE STANDARD TEXT DOES NOT CLEAR IT. The server reads
 * `depth: "original"` on a section with no approved rewrite at the sitting's
 * depth, while the sitting keeps it, and it resumes on the next section that
 * has one - as a section that cannot deliver the chosen pace has always
 * rendered its default without the pick being cleared. Slower takes effect
 * on every section, so a section showing it is the sitting's.
 */
export function lessonPace(
  sections: readonly (ChosenVersion | undefined)[],
): Density | null {
  let depth: Density | null = null;
  for (const chosen of sections) {
    const pace = chosen?.density;
    if (pace === DENSITY.SLOWER) return DENSITY.SLOWER;
    if (depth === null && (pace === DENSITY.SIMPLIFY || pace === DENSITY.EXPAND)) {
      depth = pace;
    }
  }
  return depth;
}

/** A pace as the wire holds it. Null clears that override (handoff §5). */
function wireOf(density: Density | null | undefined): {
  depth: ChoiceDepth | null;
  slower: boolean | null;
} {
  switch (density) {
    case DENSITY.SIMPLIFY:
      return { depth: "simplified", slower: null };
    case DENSITY.EXPAND:
      return { depth: "expanded", slower: null };
    case DENSITY.SLOWER:
      return { depth: null, slower: true };
    default:
      return { depth: null, slower: null };
  }
}

/**
 * The write that takes the sitting from one pace to another: only the
 * fields that change, since writes are partial - or nothing where none does.
 * `before` is the SITTING's pace, which the server holds for every section,
 * not whatever one section happened to show.
 *
 * BACK TO THE STANDARD TEXT IS A CLEAR, NOT A CHOICE: `depth: null` and
 * `slower: null`, never `"original"` or `false`. The chips' "off" has always
 * meant "no pick of mine" - the system's own density shows through it - and
 * the server reads null the same way: "null clears that particular
 * override", while a value withholds the engine's Simplify, Expand or Slower.
 */
export function paceWrite(
  before: Density | null | undefined,
  after: Density | null,
): SegmentChoiceWrite | null {
  const was = wireOf(before);
  const now = wireOf(after);
  const write: SegmentChoiceWrite = {};
  if (was.depth !== now.depth) write.depth = now.depth;
  if (was.slower !== now.slower) write.slower = now.slower;
  return Object.keys(write).length > 0 ? write : null;
}

/**
 * The sitting's own word on each section's FORMAT (`deliveryState.
 * segmentChoices`, from `POST /session`), over the lesson read's.
 *
 * The session's answer wins for every section but two kinds: the one on
 * screen as it lands, which is not flipped under the child (rule 7), and any
 * the child has picked a format on since the lesson opened, whose pick is
 * newer than either read. A section the session names no format for has
 * none.
 *
 * THE FORMAT AND NOTHING ELSE (741685e): an entry there carries no depth or
 * Slower - those are the sitting's, in `lessonPreferences` - so a pace held
 * for a section is left as it was, never wiped for being absent here, and
 * a pace an older entry might still carry is not read.
 */
export function withSessionChoices(
  current: ReadonlyMap<string, ChosenVersion>,
  session: Record<string, SegmentFormatChoice>,
  segmentIds: readonly string[],
  keep: (segmentId: string) => boolean,
): ReadonlyMap<string, ChosenVersion> {
  const next = new Map(current);
  for (const id of segmentIds) {
    if (keep(id)) continue;
    const merged: ChosenVersion = { ...current.get(id) };
    delete merged.modality;
    const format = chosenFrom({ modality: session[id]?.modality })?.modality;
    if (format) merged.modality = format;
    if (Object.keys(merged).length > 0) next.set(id, merged);
    else next.delete(id);
  }
  return next;
}
