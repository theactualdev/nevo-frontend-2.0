import { describe, expect, it } from "vitest";
import { chunksForBody, isChunkable } from "./chunk";

/**
 * SLOWER, ON CONTENT NOBODY AUTHORED A RESHAPE FOR.
 *
 * Design's ruling, 17 Sep: "Slower I do not think is a text reshape at all.
 * Slower is about how much arrives at once, which is segmentation and pacing
 * rather than wording." That makes it the one third of the pace control that
 * needs no authored content - and the pace control matters out of proportion
 * to its size, because in a system that deliberately tells a child nothing
 * about what it is doing, it is the only place the child has any agency.
 *
 * These pin the gate. Offering a control that does nothing is the failure
 * mode: the child asks for less at a time, gets the same screen, and learns
 * the control is a lie.
 *
 * AND WHERE A BODY BREAKS IS THE SERVER'S (B114, 13 Oct): "The client must
 * not split text." The parts are its reading chunks or nothing.
 */

const three =
  "Plants need light to grow. The leaf catches it. Sugar is what they make.";

describe("a body the server sent no chunks for (B114)", () => {
  it("is never split on the device, however many sentences it has", () => {
    // Three sentences used to be three parts. Now they are one body.
    expect(isChunkable(three)).toBe(false);
    expect(isChunkable(three, [])).toBe(false);
  });

  it("offers nothing for an absent body", () => {
    // Rule 5: absence is an instruction. A segment with no text is not a
    // segment to offer a reading control on.
    expect(isChunkable(undefined)).toBe(false);
    expect(isChunkable(null)).toBe(false);
    expect(isChunkable("")).toBe(false);
  });
});

describe("the server's reading chunks, where it sent them (SCRUM-234)", () => {
  const server = [
    { text: "Plants need light to grow." },
    { text: "The leaf catches it. Sugar is what they make." },
  ];

  it("offer Slower when they break the body", () => {
    expect(isChunkable(three, server)).toBe(true);
  });

  it("offer nothing for a body the server sent as one chunk", () => {
    expect(isChunkable(three, [{ text: three }])).toBe(false);
  });

  it("are not this body's when they carry other words, and it reads whole", () => {
    // The text on screen is not the one they were cut from - a simpler
    // version standing in for it, say. They describe nothing here, and
    // nothing else breaks it either.
    const other = "Light feeds a plant. It makes sugar. It gives out air.";

    expect(chunksForBody(other, server)).toBeUndefined();
    expect(isChunkable(other, server)).toBe(false);
  });

  it("are this body's whatever the spacing between them", () => {
    expect(chunksForBody(`  ${three}\n`, server)).toBe(server);
  });
});
