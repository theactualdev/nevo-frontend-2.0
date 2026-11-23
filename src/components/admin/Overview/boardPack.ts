import type { SchoolNarrative } from "@/lib/api/school";
import { labelHero } from "../Compliance/ndpaClaims";

/**
 * "Copy for board pack" - D04's one export, as MARKDOWN.
 *
 * SCRUM-39 fixes both the label swap ("Copy for board pack" -> "Copied for
 * board pack") and what goes in it: "The copied text includes the compliance
 * line and the adaptation count, since both are the board-facing points." The
 * frame's own handler copies the narrative paragraph alone, which predates the
 * compliance card; the spec is the later word and wins.
 *
 * MARKDOWN, SO IT PASTES AS A DOCUMENT (Olayinka, 23 Nov). A pack goes into
 * Google Docs or Notion, both of which read Markdown on paste, so the copy
 * carries real structure: the summary's headline as a heading, its highlights
 * as a bullet list, and the two board-facing figures as a table under the
 * names the cards on screen give them. Read as plain text it is still the
 * same words in the same order. Structure only: nothing is re-worded and no
 * heading is added that the screen does not show.
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
 * the pack its compliance column and sentence; it must not put "Diagnostic
 * labels stored: 0" into a board document on the strength of a read that did
 * not return.
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
 * Text from the server, made safe to sit inside Markdown: the characters that
 * would turn into emphasis, code, links or HTML are escaped, and so is
 * whatever would start a heading, quote or list at the beginning of a line.
 * A summary is prose, so in practice this rarely changes anything - but a
 * stray asterisk must not italicise half of a governor's paragraph.
 */
export function mdText(s: string): string {
  return (
    s
      .replace(/[\\`*_[\]<>]/g, (c) => `\\${c}`)
      // "# ", "- " and "+ " at a line's start ("> " is escaped above).
      .replace(/^(\s*)(#|[-+](?=\s))/gm, "$1\\$2")
      // "1. " - only punctuation escapes, so the backslash goes before the dot.
      .replace(/^(\s*\d+)([.)])(?=\s)/gm, "$1\\$2")
  );
}

/** One line of Markdown: no line breaks, which would end a heading or a row. */
const oneLine = (s: string) => s.replace(/\s*\n\s*/g, " ").trim();

/** A table cell: one line, and a pipe can't split it into two columns. */
const cell = (s: string) => oneLine(mdText(s)).replace(/\|/g, "\\|");

/**
 * The pack, or null when there is no board summary to build it around.
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

  parts.push(`# ${oneLine(mdText(narrative.headline))}`);

  const written = onDate(narrative.generatedAt);
  parts.push(mdText(written ? `${school} · written ${written}` : school));

  parts.push(mdText(narrative.summary));

  if (narrative.highlights.length > 0) {
    parts.push(narrative.highlights.map((h) => `- ${oneLine(mdText(h))}`).join("\n"));
  }

  /*
   * THE TWO BOARD-FACING FIGURES, AS A TABLE, each under the name its card
   * gives it, and each only when we have it.
   *
   * THE TILE'S FIGURE, IN THE TILE'S WORDS. This copied the ALL-TIME total
   * "across all students so far" while the screen showed this term's count -
   * the pack and the screen disagreeing about the same figure (2 Nov audit;
   * Lydia, 7 Oct: this term's, named).
   */
  const columns: [string, string][] = [];
  if (typeof labels === "number") {
    columns.push([labelHero(labels, "overview").unit, String(labels)]);
  }
  if (typeof adaptations === "number" && adaptationPeriod) {
    columns.push([
      "Adaptations made",
      `${adaptations.toLocaleString("en-GB")} across all students ${adaptationPeriod}`,
    ]);
  }
  if (columns.length > 0) {
    parts.push(
      [
        `| ${columns.map(([name]) => cell(name)).join(" | ")} |`,
        `| ${columns.map(() => "---").join(" | ")} |`,
        `| ${columns.map(([, value]) => cell(value)).join(" | ")} |`,
      ].join("\n"),
    );
  }

  // What the compliance figure means, in the card's own sentence.
  if (typeof labels === "number") {
    parts.push(mdText(labelHero(labels, "overview").body));
  }

  return `${parts.join("\n\n")}\n`;
}
