import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { useRuntimeAdaptation } from "./useRuntimeAdaptation";
import type { Lesson } from "@/lib/types";

/**
 * The mid-lesson answer carries the same instruction, hint, questions,
 * scaffolding and suggestion as the load-time one - and only the break
 * suggestion was kept. These pin that the rest now reaches the player.
 */

const { getAdaptation } = vi.hoisted(() => ({ getAdaptation: vi.fn() }));
vi.mock("@/lib/api", () => ({ intelligenceApi: { getAdaptation } }));

const LESSON = {
  id: "9c1e77aa-1111-4222-8333-444455556666",
  title: "Fractions",
  segments: [{ id: "seg-1", modalities: ["text"] }],
} as unknown as Lesson;
const SEGMENTS = [{ segmentId: "seg-1", availableModalities: ["text"] }];

const answer = (over: Record<string, unknown> = {}) => ({
  lessonId: LESSON.id,
  source: "rule_based",
  segments: [{ segmentId: "seg-1", modality: "text", scaffolding: "light" }],
  breakSuggestion: { breakType: null, reason: null },
  proactiveAdjustment: null,
  modalitySuggestion: null,
  ...over,
});

const run = () =>
  renderHook(() =>
    useRuntimeAdaptation(
      LESSON.id,
      SEGMENTS as never,
      true,
      {
        currentSegmentId: "seg-1",
        currentModality: "text",
        availableModalities: ["text"],
        midpointReached: false,
      },
      LESSON,
    ),
  );

afterEach(() => {
  cleanup();
  getAdaptation.mockReset();
});

describe("what the engine says mid-lesson", () => {
  it("keeps its instruction, not only its break", async () => {
    getAdaptation.mockResolvedValue(
      answer({
        proactiveAdjustment: {
          action: "offer_hint",
          hint: "Look at the bottom number first.",
        },
      }),
    );

    const { result } = run();

    await waitFor(() => expect(result.current.plan).not.toBeNull());
    expect(result.current.plan?.adjustment).toBe("offer_hint");
    expect(result.current.plan?.hint).toBe("Look at the bottom number first.");
  });

  it("says which segment it was asked for, so its hint stays there", async () => {
    // The instruction is lesson-level on the wire; the request is not.
    getAdaptation.mockResolvedValue(
      answer({ proactiveAdjustment: { action: "offer_hint", hint: "Look down." } }),
    );

    const { result } = run();

    await waitFor(() => expect(result.current.plan).not.toBeNull());
    expect(result.current.forSegmentId).toBe("seg-1");
  });

  it("gets the load-time clamps - no reasoning crosses", async () => {
    getAdaptation.mockResolvedValue(
      answer({
        proactiveAdjustment: {
          action: "simplify",
          reason: "struggling",
          confidence: 0.8,
        },
      }),
    );

    const { result } = run();

    await waitFor(() => expect(result.current.plan).not.toBeNull());
    expect(JSON.stringify(result.current.plan)).not.toMatch(
      /struggling|confidence/,
    );
  });

  it("is not read as 'the engine now says nothing' when the call fails", async () => {
    getAdaptation.mockRejectedValue(new Error("offline"));

    const { result } = run();

    await waitFor(() => expect(getAdaptation).toHaveBeenCalled());
    expect(result.current.plan).toBeNull();
  });
});
