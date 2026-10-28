import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TextSegment } from "./TextSegment";
import { DENSITY } from "@/lib/constants";
import type { TextContent } from "@/lib/types";
import { visibleText } from "@/test/visibleText";

/**
 * The text segment's two payload additions: SCRUM-224's boxes beside the body,
 * and SCRUM-234's reading chunks in place of one block.
 *
 * Frame 17c is strict about the chunks: "Nothing on screen tells a child the
 * chunking exists - no chunk numbers, no 'section 2 of 5', no progress tied
 * to chunks, no marker that follows where they have read." So the tests read
 * the screen for anything that counts, and the stream for the two crossings
 * the catalogue declares.
 */

const BODY =
  "Plants make their own food. They use sunlight to do it. Oxygen is what they give out.";
const CHUNKS = [
  { id: "c1", text: "Plants make their own food." },
  { id: "c2", text: "They use sunlight to do it." },
  { id: "c3", text: "Oxygen is what they give out." },
];

const content = (over: Partial<TextContent> = {}): TextContent => ({
  heading: "Photosynthesis",
  body: { default: BODY },
  ...over,
});

/** A stand-in IntersectionObserver the test drives by hand. */
type Entry = Pick<
  IntersectionObserverEntry,
  "target" | "isIntersecting" | "boundingClientRect" | "rootBounds"
>;
let watchers: { report: (entries: Entry[]) => void; targets: Element[]; on: boolean }[];

