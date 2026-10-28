import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { AnswerBlocks } from "./AnswerBlocks";

/**
 * Teslim, 25 Oct: an Ask Nevo answer arrives as Markdown, and printed as it
 * was a child saw its asterisks. Draw the server's blocks by type - heading,
 * paragraph, bullets, steps - never as HTML.
 */

afterEach(cleanup);

const tags = (el: Element) =>
  Array.from(el.firstElementChild?.children ?? []).map((c) => c.tagName);

describe("an answer drawn by its blocks", () => {
  it("draws each block as what it is", () => {
    const { container } = render(
      <AnswerBlocks
        text="unused"
        blocks={[
          { type: "heading", text: "How plants feed", level: 2 },
          { type: "paragraph", text: "Leaves catch the light." },
          { type: "bullets", items: ["Water", "Carbon dioxide"] },
          { type: "steps", items: ["Light lands", "Sugar is made"] },
        ]}
      />,
    );

    expect(tags(container)).toEqual(["P", "P", "UL", "OL"]);
    expect(container.querySelector("[data-block=heading]")?.textContent).toBe(
      "How plants feed",
    );
    expect(
      Array.from(container.querySelectorAll("ul li")).map((li) => li.textContent),
    ).toEqual(["Water", "Carbon dioxide"]);
    expect(
      Array.from(container.querySelectorAll("ol li")).map((li) => li.textContent),
    ).toEqual(["Light lands", "Sugar is made"]);
    expect(container.textContent).not.toContain("unused");
  });

  it("shows no asterisks, and draws a paired mark as bold, italic or code", () => {
    const { container } = render(
      <AnswerBlocks
        text=""
        blocks={[
          {
            type: "paragraph",
            text: "It is **light** that the *leaf* turns into `sugar`.",
          },
        ]}
      />,
    );

    expect(container.textContent).toBe("It is light that the leaf turns into sugar.");
    expect(container.querySelector("strong")?.textContent).toBe("light");
    expect(container.querySelector("em")?.textContent).toBe("leaf");
    expect(container.querySelector("code")?.textContent).toBe("sugar");
  });

  it("leaves a child's sum alone: a lone star is not emphasis", () => {
    const { container } = render(
      <AnswerBlocks text="" blocks={[{ type: "paragraph", text: "5 * 3 * 2 is 30." }]} />,
    );

    expect(container.textContent).toBe("5 * 3 * 2 is 30.");
    expect(container.querySelector("em, strong")).toBeNull();
  });

  it("never runs what an answer contains: markup is shown as text", () => {
    const { container } = render(
      <AnswerBlocks
        text=""
        blocks={[
          { type: "paragraph", text: '<img src=x onerror="alert(1)"> and <b>bold</b>' },
        ]}
      />,
    );

    expect(container.querySelector("img, b")).toBeNull();
    expect(container.textContent).toContain("<img src=x");
  });

  it("shows a block type it does not know as its words", () => {
    const { container } = render(
      <AnswerBlocks
        text=""
        blocks={[{ type: "callout" as never, text: "A new shape of answer." }]}
      />,
    );

    expect(container.textContent).toBe("A new shape of answer.");
  });

  it("draws nothing for an empty block", () => {
    const { container } = render(
      <AnswerBlocks
        text="Fallback words."
        blocks={[
          { type: "bullets", items: ["  "] },
          { type: "paragraph", text: "Real words." },
        ]}
      />,
    );

    expect(container.querySelector("ul")).toBeNull();
    expect(container.textContent).toBe("Real words.");
  });
});

describe("an answer with no blocks", () => {
  it("is its text, in its paragraphs, with no asterisks", () => {
    const { container } = render(
      <AnswerBlocks
        text={"**Light** is the fuel.\n\nThe leaf does the work."}
        blocks={[]}
      />,
    );

    expect(
      Array.from(container.querySelectorAll("p")).map((p) => p.textContent),
    ).toEqual(["Light is the fuel.", "The leaf does the work."]);
    expect(container.querySelector("strong")?.textContent).toBe("Light");
  });

  it("is the text when there are no blocks at all", () => {
    const { container } = render(<AnswerBlocks text="Just this." />);

    expect(container.textContent).toBe("Just this.");
  });

  it("is nothing when there is nothing to say", () => {
    const { container } = render(<AnswerBlocks text="   " blocks={null} />);

    expect(container).toBeEmptyDOMElement();
  });
});
