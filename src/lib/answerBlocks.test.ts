import { describe, expect, it } from "vitest";
import {
  answerBlocks,
  blocksFromMarkdown,
  blocksFromServer,
  spansOf,
} from "./answerBlocks";

/**
 * The server's Markdown (`render_answer`, Teslim 09a29d8), read back into the
 * blocks it was written from. The samples are its own output shapes.
 */
describe("blocksFromMarkdown", () => {
  it("reads what render_answer writes: a bold heading, a paragraph, bullets and steps", () => {
    const md = [
      "**Where JSS 2A is**",
      "",
      "Most of the class finished **Fractions 3**.",
      "",
      "- Tunde stalled on Tuesday",
      "- Amara finished early",
      "",
      "1. Open the lesson",
      "2. Check section 2",
    ].join("\n");

    expect(blocksFromMarkdown(md)).toEqual([
      { type: "heading", text: "Where JSS 2A is" },
      { type: "paragraph", text: "Most of the class finished **Fractions 3**." },
      { type: "bullets", items: ["Tunde stalled on Tuesday", "Amara finished early"] },
      { type: "steps", items: ["Open the lesson", "Check section 2"] },
    ]);
  });

  it("reads a hashed heading too", () => {
    expect(blocksFromMarkdown("## Next steps ##")).toEqual([
      { type: "heading", text: "Next steps" },
    ]);
  });

  it("runs the lines of one paragraph together, as Markdown does", () => {
    expect(blocksFromMarkdown("First line\nsecond line\r\n\r\nNew paragraph")).toEqual([
      { type: "paragraph", text: "First line second line" },
      { type: "paragraph", text: "New paragraph" },
    ]);
  });

  it("starts a new list when bullets turn into steps", () => {
    expect(blocksFromMarkdown("- one\n1. two")).toEqual([
      { type: "bullets", items: ["one"] },
      { type: "steps", items: ["two"] },
    ]);
  });

  it("does not read emphasis at the start of a line as a bullet", () => {
    expect(blocksFromMarkdown("*Quietly* note this")).toEqual([
      { type: "paragraph", text: "*Quietly* note this" },
    ]);
  });

  it("does not read a year as a step", () => {
    expect(blocksFromMarkdown("2026. A good year.")).toEqual([
      { type: "paragraph", text: "2026. A good year." },
    ]);
  });

  it("is empty for nothing", () => {
    expect(blocksFromMarkdown("")).toEqual([]);
    expect(blocksFromMarkdown("  \n \n")).toEqual([]);
    expect(blocksFromMarkdown(null)).toEqual([]);
  });
});

describe("blocksFromServer", () => {
  it("keeps the contract's four types, and drops empty ones", () => {
    expect(
      blocksFromServer([
        { type: "heading", text: "Plan", items: [], level: 2 },
        { type: "paragraph", text: "  " },
        { type: "bullets", items: ["a", " ", "b"] },
        { type: "steps", items: [] },
      ]),
    ).toEqual([
      { type: "heading", text: "Plan" },
      { type: "bullets", items: ["a", "b"] },
    ]);
  });

  it("prints an unknown type's text as a paragraph, as the contract promises", () => {
    expect(blocksFromServer([{ type: "table", text: "Row one" }])).toEqual([
      { type: "paragraph", text: "Row one" },
    ]);
  });
});

describe("answerBlocks", () => {
  it("prefers the Markdown, which keeps the emphasis the blocks strip", () => {
    expect(
      answerBlocks({
        answer: "Check **JSS 2A**.",
        blocks: [{ type: "paragraph", text: "Check JSS 2A." }],
        plainText: "Check JSS 2A.",
      }),
    ).toEqual([{ type: "paragraph", text: "Check **JSS 2A**." }]);
  });

  it("falls back to the blocks, then the plain text", () => {
    expect(
      answerBlocks({ answer: "", blocks: [{ type: "paragraph", text: "From blocks" }] }),
    ).toEqual([{ type: "paragraph", text: "From blocks" }]);

    // One block per line in plainText, so the lines stay apart.
    expect(answerBlocks({ answer: "", blocks: [], plainText: "One\n• two\n• three" })).toEqual([
      { type: "paragraph", text: "One" },
      { type: "bullets", items: ["two", "three"] },
    ]);
  });
});

describe("spansOf", () => {
  it("splits bold, italic and code from the plain runs", () => {
    expect(spansOf("Open **Fractions 3**, then *section 2* in `Mathematics`.")).toEqual([
      { kind: "text", text: "Open " },
      { kind: "strong", text: "Fractions 3" },
      { kind: "text", text: ", then " },
      { kind: "em", text: "section 2" },
      { kind: "text", text: " in " },
      { kind: "code", text: "Mathematics" },
      { kind: "text", text: "." },
    ]);
  });

  it("leaves anything else exactly as it is", () => {
    expect(spansOf("a <b>tag</b> and [a link](javascript:alert(1))")).toEqual([
      { kind: "text", text: "a <b>tag</b> and [a link](javascript:alert(1))" },
    ]);
  });
});
