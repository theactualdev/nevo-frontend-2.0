import type {
  ChoiceDepth,
  SegmentChoice,
  SegmentChoiceWrite,
} from "@/lib/api/lessons";
import { DENSITY, MODALITY, type Density, type Modality } from "@/lib/constants";
import type { ChosenVersion } from "@/lib/types";

/**
 * Between the server's record of what a child chose for one section (K4,
 * SCRUM-272) and the player's own words for it.
 *
 * Lydia, 21 Oct: "A reload keeps the child's chosen version, and that now
 * covers format as well: text, audio, picture or activity. Slower is
 * included." Held server-side, per section, per sitting - never in browser
 * storage, never on the child (rule 1).
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
 * The write that takes a section from one pace to another: only the fields
 * that change, since writes are partial - or nothing where none does.
 *
 * BACK TO THE STANDARD TEXT IS A CLEAR, NOT A CHOICE: `depth: null` and
 * `slower: null`, never `"original"` or `false`. The chips' "off" has always
 * meant "no pick of mine" - the system's own density shows through it - and
 * the server reads null the same way: "null clears that particular
 * override", while a value withholds the engine's Simplify, Expand or Slower
 * for that section.
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
 * The sitting's own word on what was chosen (`deliveryState.segmentChoices`,
 * from `POST /session`), over the lesson read's.
 *
 * The session's answer wins for every section but two kinds: the one on
 * screen as it lands, which is not flipped under the child (rule 7), and any
 * the child has picked on since the lesson opened, whose pick is newer than
 * either read. A section the session names nothing for has no choice.
 */
export function withSessionChoices(
  current: ReadonlyMap<string, ChosenVersion>,
  session: Record<string, SegmentChoice>,
  segmentIds: readonly string[],
  keep: (segmentId: string) => boolean,
): ReadonlyMap<string, ChosenVersion> {
  const next = new Map(current);
  for (const id of segmentIds) {
    if (keep(id)) continue;
    const chosen = chosenFrom(session[id]);
    if (chosen) next.set(id, chosen);
    else next.delete(id);
  }
  return next;
}
