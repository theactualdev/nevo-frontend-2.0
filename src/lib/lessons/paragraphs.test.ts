import { describe, expect, it } from "vitest";
import { paragraphsOf } from "./paragraphs";

describe("a text's paragraphs", () => {
  it("are split where the text leaves a blank line", () => {
    expect(
      paragraphsOf("Plants make food.\n\nThey use light.\n  \nOxygen goes out."),
    ).toEqual(["Plants make food.", "They use light.", "Oxygen goes out."]);
  });

  it("take Windows line ends as well", () => {
    expect(paragraphsOf("One.\r\n\r\nTwo.")).toEqual(["One.", "Two."]);
  });

  it("leave a single line break inside a paragraph", () => {
    expect(paragraphsOf("One line\nand the next.")).toEqual([
      "One line\nand the next.",
    ]);
  });

  it("give a text with no blank line back exactly as it was", () => {
    const text = "  Plants make their own food. ";
    expect(paragraphsOf(text)).toEqual([text]);
  });

  it("make nothing of blank lines at either end", () => {
    expect(paragraphsOf("\n\nOnly one.\n\n")).toEqual(["\n\nOnly one.\n\n"]);
  });
});
