import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { toPrompt, useWarmUpPrompt } from "./useWarmUpDimension";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * The warm-up waits for the engine.
 *
 * It started on a weekday rotation and kept it whenever the prompt failed, was
 * unrecognised or was still in flight - and that run was submitted as a
 * measurement the engine never asked for. A signed-in child now gets the
 * engine's task or none; the rotation is for the signed-out walkthrough.
 */

const { recalibratePrompt } = vi.hoisted(() => ({
  recalibratePrompt: vi.fn(),
}));
vi.mock("@/lib/api/baseline", () => ({ baselineApi: { recalibratePrompt } }));

const signIn = () =>
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId: "child-1",
    role: "student",
  });

const served = {
  dimension: "domain",
  itemId: "item-1",
  question: "Which is larger?",
  options: [
    { value: "a", label: "Two-thirds" },
    { value: "b", label: "Three-fifths" },
  ],
  served: true,
};

beforeEach(() => {
  clearSession();
  recalibratePrompt.mockReset();
});

afterEach(() => {
  clearSession();
});

describe("useWarmUpPrompt", () => {
  it("gives a signed-in child no task when the prompt fails", async () => {
    // The rotation ran here, and was submitted.
    signIn();
    recalibratePrompt.mockRejectedValue(new Error("503"));

    const { result } = renderHook(() => useWarmUpPrompt("wmc"));

    await waitFor(() => expect(result.current).toEqual({ state: "none" }));
  });

  it("gives them nothing while the prompt is on its way", () => {
    signIn();
    recalibratePrompt.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useWarmUpPrompt("wmc"));

    expect(result.current).toEqual({ state: "waiting" });
  });

  it("gives them the engine's task and question when it answers", async () => {
    signIn();
    recalibratePrompt.mockResolvedValue(served);

    const { result } = renderHook(() => useWarmUpPrompt("wmc"));

    await waitFor(() =>
      expect(result.current).toMatchObject({
        state: "ready",
        dimension: "domain",
        live: true,
        item: { itemId: "item-1", question: "Which is larger?" },
      }),
    );
    expect(recalibratePrompt).toHaveBeenCalledWith("child-1");
  });

  it("keeps the rotation for the signed-out walkthrough", () => {
    const { result } = renderHook(() => useWarmUpPrompt("ans"));

    expect(result.current).toEqual({
      state: "ready",
      dimension: "ans",
      item: null,
      live: false,
    });
    expect(recalibratePrompt).not.toHaveBeenCalled();
  });

  it("carries the account's done-today answer through (B10)", async () => {
    signIn();
    recalibratePrompt.mockResolvedValue({ ...served, doneToday: true });

    const { result } = renderHook(() => useWarmUpPrompt("wmc"));

    await waitFor(() =>
      expect(result.current).toMatchObject({ state: "ready", doneToday: true }),
    );
  });
});

describe("toPrompt — done today (B10)", () => {
  it("keeps the account's answer either way", () => {
    expect(toPrompt({ ...served, doneToday: true })).toMatchObject({
      doneToday: true,
    });
    expect(toPrompt({ ...served, doneToday: false })).toMatchObject({
      doneToday: false,
    });
  });

  it("keeps it even when there is no task this screen can run", () => {
    // Done is a fact about the child's day, not about the task.
    expect(toPrompt({ ...served, dimension: "mood", doneToday: true })).toEqual(
      { state: "none", doneToday: true },
    );
  });

  it("leaves it unsaid when the deployment does not say, rather than false", () => {
    // Absent and false are different claims; absent lets the device's memory
    // stand in, false would overrule it.
    expect(toPrompt(served)).not.toHaveProperty("doneToday");
  });
});

describe("toPrompt", () => {
  it("never keeps an answer key, should the wire carry one again", () => {
    // The device marks nothing, so it has no use for the key. Backend took it
    // off the prompt on 1 Oct; this holds if it ever comes back.
    const prompt = toPrompt({ ...served, answer: "a" } as typeof served);

    expect(JSON.stringify(prompt)).not.toMatch(/"answer"/);
  });

  it("runs nothing for a dimension that is not one of ours", () => {
    expect(toPrompt({ ...served, dimension: "mood" })).toEqual({
      state: "none",
    });
  });

  it("runs nothing for the question task when no question came", () => {
    // The frame's fixture is not this child's question.
    expect(toPrompt({ ...served, question: "" })).toEqual({ state: "none" });
    expect(toPrompt({ ...served, options: [] })).toEqual({ state: "none" });
  });

  it("runs another dimension's own task when no question was served", () => {
    expect(toPrompt({ dimension: "attention", served: false })).toMatchObject({
      state: "ready",
      dimension: "attention",
      item: null,
    });
  });
});

describe("toPrompt - the served flag decides (B65)", () => {
  it("asks no question the prompt says was not served, whatever text came", () => {
    // `question` and `options` are optional now; text present on an unserved
    // prompt is not a question for this child.
    expect(
      toPrompt({ ...served, dimension: "attention", served: false }),
    ).toMatchObject({ state: "ready", dimension: "attention", item: null });
    expect(toPrompt({ ...served, served: false })).toEqual({ state: "none" });
  });

  it("reads an absent flag as not served, rather than inferring one", () => {
    const { served: _flag, ...unsaid } = served;
    void _flag;

    expect(toPrompt(unsaid)).toEqual({ state: "none" });
    expect(toPrompt({ ...unsaid, dimension: "ps" })).toMatchObject({
      state: "ready",
      item: null,
    });
  });

  it("carries a served question on any dimension, not only the question task", () => {
    expect(toPrompt({ ...served, dimension: "attention" })).toMatchObject({
      state: "ready",
      dimension: "attention",
      item: { itemId: "item-1", question: "Which is larger?" },
    });
  });

  it("still runs a device day that carries none of the question fields", () => {
    // The shape a device-task day now has: no question, no options.
    expect(
      toPrompt({ dimension: "wmc", itemId: "wmc-1", served: false }),
    ).toMatchObject({ state: "ready", dimension: "wmc", item: null });
  });
});
