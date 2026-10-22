import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import {
  useRuntimeAdaptation,
  type RuntimeState,
} from "./useRuntimeAdaptation";
import type { Lesson } from "@/lib/types";

/**
 * `adjustmentDisposition` (backend 864dff0; Teslim, 22 Oct, answer 3):
 * "Please honour retain even when proactiveAdjustment is null; null alone no
 * longer means dismiss." `apply` shows the new instruction, `retain` keeps
 * what is on screen, `clear` - the contract's default - removes it. Active
 * help is resent with its existing decision id.
 */

const { getAdaptation } = vi.hoisted(() => ({ getAdaptation: vi.fn() }));
vi.mock("@/lib/api", () => ({ intelligenceApi: { getAdaptation } }));

const LESSON = {
  id: "9c1e77aa-1111-4222-8333-444455556666",
  title: "Fractions",
  segments: [
    { id: "seg-1", modalities: ["text"] },
    { id: "seg-2", modalities: ["text"] },
  ],
} as unknown as Lesson;
const SEGMENTS = [
  { segmentId: "seg-1", availableModalities: ["text"] },
  { segmentId: "seg-2", availableModalities: ["text"] },
];
const SESSION = "5b1e0c3a-aaaa-4bbb-8ccc-ddddeeeeffff";
const D1 = "11111111-2222-4333-8444-555555555555";
const HINT = "Look at the bottom number first.";

const answer = (over: Record<string, unknown> = {}) => ({
  lessonId: LESSON.id,
  source: "rule_based",
  segments: [
    { segmentId: "seg-1", modality: "text", scaffolding: "light" },
    { segmentId: "seg-2", modality: "text", scaffolding: "light" },
  ],
  breakSuggestion: { breakType: null, reason: null },
  proactiveAdjustment: null,
  modalitySuggestion: null,
  ...over,
});
const hint = (text = HINT, segmentId = "seg-1") => ({
  action: "offer_hint",
  reason: "Two marked misses on this question.",
  hint: text,
  segmentId,
});
const applied = (adjustment: unknown) =>
  answer({
    proactiveAdjustment: adjustment,
    decisionId: D1,
    adjustmentDisposition: "apply",
  });

const STATE: RuntimeState = {
  currentSegmentId: "seg-1",
  currentModality: "text",
  availableModalities: ["text"],
  midpointReached: false,
  replayCountOnSegment: 0,
  consecutiveErrors: 0,
  declinedModalities: [],
  sessionDeclineCount: 0,
  sameSegmentSuggestionShown: false,
  segmentsSinceLastSuggestion: null,
  breaksTaken: 0,
};

/**
 * The engine answers `first`, then each of `then` in turn, one per miss on
 * the section - each miss a reason to ask again; an Error is an ask that
 * failed. Returns the hook after the last answer has landed.
 */
const answers = async (
  first: unknown,
  then: unknown[],
  section: (ask: number) => string = () => "seg-1",
) => {
  getAdaptation.mockResolvedValueOnce(first);
  const view = renderHook(
    ({ s }: { s: RuntimeState }) =>
      useRuntimeAdaptation(LESSON.id, SEGMENTS as never, true, SESSION, s, LESSON),
    { initialProps: { s: STATE } },
  );
  await waitFor(() => expect(view.result.current.plan).not.toBeNull());
  for (const [i, next] of then.entries()) {
    if (next instanceof Error) getAdaptation.mockRejectedValueOnce(next);
    else getAdaptation.mockResolvedValueOnce(next);
    view.rerender({
      s: {
        ...STATE,
        currentSegmentId: section(i + 1),
        consecutiveErrors: i + 1,
      },
    });
    await waitFor(() => expect(getAdaptation).toHaveBeenCalledTimes(i + 2));
    await act(async () => {});
  }
  return view.result;
};

afterEach(() => {
  cleanup();
  getAdaptation.mockReset();
});

