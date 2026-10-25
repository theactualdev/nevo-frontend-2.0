import { describe, expect, it } from "vitest";
import { answerBlocksFor, blocksFromMarkdown } from "./answerMarkdown";

/**
 * The server's Markdown (`render_answer`, Teslim 09a29d8), read back into the
 * blocks it was written from - with the bold and code marks kept, which the
 * server's own `blocks` strip. The samples are its own output shapes.
 */
describe("blocksFromMarkdown", () => {
  it("reads what render_answer writes: a bold heading, a paragraph, bullets and steps", () => {
    const md = [
      "**Where JSS 2A is**",
      "",
      "Most of the class finished **Fractions 3**.",
      "",
      "- Tunde stalled on Tuesday",
      "- Open `Equivalent fractions`",
      "",
      "1. Open the lesson",
      "2. Check section 2",
    ].join("\n");

    expect(blocksFromMarkdown(md)).toEqual([
      { type: "heading", text: "Where JSS 2A is" },
      { type: "paragraph", text: "Most of the class finished **Fractions 3**." },
      { type: "bullets", items: ["Tunde stalled on Tuesday", "Open `Equivalent fractions`"] },
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

  it("leaves markup in the words, for the renderer to show as text", () => {
    expect(blocksFromMarkdown("a <b>tag</b> and [a link](javascript:alert(1))")).toEqual([
      { type: "paragraph", text: "a <b>tag</b> and [a link](javascript:alert(1))" },
    ]);
  });

  it("is empty for nothing", () => {
    expect(blocksFromMarkdown("")).toEqual([]);
    expect(blocksFromMarkdown("  \n \n")).toEqual([]);
    expect(blocksFromMarkdown(null)).toEqual([]);
  });
});

describe("answerBlocksFor", () => {
  it("prefers the Markdown, which keeps the emphasis the server's blocks strip", () => {
    expect(
      answerBlocksFor({
        answer: "Check **JSS 2A**.",
        blocks: [{ type: "paragraph", text: "Check JSS 2A." }],
        plainText: "Check JSS 2A.",
      }),
    ).toEqual([{ type: "paragraph", text: "Check **JSS 2A**." }]);
  });

  it("falls back to the server's blocks, then the plain text", () => {
    expect(
      answerBlocksFor({ answer: "", blocks: [{ type: "paragraph", text: "From blocks" }] }),
    ).toEqual([{ type: "paragraph", text: "From blocks" }]);

    // One block per line in plainText, so the lines stay apart.
    expect(answerBlocksFor({ answer: "", blocks: [], plainText: "One\n• two\n• three" })).toEqual([
      { type: "paragraph", text: "One" },
      { type: "bullets", items: ["two", "three"] },
    ]);
  });
});
