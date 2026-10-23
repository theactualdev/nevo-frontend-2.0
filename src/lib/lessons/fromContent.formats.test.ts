import { describe, expect, it } from "vitest";
import { asSourceText, lessonFromContent } from "./fromContent";
import type {
  LessonDetailResponse,
  LessonSegment as ContentSegment,
} from "@/lib/api/lessons";

/**
 * SCRUM-272 and K4, on the lesson read (21 Oct): each section's formats and
 * the engine's recommendation for the format group, and what the child chose
 * in their latest sitting, so a reload opens in it before the first frame.
 */

const picture = (qualityValidated = true) =>
  ({
    type: "ai_generated_image",
    imageUrl: "https://cdn.example/p.png",
    storagePath: "p.png",
    prompt: "",
    provider: "openai",
    reviewedBy: null,
    reviewAttempts: 0,
    generatedAt: "2026-10-21T00:00:00Z",
    caption: "Cells in salt water",
    qualityValidated,
    urlExpiresInSeconds: null,
  }) as never;

const audio = {
  script: "Water moves.",
  audioUrl: "https://cdn.example/a.mp3",
  storagePath: null,
  durationMs: null,
  provider: "yarngpt",
  voice: null,
  format: "mp3",
  requiresAuthentication: false,
  urlExpiresInSeconds: null,
  stepId: null,
} as never;

const segment = (over: Partial<ContentSegment> = {}): ContentSegment =>
  ({
    id: "seg-2",
    segmentKey: "s2",
    contentType: "explanatory_text",
    sequenceOrder: 1,
    title: "Osmosis",
    body: "Water moves through the membrane.",
    availableModalities: ["text", "audio", "visual"],
    comprehensionCheckpoints: [],
    textVariant: null,
    visualVariant: picture(),
    audioVariant: audio,
    interactiveVariant: null,
    calculationVariant: null,
    needsReview: false,
    reviewReasons: [],
    ...over,
  }) as unknown as ContentSegment;

const built = (over: Partial<ContentSegment>) =>
  lessonFromContent({
    id: "lesson-1",
    title: "Osmosis",
    confirmationSummary: null,
    segments: [segment(over)],
  } as unknown as LessonDetailResponse)!.segments[0];

describe("the format group's formats", () => {
  it("are the server's, in its order", () => {
    const seg = built({ availableFormats: ["visual", "audio", "text"] });

    expect(seg.formats).toEqual(["visual", "audio", "text"]);
  });

  it("leave out a picture that failed its own review, whatever the list says", () => {
    const seg = built({
      availableFormats: ["text", "audio", "visual"],
      visualVariant: picture(false),
    });

    expect(seg.formats).toEqual(["text", "audio"]);
  });

  it("carry the recommendation only where it names one of them", () => {
    expect(
      built({ availableFormats: ["text", "audio"], recommendedFormat: "audio" })
        .recommendedFormat,
    ).toBe("audio");
    expect(
      built({ availableFormats: ["text", "audio"], recommendedFormat: "visual" })
        .recommendedFormat,
    ).toBeNull();
    expect(
      built({ availableFormats: ["text", "audio"], recommendedFormat: null })
        .recommendedFormat,
    ).toBeNull();
  });

  it("are absent on a payload from before the field, with no recommendation", () => {
    const seg = built({ recommendedFormat: "audio" });

    expect(seg).not.toHaveProperty("formats");
    expect(seg).not.toHaveProperty("recommendedFormat");
  });

  it("go with a calculation that falls back to its text", () => {
    const seg = asSourceText(
      built({ availableFormats: ["text", "audio"], recommendedFormat: "audio" }),
      "because",
    );

    expect(seg).not.toHaveProperty("formats");
    expect(seg).not.toHaveProperty("recommendedFormat");
  });
});

describe("what the child chose, read for a reload (K4)", () => {
  it("is the section's deliveryPreference", () => {
    const seg = built({
      deliveryPreference: { modality: "audio", depth: null, slower: true },
      primaryModality: "audio",
    });

    expect(seg.chosen).toEqual({ modality: "audio", density: "slower" });
  });

  it("is nothing where nothing was chosen, whatever primaryModality says", () => {
    // The server fills `primaryModality` with the first format when nothing
    // was chosen, so it is not a choice.
    const seg = built({ deliveryPreference: null, primaryModality: "text" });

    expect(seg).not.toHaveProperty("chosen");
  });
});