describe("retain keeps the help on screen", () => {
  it("keeps the hint when the answer carries no instruction", async () => {
    const result = await answers(applied(hint()), [
      answer({ adjustmentDisposition: "retain" }),
    ]);

    expect(result.current.plan?.adjustment).toBe("offer_hint");
    expect(result.current.plan?.hint).toBe(HINT);
    expect(result.current.forSegmentId).toBe("seg-1");
  });

  it("keeps a Simplify through a cooldown that says retain", async () => {
    const result = await answers(
      applied({ action: "simplify", reason: "r", segmentId: "seg-1" }),
      [
        answer({
          adjustmentDisposition: "retain",
          suppressedAttempt: { reason: "adaptation_cooldown" },
          cooldownUntil: "2026-10-22T12:02:00Z",
        }),
      ],
    );

    expect(result.current.plan?.adjustment).toBe("simplify");
  });

  it("keeps the panel's questions and prompts", async () => {
    const result = await answers(
      applied({
        action: "show_socratic_panel",
        reason: "r",
        guidedQuestions: ["What does the top count?"],
        guidedPrompts: [{ id: "gq-0", prompt: "What does the top count?" }],
        segmentId: "seg-1",
      }),
      [answer({ adjustmentDisposition: "retain" })],
    );

    expect(result.current.plan?.adjustment).toBe("show_socratic_panel");
    expect(result.current.plan?.guidedQuestions).toEqual([
      "What does the top count?",
    ]);
    expect(result.current.plan?.guidedPrompts).toEqual([
      { id: "gq-0", prompt: "What does the top count?" },
    ]);
  });

  it("keeps it through one retain after another", async () => {
    const result = await answers(applied(hint()), [
      answer({ adjustmentDisposition: "retain" }),
      answer({ adjustmentDisposition: "retain" }),
    ]);

    expect(result.current.plan?.hint).toBe(HINT);
  });

  it("takes the help resent under its decision id as the answer's own", async () => {
    const result = await answers(applied(hint()), [
      answer({
        proactiveAdjustment: hint(),
        decisionId: D1,
        adjustmentDisposition: "retain",
      }),
    ]);

    expect(result.current.plan?.adjustment).toBe("offer_hint");
    expect(result.current.plan?.hint).toBe(HINT);
  });

  it("takes what a retain resends over what was held - an answer missed in between", async () => {
    // The engine moved on to a second hint under an answer that never landed
    // here; its retain resends that one, and that is what is active.
    const result = await answers(applied(hint()), [
      new Error("offline"),
      answer({
        proactiveAdjustment: hint("Count the parts first."),
        decisionId: "99999999-2222-4333-8444-555555555555",
        adjustmentDisposition: "retain",
      }),
    ]);

    expect(result.current.plan?.hint).toBe("Count the parts first.");
  });

  it("keeps only the help: the rows are the retaining answer's", async () => {
    const result = await answers(applied(hint()), [
      answer({
        adjustmentDisposition: "retain",
        segments: [
          { segmentId: "seg-1", modality: "text", scaffolding: "strong" },
        ],
      }),
    ]);

    expect(result.current.plan?.hint).toBe(HINT);
    expect(result.current.plan?.segments).toEqual([
      expect.objectContaining({ segmentId: "seg-1", scaffold: "full" }),
    ]);
  });
});

describe("retain is about the section it was answered for", () => {
  it("keeps nothing of another section's help", async () => {
    const result = await answers(
      applied(hint()),
      [answer({ adjustmentDisposition: "retain" })],
      () => "seg-2",
    );

    expect(result.current.plan?.adjustment).toBeUndefined();
    expect(result.current.plan?.hint).toBeUndefined();
    expect(result.current.forSegmentId).toBe("seg-2");
  });

  it("invents nothing when nothing is held", async () => {
    const result = await answers(answer({ adjustmentDisposition: "retain" }), []);

    expect(result.current.plan?.adjustment).toBeUndefined();
  });
});

describe("clear and apply", () => {
  it("clear removes the help", async () => {
    const result = await answers(applied(hint()), [
      answer({ adjustmentDisposition: "clear" }),
    ]);

    expect(result.current.plan?.adjustment).toBeUndefined();
    expect(result.current.plan?.hint).toBeUndefined();
  });

  it("no disposition is the contract's default, clear", async () => {
    const result = await answers(applied(hint()), [answer()]);

    expect(result.current.plan?.adjustment).toBeUndefined();
  });

  it("clear removes help a retain kept", async () => {
    const result = await answers(applied(hint()), [
      answer({ adjustmentDisposition: "retain" }),
      answer({ adjustmentDisposition: "clear" }),
    ]);

    expect(result.current.plan?.adjustment).toBeUndefined();
  });

  it("apply replaces help a retain kept", async () => {
    const result = await answers(applied(hint()), [
      answer({ adjustmentDisposition: "retain" }),
      answer({
        proactiveAdjustment: { action: "simplify", reason: "r", segmentId: "seg-1" },
        decisionId: "99999999-2222-4333-8444-555555555555",
        adjustmentDisposition: "apply",
      }),
    ]);

    expect(result.current.plan?.adjustment).toBe("simplify");
    expect(result.current.plan?.hint).toBeUndefined();
  });

  it("apply shows the new instruction in place of the old", async () => {
    const result = await answers(applied(hint()), [
      answer({
        proactiveAdjustment: hint("Count the parts first."),
        decisionId: "99999999-2222-4333-8444-555555555555",
        adjustmentDisposition: "apply",
      }),
    ]);

    expect(result.current.plan?.hint).toBe("Count the parts first.");
  });
});
