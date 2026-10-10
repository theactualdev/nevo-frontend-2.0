import { describe, expect, it } from "vitest";
import { atLowerDepth } from "./lowerDepth";
import type { Lesson } from "@/lib/types";

/**
 * SCRUM-178, backend 9 Oct: a lower-depth session uses each segment's
 * simplified version where it has one, and the normal body where it has not.
 */

const LESSON = {
  id: "lesson-1",
  title: "Fractions",
  segments: [
    {
      id: "seg-1",
      modalities: ["text"],
      text: {
        heading: "Numerators",
        body: {
          default: "The standard text.",
          simplify: "Short.",
          expand: "Longer, with more.",
        },
      },
    },
    {
      id: "seg-2",
      modalities: ["text"],
      text: { heading: "Denominators", body: { default: "Only one version." } },
    },
    { id: "seg-3", modalities: ["audio"], audio: { title: "Listen" } },
  ],
} as unknown as Lesson;

describe("a lower-depth session", () => {
  it("reads the simplified version as the segment's own text", () => {
    const { lesson } = atLowerDepth(LESSON);

    expect(lesson.segments[0].text?.body.default).toBe("Short.");
  });

  it("offers no Simplify over it, and keeps Expand the child's to ask for", () => {
    const { lesson } = atLowerDepth(LESSON);

    expect(lesson.segments[0].text?.body).not.toHaveProperty("simplify");
    expect(lesson.segments[0].text?.body.expand).toBe("Longer, with more.");
  });

  it("falls back to the normal body where there is no simplified version", () => {
    const { lesson, simplified } = atLowerDepth(LESSON);

    expect(lesson.segments[1].text?.body.default).toBe("Only one version.");
    expect(lesson.segments[2]).toBe(LESSON.segments[2]);
    expect([...simplified]).toEqual(["seg-1"]);
  });

  it("leaves the lesson it was given alone", () => {
    atLowerDepth(LESSON);

    expect(LESSON.segments[0].text?.body.default).toBe("The standard text.");
    expect(LESSON.segments[0].text?.body.simplify).toBe("Short.");
  });

  it("is the same lesson where nothing has a simpler version", () => {
    const plain = { ...LESSON, segments: LESSON.segments.slice(1) } as Lesson;

    expect(atLowerDepth(plain).lesson).toBe(plain);
    expect(atLowerDepth(plain).simplified.size).toBe(0);
  });
});
