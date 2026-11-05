import type { SchoolNarrative } from "@/lib/api/school";
import { labelHero } from "../Compliance/ndpaClaims";

/**
 * "Copy for board pack" - D04's one export, as plain text.
 *
 * SCRUM-39 fixes both the label swap ("Copy for board pack" -> "Copied for
 * board pack") and what goes in it: "The copied text includes the compliance
 * line and the adaptation count, since both are the board-facing points." The
 * frame's own handler copies the narrative paragraph alone, which predates the
 * compliance card; the spec is the later word and wins.
 *
 * THE COMPLIANCE SENTENCE IS NOT RE-WORDED HERE. It comes from `labelHero`,
 * the same function the card on screen reads, because this text is pasted into
 * a governors' pack and read aloud - a second copy of that claim is exactly how
 * the pack and the screen end up asserting different things about the same
 * count. `ndpaClaims.ts` exists because that had already happened once.
 *
 * NOTHING IS COPIED THAT WAS NOT ON SCREEN. No scores, no per-student
 * anything, no figure the admin could not see above the button - the footer
 * line beside this action promises a governor exactly that.
 *
 * A FIGURE WE DO NOT HAVE IS OMITTED, NEVER ZEROED. A failed audit read costs
 * the pack its compliance paragraph; it must not put "Diagnostic labels
 * stored: 0" into a board document on the strength of a read that did not
 * return.
 */

export interface BoardPackInput {
  school: string;
  /** The board summary. Null when it has not loaded or could not be read. */
  narrative: SchoolNarrative | null;
  /** `audit.diagnosticLabelsStored`, or null when the audit failed. */
  labels: number | null;
  /** This term's adaptation count - the tile's - or null when we have not got one. */
  adaptations: number | null;
  /**
   * The period that count covers, as the tile words it ("in First term").
   * Null when there is no term to name - and then the line is left out, as the
   * tile is: an unnamed total is the "since setup" figure Lydia ruled out.
   */
  adaptationPeriod: string | null;
}

function onDate(iso: string): string | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
}

/**
 * The text, or null when there is no board summary to build it around.
 *
 * Null means the action does not render. An export offering to put a school
 * name and two numbers on a governor's desk, with no account of what Nevo did
 * for the children, is not the thing the button promises.
 */
export function boardPackText({
  school,
  narrative,
  labels,
  adaptations,
  adaptationPeriod,
}: BoardPackInput): string | null {
  if (!narrative) return null;

  const parts: string[] = [];

  const written = onDate(narrative.generatedAt);
  parts.push(
    written
      ? `${narrative.headline}\n${school} · written ${written}`
      : `${narrative.headline}\n${school}`,
  );

  parts.push(narrative.summary);

  if (narrative.highlights.length > 0) {
    parts.push(narrative.highlights.map((h) => `• ${h}`).join("\n"));
  }

  if (typeof labels === "number") {
    parts.push(
      `Diagnostic labels stored: ${labels}\n${labelHero(labels, "overview").body}`,
    );
  }

  // THE TILE'S FIGURE, IN THE TILE'S WORDS. This copied the ALL-TIME total
  // "across all students so far" while the screen showed this term's count -
  // the pack and the screen disagreeing about the same figure (2 Nov audit;
  // Lydia, 7 Oct: this term's, named).
  if (typeof adaptations === "number" && adaptationPeriod) {
    parts.push(
      `Adaptations made: ${adaptations.toLocaleString("en-GB")} across all students ${adaptationPeriod}.`,
    );
  }

  return parts.join("\n\n");
}
