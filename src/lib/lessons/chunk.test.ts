import { describe, expect, it } from "vitest";
import { bodyParts, chunkBody, isChunkable } from "./chunk";

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
 * These pin the gate rather than the prettiness of the split. Offering a
 * control that does nothing is the failure mode: the child asks for less at a
 * time, gets the same screen, and learns the control is a lie.
 */

const three =
  "Plants need light to grow. The leaf catches it. Sugar is what they make.";

describe("how much arrives at once", () => {
  it("groups a multi-sentence body into at most three parts", () => {
    expect(chunkBody(three)).toHaveLength(3);
    // Five sentences still land in three parts, not five: the cap is about how
    // many taps a child makes, not how many sentences there were.
    expect(chunkBody("A one. B two. C three. D four. E five.")).toHaveLength(3);
  });

  it("loses no words", () => {
    // The whole premise is that this is presentation and not content. A split
    // that drops a sentence would be the frontend editing the lesson.
    const words = (s: string) => s.split(/\s+/).filter(Boolean);
    expect(words(chunkBody(three).join(" "))).toEqual(words(three));
  });

  it("keeps sentences whole", () => {
    for (const part of chunkBody(three)) {
      expect(part.trim()).toMatch(/[.!?]$/);
    }
  });

  it("offers nothing for a body it cannot actually break up", () => {
    // The gate. A one-sentence segment chunks to itself, so Slower must not
    // appear on it.
    expect(isChunkable("Plants need light to grow.")).toBe(false);
    expect(chunkBody("Plants need light to grow.")).toEqual([
      "Plants need light to grow.",
    ]);
  });

  it("offers nothing for an absent body", () => {
    // Rule 5: absence is an instruction. A segment with no text is not a
    // segment to offer a reading control on.
    expect(isChunkable(undefined)).toBe(false);
    expect(isChunkable(null)).toBe(false);
    expect(isChunkable("")).toBe(false);
  });

  it("offers the control as soon as there are two sentences", () => {
    expect(isChunkable("The leaf catches light. Sugar is what they make.")).toBe(
      true,
    );
  });
});

describe("the server's reading chunks, where it sent them (SCRUM-234)", () => {
  /*
   * Where the breaks fall is the backend's now (SCRUM-236). B23's on-device
   * split was its rule for a client that had to make its own, and it gives
   * way to the server's chunks rather than running beside them.
   */
  const server = [
    { text: "Plants need light to grow." },
    { text: "The leaf catches it. Sugar is what they make." },
  ];

  it("are the parts, as sent, where there are any", () => {
    expect(bodyParts(three, server)).toEqual([
      "Plants need light to grow.",
      "The leaf catches it. Sugar is what they make.",
    ]);
  });

  it("leave the on-device split to a body that came with none", () => {
    expect(bodyParts(three, [])).toEqual(chunkBody(three));
    expect(bodyParts(three)).toEqual(chunkBody(three));
  });

  it("offer Slower when they break the body", () => {
    expect(isChunkable(three, server)).toBe(true);
  });

  it("offer nothing for a body the server sent as one chunk", () => {
    // Three sentences would split on the device. The server says one block,
    // so a Slower that splits it anyway would be the client overruling it.
    expect(isChunkable(three, [{ text: three }])).toBe(false);
  });
});
