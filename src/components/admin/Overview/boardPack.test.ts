import { describe, expect, it } from "vitest";
import type { SchoolNarrative } from "@/lib/api/school";
import { boardPackText, mdText } from "./boardPack";

/**
 * What may leave this console on a governor's clipboard.
 *
 * The two that matter: a figure we did not read must never be written into a
 * board document as zero, and the compliance sentence must be the one the card
 * on screen is showing rather than a second copy of the same claim. And since
 * 23 Nov it is Markdown, so it pastes into Docs or Notion as a document.
 */

const narrative = (over: Partial<SchoolNarrative> = {}): SchoolNarrative => ({
  headline: "What Nevo is doing for Brightgate Academy",
  summary: "287 students have been learning with Nevo.",
  highlights: ["Comprehension is moving in JSS 2.", "Two classes are new."],
  generatedAt: "2026-09-15T09:00:00Z",
  source: "live_school_data",
  ...over,
});

const base = {
  school: "Brightgate Academy",
  narrative: narrative(),
  labels: 0,
  adaptations: 1240,
  adaptationPeriod: "in First term",
};

describe("boardPackText", () => {
  it("is Markdown: the headline a heading, the highlights a list, the figures a table (Olayinka, 23 Nov)", () => {
    // THE WHOLE STRING, PINNED. Every word here is one the screen shows.
    expect(boardPackText(base)).toBe(
      [
        "# What Nevo is doing for Brightgate Academy",
        "",
        "Brightgate Academy · written 15 September 2026",
        "",
        "287 students have been learning with Nevo.",
        "",
        "- Comprehension is moving in JSS 2.",
        "- Two classes are new.",
        "",
        "| Diagnostic labels stored | Adaptations made |",
        "| --- | --- |",
        "| 0 | 1,240 across all students in First term |",
        "",
        "Nevo adapts to how each student is learning right now. It records no diagnosis and no label, and the last check found nothing of that kind held about your students.",
        "",
      ].join("\n"),
    );
  });

  it("leads with the summary the card is showing", () => {
    const t = boardPackText(base)!;
    expect(t).toContain("What Nevo is doing for Brightgate Academy");
    expect(t).toContain("287 students have been learning with Nevo.");
    expect(t).toContain("- Comprehension is moving in JSS 2.");
  });

  it("carries the compliance line and the adaptation count", () => {
    // SCRUM-39: "The copied text includes the compliance line and the
    // adaptation count, since both are the board-facing points."
    const t = boardPackText(base)!;
    expect(t).toContain("| Diagnostic labels stored |");
    // The tile's term figure, in the tile's words - not a total "so far".
    expect(t).toContain("1,240 across all students in First term");
    expect(t).not.toMatch(/so far/);
  });

  it("leaves the count out when there's no term to name, as the tile does", () => {
    const t = boardPackText({ ...base, adaptationPeriod: null })!;
    expect(t).not.toMatch(/Adaptations made/);
    expect(t).toContain("| Diagnostic labels stored |\n| --- |\n| 0 |");
  });

  it("states the compliance claim in the card's own words, not a second copy", () => {
    // Two wordings of one legal claim is how the pack and the screen end up
    // disagreeing about the same count.
    const t = boardPackText(base)!;
    expect(t).toContain("the last check found nothing of that kind held");
  });

  it("follows the count when it is not zero", () => {
    const t = boardPackText({ ...base, labels: 3 })!;
    expect(t).toContain("| 3 | 1,240 across all students in First term |");
    expect(t).toContain("The last check found 3 that need looking at");
    expect(t).not.toContain("found nothing of that kind");
  });

  it("omits a figure it does not have rather than writing zero into a board pack", () => {
    const t = boardPackText({ ...base, labels: null, adaptations: null })!;
    expect(t).not.toMatch(/Diagnostic labels stored/);
    expect(t).not.toMatch(/Adaptations made/);
    // No figures, no table - not an empty one.
    expect(t).not.toContain("|");
    expect(t).not.toMatch(/\b0\b/);
    // The school's own summary still goes across.
    expect(t).toContain("287 students have been learning with Nevo.");
  });

  it("is null with no board summary, so the action does not render", () => {
    expect(boardPackText({ ...base, narrative: null })).toBeNull();
  });

  it("dates the pack from the summary, and survives a date it cannot read", () => {
    expect(boardPackText(base)!).toContain("written 15 September 2026");
    const bad = boardPackText({
      ...base,
      narrative: narrative({ generatedAt: "not a date" }),
    })!;
    expect(bad).toContain("Brightgate Academy");
    expect(bad).not.toContain("Invalid Date");
  });

  it("holds no score, percentage or per-student detail", () => {
    // The line beside the button promises a governor exactly this.
    const t = boardPackText(base)!;
    expect(t).not.toMatch(/%|score|percentile|grade/i);
  });

  it("keeps the server's text as text: no stray emphasis, and a line break can't end the heading", () => {
    const t = boardPackText({
      ...base,
      narrative: narrative({
        headline: "What Nevo is doing\nfor *Brightgate*",
        summary: "# Not a heading\n1. Not a list",
        highlights: ["- not a nested item", "a | b"],
      }),
    })!;
    expect(t.split("\n")[0]).toBe("# What Nevo is doing for \\*Brightgate\\*");
    expect(t).toContain("\\# Not a heading\n1\\. Not a list");
    expect(t).toContain("- \\- not a nested item\n- a | b");
  });
});

describe("mdText", () => {
  it("escapes only what Markdown would act on", () => {
    expect(mdText("JSS 2 - moving well")).toBe("JSS 2 - moving well");
    expect(mdText("snake_case and *stars* and [link] <b>")).toBe(
      "snake\\_case and \\*stars\\* and \\[link\\] \\<b\\>",
    );
    expect(mdText("+ plus\n2) two")).toBe("\\+ plus\n2\\) two");
  });
});
