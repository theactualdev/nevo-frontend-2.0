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

  it("parts it on the device, as before chunks existed", () => {
    const { container } = render(
      <TextSegment content={standIn} density={null} attention />,
    );

    expect(screen.getByText("Plants feed themselves on light.")).toBeInTheDocument();
    expect(screen.getByText("Part 1 of 3")).toBeInTheDocument();
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
  it("takes its parts from the chunks rather than splitting on the device", () => {
    // On-device, three sentences become three parts too - so two chunks of
    // unequal size is what tells the two apart.
    const two = [
      { id: "c1", text: "Plants make their own food. They use sunlight to do it." },
      { id: "c2", text: "Oxygen is what they give out." },
    ];
    render(
      <TextSegment content={content({ readingChunks: two })} density={null} attention />,
    );

    expect(screen.getByText(two[0].text)).toBeInTheDocument();
    expect(screen.getByText("Part 1 of 2")).toBeInTheDocument();
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
    keyTerms: ["chlorophyll", "glucose"],
    equations: [
      { equation: "Carbon dioxide + Water → Glucose + Oxygen", label: "Word equation" },
      { equation: "6CO2 + 6H2O → C6H12O6 + 6O2" },
    ],
  });

  it("puts the key points under IN SHORT beside the standard body", () => {
    render(<TextSegment content={boxes} density={null} />);

    const box = screen.getByText("IN SHORT").parentElement!;
    expect(visibleText(box)).toBe("IN SHORT Plants feed themselves. Light is the fuel.");
    // Expand's own, not here.
    expect(screen.queryByText("chlorophyll")).toBeNull();
  });

  it("keeps the equations beside the standard body, which may not repeat them", () => {
    // Backend, 9 Oct: an equation callout "is not guaranteed to be repeated
    // in body". Under Expand alone, a child on the standard text lost it.
    render(<TextSegment content={boxes} density={null} />);

    expect(screen.getByText("Word equation")).toBeInTheDocument();
    expect(screen.getByText("6CO2 + 6H2O → C6H12O6 + 6O2")).toBeInTheDocument();
  });

  it("keeps them when the standard body arrives in parts", () => {
    render(<TextSegment content={boxes} density={null} attention />);

    expect(screen.getByText("6CO2 + 6H2O → C6H12O6 + 6O2")).toBeInTheDocument();
  });

  it("draws the frame's Simplify view over a simpler text: IN SHORT, no equation", () => {
    render(<TextSegment content={boxes} density={DENSITY.SIMPLIFY} />);

    expect(screen.getByText("IN SHORT")).toBeInTheDocument();
    expect(screen.queryByText(/6CO2/)).toBeNull();
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

  it("draws no key points or key terms under Slower, and keeps the equations", () => {
    // Slower on a lesson with no authored steps is the standard body in
    // parts, so its equations stay with it.
    render(<TextSegment content={boxes} density={DENSITY.SLOWER} />);

    expect(screen.queryByText("IN SHORT")).toBeNull();
    expect(screen.queryByText("chlorophyll")).toBeNull();
    expect(screen.getByText("6CO2 + 6H2O → C6H12O6 + 6O2")).toBeInTheDocument();
  });

  it("draws no box at all where the payload sent nothing", () => {
    render(<TextSegment content={content()} density={null} />);

    expect(screen.queryByText("IN SHORT")).toBeNull();
  });
});