beforeEach(() => {
  watchers = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      w: (typeof watchers)[number];
      constructor(report: (entries: Entry[]) => void) {
        this.w = { report, targets: [], on: true };
        watchers.push(this.w);
      }
      observe(el: Element) {
        this.w.targets.push(el);
      }
      disconnect() {
        this.w.on = false;
      }
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Tells the live observer where chunk `id` is now. */
function see(id: string, where: "in" | "above" | "below") {
  const w = watchers.find(
    (x) => x.on && x.targets.some((t) => (t as HTMLElement).dataset.chunkId === id),
  );
  if (!w) throw new Error(`nothing is watching ${id}`);
  const target = w.targets.find((t) => (t as HTMLElement).dataset.chunkId === id)!;
  const at = { in: [100, 200], above: [-300, -100], below: [900, 1000] }[where];
  act(() =>
    w.report([
      {
        target,
        isIntersecting: where === "in",
        boundingClientRect: { top: at[0], bottom: at[1] } as DOMRect,
        rootBounds: { top: 0, height: 800 } as DOMRect,
      },
    ]),
  );
}

describe("a body the server sent in chunks (frame 17c)", () => {
  it("draws each chunk's text with a quiet rule between two", () => {
    const { container } = render(
      <TextSegment content={content({ readingChunks: CHUNKS })} density={null} />,
    );

    for (const c of CHUNKS) expect(screen.getByText(c.text)).toBeInTheDocument();
    // Three chunks, two boundaries - never one after the last.
    expect(container.querySelectorAll("div.h-px")).toHaveLength(2);
  });

  it("tells nobody the chunking exists, a screen reader included", () => {
    const { container } = render(
      <TextSegment content={content({ readingChunks: CHUNKS })} density={null} />,
    );

    expect(visibleText(container)).not.toMatch(/\b(part|section|chunk)\b|\d+ of \d+/i);
    expect(screen.queryByRole("separator")).toBeNull();
    for (const rule of container.querySelectorAll("div.h-px"))
      expect(rule).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("keeps the rule visible under typographic support, on the softer card", () => {
    const { container } = render(
      <TextSegment content={content({ readingChunks: CHUNKS })} density={null} reading />,
    );

    const rule = container.querySelector("div.h-px")!;
    expect(rule.className).toMatch(/bg-nevo-near-black\/16/);
    expect(rule.parentElement?.className).toMatch(/bg-\[#e5dfd3\]/);
  });

  it("draws one body as today where none were sent", () => {
    const { container } = render(<TextSegment content={content()} density={null} />);

    expect(screen.getByText(BODY).tagName).toBe("P");
    expect(container.querySelectorAll("div.h-px")).toHaveLength(0);
  });

  it("reads a reshape whole, because the chunks are of the standard body", () => {
    const simpler = "Plants feed themselves on light.";
    render(
      <TextSegment
        content={content({
          body: { default: BODY, [DENSITY.SIMPLIFY]: simpler },
          readingChunks: CHUNKS,
        })}
        density={DENSITY.SIMPLIFY}
      />,
    );

    expect(screen.getByText(simpler)).toBeInTheDocument();
    expect(screen.queryByText(CHUNKS[0].text)).toBeNull();
  });
});

describe("text on screen that is not the body the chunks were cut from", () => {
  /*
   * The chunks describe the STANDARD body. A session can show a segment's
   * simpler text in that body's place, and then the chunks are someone else's
   * words: drawn, they would put the standard text back on screen; driving
   * the parts or the stream, they would report reading nobody did. So they
   * are asked of what is actually rendered, not of what was adapted.
   */
  const SHOWN =
    "Plants feed themselves on light. They breathe out oxygen. That is all.";
  const standIn = content({ body: { default: SHOWN }, readingChunks: CHUNKS });

  it("draws the text shown as one body, with no chunk in it", () => {
    const { container } = render(<TextSegment content={standIn} density={null} />);

    expect(screen.getByText(SHOWN).tagName).toBe("P");
    expect(screen.queryByText(CHUNKS[0].text)).toBeNull();
    expect(container.querySelectorAll("div.h-px")).toHaveLength(0);
    expect(container.querySelector("[data-chunk-id]")).toBeNull();
  });

  it("reads it whole under attention too, never cut on the device (B114)", () => {
    // "The client must not split text." Its three sentences were three parts
    // of the client's own making; with no chunks of its own it is one body.
    const { container } = render(
      <TextSegment content={standIn} density={null} attention />,
    );

    expect(screen.getByText(SHOWN).tagName).toBe("P");
    expect(screen.queryByRole("button", { name: "Tap to continue" })).toBeNull();
    expect(container.querySelector("[data-chunk-id]")).toBeNull();
  });

  it("reports no chunk it is not showing", () => {
    const onChunkSeen = vi.fn();
    render(
      <TextSegment content={standIn} density={null} onChunkSeen={onChunkSeen} />,
    );

    expect(watchers.every((w) => w.targets.length === 0)).toBe(true);
    expect(onChunkSeen).not.toHaveBeenCalled();
  });
});

describe("reporting where the child has read (reading_chunk_viewed)", () => {
  const renderWatched = () => {
    const onChunkSeen = vi.fn();
    render(
      <TextSegment
        content={content({ readingChunks: CHUNKS })}
        density={null}
        onChunkSeen={onChunkSeen}
      />,
    );
    return onChunkSeen;
  };

  it("reports a chunk entering view, and passing off the top", () => {
    const onChunkSeen = renderWatched();

    see("c1", "in");
    see("c2", "below");
    see("c1", "above");

    expect(onChunkSeen.mock.calls).toEqual([
      ["c1", "entered"],
      ["c1", "passed"],
    ]);
  });

  it("reports nothing when the child scrolls back up off a chunk", () => {
    const onChunkSeen = renderWatched();

    see("c2", "in");
    see("c2", "below");

    expect(onChunkSeen.mock.calls).toEqual([["c2", "entered"]]);
  });

  it("reports a return after passing as another entry, and counts nothing", () => {
    // The server reads the pair as a reread. Nothing here counts them, and
    // nothing on screen changes for it.
    const onChunkSeen = renderWatched();

    see("c1", "in");
    see("c1", "above");
    const before = document.body.innerHTML;
    see("c1", "in");

    expect(onChunkSeen.mock.calls.at(-1)).toEqual(["c1", "entered"]);
    expect(document.body.innerHTML).toBe(before);
  });

  it("sends nothing where the browser has no observer to ask", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const onChunkSeen = vi.fn();

    render(
      <TextSegment
        content={content({ readingChunks: CHUNKS })}
        density={null}
        onChunkSeen={onChunkSeen}
      />,
    );

    expect(onChunkSeen).not.toHaveBeenCalled();
  });
});

describe("the tap-to-continue flow, on the server's chunks", () => {
  it("takes its parts from the chunks, as sent", () => {
    // Two chunks of unequal size: the parts are where the server broke the
    // body, not one per sentence.
    const two = [
      { id: "c1", text: "Plants make their own food. They use sunlight to do it." },
      { id: "c2", text: "Oxygen is what they give out." },
    ];
    render(
      <TextSegment content={content({ readingChunks: two })} density={null} attention />,
    );

    // On the device the first part would be its first sentence alone.
    expect(screen.getByText(two[0].text)).toBeInTheDocument();
    expect(screen.queryByText(two[1].text)).toBeNull();
  });

  it("counts nothing: no part number and no total", () => {
    // Design, 9 Oct: "Drop it. It counts the server's chunks, and nothing
    // about chunking is ever surfaced to a child."
    for (const over of [{ readingChunks: CHUNKS }, {}]) {
      const { container, unmount } = render(
        <TextSegment content={content(over)} density={null} attention />,
      );

      expect(visibleText(container)).not.toMatch(/\bpart\b|\d+ of \d+/i);
      unmount();
    }
  });

  it("reports the part on screen, and passes it when the child taps on", () => {
    const onChunkSeen = vi.fn();
    render(
      <TextSegment
        content={content({ readingChunks: CHUNKS })}
        density={null}
        attention
        onChunkSeen={onChunkSeen}
      />,
    );

    see("c1", "in");
    fireEvent.click(screen.getByRole("button", { name: "Tap to continue" }));

    expect(onChunkSeen.mock.calls).toEqual([
      ["c1", "entered"],
      ["c1", "passed"],
    ]);
  });
});

describe("the payload's boxes, where the frame draws them (SCRUM-224, D24)", () => {
  const boxes = content({
    body: {
      default: BODY,
      [DENSITY.EXPAND]: `${BODY} Much more here.`,
      [DENSITY.SIMPLIFY]: "Plants feed themselves on light.",
    },
    keyPoints: ["Plants feed themselves.", "Light is the fuel."],
    keyTerms: [
      { term: "chlorophyll", definition: "The green colour in a leaf." },
      { term: "glucose", definition: "The sugar a plant makes." },
    ],
    equations: [
      { equation: "Carbon dioxide + Water → Glucose + Oxygen", label: "Word equation" },
      { equation: "6CO2 + 6H2O → C6H12O6 + 6O2" },
    ],
  });

  it("puts the key points under IN SHORT beside the standard body", () => {
    render(<TextSegment content={boxes} density={null} />);

    const box = screen.getByText("IN SHORT").parentElement!;
    expect(visibleText(box)).toBe("IN SHORT Plants feed themselves. Light is the fuel.");
  });

  it("keeps the key terms beside the standard body: they are part of the segment", () => {
    // Design, 9 Oct: "key terms and equations sit beside standard text. They
    // are part of the segment rather than a form of support."
    render(<TextSegment content={boxes} density={null} />);

    expect(screen.getByRole("button", { name: "chlorophyll" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "glucose" })).toBeInTheDocument();
  });

  it("keeps the equations beside the standard body, which may not repeat them", () => {
    // Backend, 9 Oct: an equation callout "is not guaranteed to be repeated
    // in body". Under Expand alone, a child on the standard text lost it.
    render(<TextSegment content={boxes} density={null} />);

    expect(screen.getByText("Word equation")).toBeInTheDocument();
    expect(screen.getByText("6CO2 + 6H2O → C6H12O6 + 6O2")).toBeInTheDocument();
  });

  it("keeps them when the standard body arrives in parts", () => {
    render(
      <TextSegment
        content={{ ...boxes, readingChunks: CHUNKS }}
        density={null}
        attention
      />,
    );
    expect(screen.getByRole("button", { name: "Tap to continue" })).toBeInTheDocument();

    expect(screen.getByText("6CO2 + 6H2O → C6H12O6 + 6O2")).toBeInTheDocument();
  });

  it("keeps the key terms and equations under Simplify, beside IN SHORT", () => {
    // Lydia, 17 Oct: "A rewrite must not be able to lose an equation.
    // Simplify loses no content, which is the whole rule." The frame's
    // Simplify view drew neither, and this followed it.
    render(<TextSegment content={boxes} density={DENSITY.SIMPLIFY} />);

    expect(screen.getByText("Plants feed themselves on light.")).toBeInTheDocument();
    expect(screen.getByText("IN SHORT")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "chlorophyll" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "glucose" })).toBeInTheDocument();
    expect(screen.getByText("Word equation")).toBeInTheDocument();
    expect(screen.getByText("Carbon dioxide + Water → Glucose + Oxygen")).toBeInTheDocument();
    expect(screen.getByText("6CO2 + 6H2O → C6H12O6 + 6O2")).toBeInTheDocument();
  });

  it("keeps them under Slower's authored step cards, once and not per step", () => {
    // Checklist 15, Slower: "Failure: Content is cut to make it shorter."
    // An authored Slower has its own lead line in the body's place.
    const stepped = {
      ...boxes,
      body: { ...boxes.body, [DENSITY.SLOWER]: "One small step at a time." },
      slowerSteps: ["A leaf catches light.", "It takes in water.", "It makes sugar."],
    };
    render(<TextSegment content={stepped} density={DENSITY.SLOWER} />);

    expect(screen.getByText("It makes sugar.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "chlorophyll" })).toHaveLength(1);
    expect(screen.getAllByText("6CO2 + 6H2O → C6H12O6 + 6O2")).toHaveLength(1);
    expect(screen.getAllByText("Word equation")).toHaveLength(1);
    // After the last step, where the standard view puts them after the body.
    const lastStep = screen.getByText("It makes sugar.");
    const chip = screen.getByRole("button", { name: "chlorophyll" });
    expect(
      lastStep.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // IN SHORT with them, once, after the steps (Lydia, 26 Oct #2).
    expect(screen.getAllByText("IN SHORT")).toHaveLength(1);
    expect(
      lastStep.compareDocumentPosition(screen.getByText("IN SHORT")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps them under every view, each drawn once", () => {
    const stepped = {
      ...boxes,
      body: { ...boxes.body, [DENSITY.SLOWER]: "One small step at a time." },
      slowerSteps: ["A leaf catches light.", "It makes sugar."],
    };
    const views = [
      { name: "standard", content: boxes, density: null },
      { name: "Simplify", content: boxes, density: DENSITY.SIMPLIFY },
      { name: "Expand", content: boxes, density: DENSITY.EXPAND },
      { name: "Slower, authored steps", content: stepped, density: DENSITY.SLOWER },
      {
        name: "Slower, the server's chunks",
        content: { ...boxes, readingChunks: CHUNKS },
        density: DENSITY.SLOWER,
      },
    ] as const;
    for (const view of views) {
      const { unmount } = render(
        <TextSegment content={view.content} density={view.density} />,
      );

      for (const term of ["chlorophyll", "glucose"])
        expect(screen.getAllByRole("button", { name: term }), view.name).toHaveLength(1);
      for (const equation of [
        "Carbon dioxide + Water → Glucose + Oxygen",
        "6CO2 + 6H2O → C6H12O6 + 6O2",
      ])
        expect(screen.getAllByText(equation), view.name).toHaveLength(1);
      unmount();
    }
  });

  it("keeps them once while Slower takes the server's chunks a part at a time", () => {
    render(
      <TextSegment
        content={{ ...boxes, readingChunks: CHUNKS }}
        density={DENSITY.SLOWER}
      />,
    );
    expect(screen.getByRole("button", { name: "Tap to continue" })).toBeInTheDocument();
    expect(screen.queryByText(CHUNKS[1].text)).toBeNull();

    expect(screen.getAllByRole("button", { name: "chlorophyll" })).toHaveLength(1);
    expect(screen.getAllByText("6CO2 + 6H2O → C6H12O6 + 6O2")).toHaveLength(1);
    expect(screen.getAllByText("IN SHORT")).toHaveLength(1);
  });

  it("puts the key terms and the equations under Expand, and not IN SHORT", () => {
    render(<TextSegment content={boxes} density={DENSITY.EXPAND} />);

    expect(screen.getByText("chlorophyll")).toBeInTheDocument();
    expect(screen.getByText("glucose")).toBeInTheDocument();
    expect(screen.getByText("Word equation")).toBeInTheDocument();
    expect(screen.getByText("6CO2 + 6H2O → C6H12O6 + 6O2")).toBeInTheDocument();
    expect(screen.queryByText("IN SHORT")).toBeNull();
  });

  it("gives an equation with no label no heading of its own", () => {
    render(<TextSegment content={boxes} density={DENSITY.EXPAND} />);

    const unlabelled = screen.getByText("6CO2 + 6H2O → C6H12O6 + 6O2").parentElement!;
    expect(visibleText(unlabelled)).toBe("6CO2 + 6H2O → C6H12O6 + 6O2");
  });

  it("draws the key points under Slower too, with the terms and equations (Lydia, 26 Oct #2)", () => {
    // "Pace and content are separate, and a child who needs more time should
    // not get less support."
    render(<TextSegment content={boxes} density={DENSITY.SLOWER} />);

    const box = screen.getByText("IN SHORT").parentElement!;
    expect(visibleText(box)).toBe("IN SHORT Plants feed themselves. Light is the fuel.");
    expect(screen.getByText("chlorophyll")).toBeInTheDocument();
    expect(screen.getByText("6CO2 + 6H2O → C6H12O6 + 6O2")).toBeInTheDocument();
  });

  it("draws no box at all where the payload sent nothing", () => {
    render(<TextSegment content={content()} density={null} />);

    expect(screen.queryByText("IN SHORT")).toBeNull();
  });
});

describe("a key term's definition, in place when tapped (design, 9 Oct)", () => {
  /*
   * "A definition appears in place when the child taps the term. Not a
   * glossary, not a separate screen, and not permanently expanded."
   */
  const terms = content({
    keyTerms: [
      { term: "chlorophyll", definition: "The green colour in a leaf." },
      { term: "glucose", definition: "The sugar a plant makes." },
      { term: "leaf" },
    ],
  });
  const chip = (name: string) => screen.getByRole("button", { name });

  it("names each chip on the button itself, and leaves a term with no definition plain", () => {
    // 20 Oct production run: the chips read as buttons with no name, the
    // term only in the inner span that draws the chip.
    render(<TextSegment content={terms} density={null} />);

    expect(chip("chlorophyll")).toHaveAttribute("aria-label", "chlorophyll");
    expect(chip("glucose")).toHaveAttribute("aria-label", "glucose");
    expect(screen.queryByRole("button", { name: "leaf" })).toBeNull();
    expect(screen.getByText("leaf").tagName).toBe("SPAN");
  });

  it("is closed until the child taps the term", () => {
    render(<TextSegment content={terms} density={null} />);

    expect(screen.queryByText("The green colour in a leaf.")).toBeNull();
    expect(chip("chlorophyll")).toHaveAttribute("aria-expanded", "false");
  });

  it("opens under the terms on a tap, and says which term opened it", () => {
    render(<TextSegment content={terms} density={null} />);

    fireEvent.click(chip("chlorophyll"));

    const definition = screen.getByText("The green colour in a leaf.");
    expect(chip("chlorophyll")).toHaveAttribute("aria-expanded", "true");
    expect(chip("chlorophyll")).toHaveAttribute("aria-controls", definition.id);
  });

  it("opens in the frame's panel: soft violet, 10px corners, 14px on 1.5", () => {
    // Lesson Player frame, 13 Oct. It was a bare paragraph in the body type.
    render(<TextSegment content={terms} density={null} />);

    fireEvent.click(chip("chlorophyll"));

    const panel = screen.getByText("The green colour in a leaf.").className;
    expect(panel).toMatch(/(^|\s)bg-nevo-violet\/14(\s|$)/);
    expect(panel).toMatch(/(^|\s)rounded-\[10px\](\s|$)/);
    expect(panel).toMatch(/(^|\s)px-\[15px\](\s|$)/);
    expect(panel).toMatch(/(^|\s)py-\[13px\](\s|$)/);
    expect(panel).toMatch(/(^|\s)text-sm(\s|$)/);
    expect(panel).toMatch(/(^|\s)leading-\[1\.5\](\s|$)/);
    expect(panel).toMatch(/(^|\s)text-nevo-near-black(\s|$)/);
  });

  it("draws a closed term as an outline and the open one in navy (D190)", () => {
    // "An open key-term chip reads differently from a closed one (navy fill
    // open, outline closed)." Both were the same violet fill.
    render(<TextSegment content={terms} density={null} />);
    const drawn = (name: string) => screen.getByText(name).className;
    const outline = (c: string) => {
      expect(c).toMatch(/(^|\s)border-\[1\.5px\](\s|$)/);
      expect(c).toMatch(/(^|\s)border-nevo-violet\/60(\s|$)/);
      expect(c).toMatch(/(^|\s)bg-transparent(\s|$)/);
      expect(c).toMatch(/(^|\s)text-nevo-navy(\s|$)/);
    };

    outline(drawn("chlorophyll"));
    outline(drawn("glucose"));

    fireEvent.click(chip("chlorophyll"));

    const open = drawn("chlorophyll");
    expect(open).toMatch(/(^|\s)bg-nevo-navy(\s|$)/);
    expect(open).toMatch(/(^|\s)border-nevo-navy(\s|$)/);
    expect(open).toMatch(/(^|\s)text-nevo-cream(\s|$)/);
    expect(open).not.toMatch(/bg-transparent|border-nevo-violet/);
    outline(drawn("glucose"));

    // One open at a time: the next tap moves the fill with it.
    fireEvent.click(chip("glucose"));
    outline(drawn("chlorophyll"));
    expect(drawn("glucose")).toMatch(/(^|\s)bg-nevo-navy(\s|$)/);

    // And a second tap on it closes it back to the outline.
    fireEvent.click(chip("glucose"));
    outline(drawn("glucose"));
  });

  it("closes on a second tap", () => {
    render(<TextSegment content={terms} density={null} />);

    fireEvent.click(chip("chlorophyll"));
    fireEvent.click(chip("chlorophyll"));

    expect(screen.queryByText("The green colour in a leaf.")).toBeNull();
    expect(chip("chlorophyll")).toHaveAttribute("aria-expanded", "false");
  });

  it("shows one at a time", () => {
    render(<TextSegment content={terms} density={null} />);

    fireEvent.click(chip("chlorophyll"));
    fireEvent.click(chip("glucose"));

    expect(screen.queryByText("The green colour in a leaf.")).toBeNull();
    expect(screen.getByText("The sugar a plant makes.")).toBeInTheDocument();
    expect(chip("chlorophyll")).toHaveAttribute("aria-expanded", "false");
  });

  it("takes reading support's type inside the frame's panel, never smaller", () => {
    render(<TextSegment content={terms} density={null} reading />);

    fireEvent.click(chip("glucose"));

    const definition = screen.getByText("The sugar a plant makes.");
    expect(definition.className).toMatch(/(^|\s)text-\[18px\]/);
    expect(definition.className).toMatch(/(^|\s)leading-\[2\]/);
    expect(definition.className).not.toMatch(/(^|\s)text-sm(\s|$)/);
    expect(definition.className).toMatch(/(^|\s)bg-nevo-violet\/14(\s|$)/);
    expect(definition.className).not.toMatch(/bg-\[#e5dfd3\]/);
  });

  it("leaves a term with no definition a plain chip, with nothing to open", () => {
    render(<TextSegment content={terms} density={null} />);

    expect(screen.getByText("leaf").closest("button")).toBeNull();
    // Not drawn as the outline a term that opens has.
    expect(screen.getByText("leaf").className).not.toMatch(
      /border-nevo-violet/,
    );
  });

  it("is touched at 44px though drawn at the frame's size", () => {
    render(<TextSegment content={terms} density={null} />);

    expect(chip("glucose").className).toMatch(/\bh-11\b/);
    expect(chip("glucose").className).toMatch(/cursor-pointer/);
  });

  it("rings the round chip when focused, not the square hit area around it", () => {
    // The console's ring outlined the 44px button: a square box round a pill.
    // jsdom has no :focus-visible, so it is asserted where it lives.
    render(<TextSegment content={terms} density={null} />);

    const hit = chip("glucose");
    expect(hit.className).toMatch(/(^|\s)group(\s|$)/);
    expect(hit.className).toMatch(/focus-visible:outline-none/);
    const drawn = screen.getByText("glucose");
    expect(drawn).not.toBe(hit);
    expect(drawn.className).toMatch(/rounded-full/);
    expect(drawn.className).toMatch(/group-focus-visible:outline-2/);
    expect(drawn.className).toMatch(/group-focus-visible:outline-nevo-navy/);
  });
});

describe("a body written in paragraphs (frames 17 and 17c)", () => {
  /*
   * A body, or a depth variant, that leaves a blank line between paragraphs
   * was drawn as one block: HTML folds the break away. Frame 17 draws Expand
   * as two paragraphs, and 17c's "No boundaries" passage as paragraphs too.
   */
  const FIRST = "Plants make their own food.";
  const SECOND = "They use sunlight to do it.";
  const written = `${FIRST}\n\n${SECOND}`;

  it("draws each paragraph of the standard body as its own, and counts none", () => {
    const { container } = render(
      <TextSegment content={content({ body: { default: written } })} density={null} />,
    );

    const first = screen.getByText(FIRST);
    const second = screen.getByText(SECOND);
    expect(first.tagName).toBe("P");
    expect(second.tagName).toBe("P");
    expect(first).not.toBe(second);
    expect(second.className).toMatch(/\bmt-3\.5\b/);
    expect(visibleText(container)).not.toMatch(/\d+ of \d+|\bparagraph\b/i);
  });

  it("does the same for a depth variant", () => {
    render(
      <TextSegment
        content={content({ body: { default: BODY, [DENSITY.EXPAND]: written } })}
        density={DENSITY.EXPAND}
      />,
    );

    expect(screen.getByText(FIRST)).not.toBe(screen.getByText(SECOND));
  });

  it("keeps them on the one softer card under reading support", () => {
    render(
      <TextSegment content={content({ body: { default: written } })} density={null} reading />,
    );

    const card = screen.getByText(FIRST).parentElement!;
    expect(card.className).toMatch(/bg-\[#e5dfd3\]/);
    expect(screen.getByText(SECOND).parentElement).toBe(card);
    expect(screen.getByText(SECOND).className).toMatch(/(^|\s)text-\[18px\]/);
    expect(screen.getByText(SECOND).className).toMatch(/(^|\s)leading-\[2\]/);
  });

  it("does the same inside a server chunk", () => {
    const chunks = [
      { id: "c1", text: written },
      { id: "c2", text: "Oxygen is what they give out." },
    ];
    render(
      <TextSegment
        content={content({ body: { default: `${written} Oxygen is what they give out.` }, readingChunks: chunks })}
        density={null}
      />,
    );

    expect(screen.getByText(FIRST)).not.toBe(screen.getByText(SECOND));
    expect(screen.getByText(FIRST).closest("[data-chunk-id]")).toHaveAttribute(
      "data-chunk-id",
      "c1",
    );
  });
});

describe("reading support in the boxes (frame 17, UDL · reading)", () => {
  const boxed = content({
    keyPoints: ["Plants feed themselves."],
    equations: [{ equation: "Carbon dioxide + Water → Glucose + Oxygen" }],
    callouts: { default: { label: "Remember", text: "Light is the fuel." } },
  });

  it("sets IN SHORT, the equation and the callout at the reading size", () => {
    render(<TextSegment content={boxed} density={null} reading />);

    for (const words of [
      "Plants feed themselves.",
      "Carbon dioxide + Water → Glucose + Oxygen",
      "Light is the fuel.",
    ]) {
      const line = screen.getByText(words);
      expect(line.className).toMatch(/(^|\s)text-\[18px\]/);
      expect(line.className).toMatch(/tracking-\[0\.02em\]/);
      // The box's own line height, as the frame keeps it.
      expect(line.className).toMatch(/leading-\[1\.7\]/);
    }
  });

  it("never shrinks the body or a box: each is the larger of its size and 18px", () => {
    // Frame 17 sets the reading body at Math.max(L.body, 18). Put in place of
    // the standard type, reading support took the desktop body from 19px to
    // 18 while IN SHORT and the equation stayed at 19.
    render(<TextSegment content={boxed} density={null} reading />);

    for (const words of [BODY, "Plants feed themselves.", "Light is the fuel."]) {
      const line = screen.getByText(words).className;
      expect(line).toMatch(/(^|\s)text-\[18px\]/);
      expect(line).toMatch(/(^|\s)sm:text-\[18px\]/);
      expect(line).toMatch(/(^|\s)lg:text-\[19px\]/);
    }
  });

  it("reaches Slower's step cards, which frame 17 sizes like the body", () => {
    const stepped = content({ slowerSteps: ["A plant makes its own food."] });
    render(<TextSegment content={stepped} density={DENSITY.SLOWER} reading />);

    const step = screen.getByText("A plant makes its own food.").className;
    expect(step).toMatch(/(^|\s)text-\[18px\]/);
    expect(step).toMatch(/(^|\s)lg:text-\[19px\]/);
    expect(step).toMatch(/tracking-\[0\.02em\]/);
    // The card's own line height, as the frame keeps it.
    expect(step).toMatch(/(^|\s)leading-\[1\.6\]/);
  });

  it("leaves them at the standard size without it", () => {
    render(<TextSegment content={boxed} density={null} />);

    const line = screen.getByText("Plants feed themselves.");
    expect(line.className).toMatch(/(^|\s)text-base\b/);
    expect(line.className).not.toMatch(/tracking-\[0\.02em\]/);
  });
});

describe("a key term under Simplify still behaves as it does beside the standard text", () => {
  const simpler = content({
    body: { default: BODY, [DENSITY.SIMPLIFY]: "Plants feed themselves on light." },
    keyTerms: [
      { term: "chlorophyll", definition: "The green colour in a leaf." },
      { term: "glucose", definition: "The sugar a plant makes." },
    ],
    equations: [{ equation: "Carbon dioxide + Water → Glucose + Oxygen" }],
  });
  const chip = (name: string) => screen.getByRole("button", { name });

  it("opens one definition at a time, and closes it on a second tap", () => {
    render(<TextSegment content={simpler} density={DENSITY.SIMPLIFY} />);

    fireEvent.click(chip("chlorophyll"));
    expect(screen.getByText("The green colour in a leaf.")).toBeInTheDocument();
    fireEvent.click(chip("glucose"));
    expect(screen.queryByText("The green colour in a leaf.")).toBeNull();
    expect(screen.getByText("The sugar a plant makes.")).toBeInTheDocument();
    expect(chip("chlorophyll")).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(chip("glucose"));
    expect(screen.queryByText("The sugar a plant makes.")).toBeNull();
  });

  it("takes reading support in the definition and the equation", () => {
    render(<TextSegment content={simpler} density={DENSITY.SIMPLIFY} reading />);

    fireEvent.click(chip("glucose"));

    const definition = screen.getByText("The sugar a plant makes.").className;
    expect(definition).toMatch(/(^|\s)text-\[18px\]/);
    expect(definition).toMatch(/(^|\s)leading-\[2\]/);
    const equation = screen.getByText("Carbon dioxide + Water → Glucose + Oxygen").className;
    expect(equation).toMatch(/(^|\s)text-\[18px\]/);
    expect(equation).toMatch(/tracking-\[0\.02em\]/);
  });
});

describe("an authored callout, under a view with or without its own", () => {
  /*
   * The same rule as the equations: a density's callout stood in the
   * standard view's place, so a reshape with none of its own took the
   * standard's callout off the screen, and a callout can be an equation.
   */
  const RULE = { label: "THE RULE", text: "a/c + b/c = (a + b)/c" };
  const IN_SHORT = { label: "IN SHORT", text: "Same bottom number → add the tops." };
  const ruled = (over: Partial<TextContent> = {}) =>
    content({
      body: {
        default: BODY,
        [DENSITY.SIMPLIFY]: "Same bottom? Add the tops.",
        [DENSITY.EXPAND]: `${BODY} Much more here.`,
      },
      callouts: { default: RULE },
      ...over,
    });

  it("keeps the standard view's callout under every reshape", () => {
    for (const density of [DENSITY.SIMPLIFY, DENSITY.EXPAND, DENSITY.SLOWER]) {
      const { unmount } = render(<TextSegment content={ruled()} density={density} />);

      expect(screen.getAllByText(RULE.text), density).toHaveLength(1);
      unmount();
    }
  });

  it("draws a view's own callout after it, not in its place", () => {
    render(
      <TextSegment
        content={ruled({ callouts: { default: RULE, [DENSITY.SIMPLIFY]: IN_SHORT } })}
        density={DENSITY.SIMPLIFY}
      />,
    );

    const rule = screen.getByText(RULE.text);
    const own = screen.getByText(IN_SHORT.text);
    expect(rule.compareDocumentPosition(own) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("draws a view's own callout alone where the standard view has none", () => {
    render(
      <TextSegment
        content={ruled({ callouts: { [DENSITY.SIMPLIFY]: IN_SHORT } })}
        density={DENSITY.SIMPLIFY}
      />,
    );

    expect(screen.getAllByText(IN_SHORT.text)).toHaveLength(1);
    expect(screen.queryByText(RULE.text)).toBeNull();
  });

  it("never draws the same callout twice", () => {
    for (const density of [null, DENSITY.SIMPLIFY]) {
      const { unmount } = render(
        <TextSegment
          content={ruled({ callouts: { default: RULE, [DENSITY.SIMPLIFY]: { ...RULE } } })}
          density={density}
        />,
      );

      expect(screen.getAllByText(RULE.text), String(density)).toHaveLength(1);
      unmount();
    }
  });
});
