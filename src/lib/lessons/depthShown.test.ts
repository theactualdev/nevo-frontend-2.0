import { describe, expect, it } from "vitest";
import { depthShown } from "./depthShown";
import type { LessonSegment } from "@/lib/types";

/**
 * `depthShown` (B45): the text version actually on screen, on every segment.
 * Read back as evidence about what a child saw, so it follows what
 * `TextSegment` renders and never what was asked for.
 */

const segment = (body: Record<string, string>): LessonSegment =>
  ({
    id: "seg-1",
    modalities: ["text", "audio"],
    text: { heading: "Fractions", body: { default: "The standard text.", ...body } },
    audio: { title: "Fractions", transcript: "Read aloud." },
  }) as unknown as LessonSegment;

const BOTH = segment({ simplify: "Short.", expand: "Longer, with more." });

describe("the text version on screen", () => {
  it("is standard when nothing reshaped it", () => {
    expect(depthShown(BOTH, "text", null)).toBe("standard");
  });

  it("is the reshape when the segment has it", () => {
    expect(depthShown(BOTH, "text", "simplify")).toBe("simplified");
    expect(depthShown(BOTH, "text", "expand")).toBe("expanded");
  });

  it("is standard when the segment cannot deliver what was asked for", () => {
    // TextSegment falls back to the standard body, so that is what was read.
    expect(depthShown(segment({}), "text", "simplify")).toBe("standard");
    expect(depthShown(segment({}), "text", "expand")).toBe("standard");
  });

  it("is standard under Slower, which paces the words rather than changing them", () => {
    expect(depthShown(BOTH, "text", "slower")).toBe("standard");
  });

  it("is standard in a modality that has one version only", () => {
    expect(depthShown(BOTH, "audio", "simplify")).toBe("standard");
    expect(depthShown(BOTH, "visual", "expand")).toBe("standard");
  });
});

describe("in a lower-depth session (SCRUM-178)", () => {
  // The segment's own text is its simpler version there - see `atLowerDepth`.
  const LOWER = segment({ expand: "Longer, with more." });

  it("is simplified where the segment's own text is the simpler version", () => {
    expect(depthShown(LOWER, "text", null, true)).toBe("simplified");
    expect(depthShown(LOWER, "text", "slower", true)).toBe("simplified");
  });

  it("is still what the child asked for when they asked for more", () => {
    expect(depthShown(LOWER, "text", "expand", true)).toBe("expanded");
  });

  it("is standard where there was no simpler version, or nothing to read", () => {
    expect(depthShown(LOWER, "text", null, false)).toBe("standard");
    expect(depthShown(LOWER, "audio", null, true)).toBe("standard");
  });
});
