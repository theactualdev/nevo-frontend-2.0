import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useScaffoldLevel } from "./useScaffoldLevel";
import { SCAFFOLD_LEVELS } from "@/lib/constants/scaffold";

const { stateFn, session } = vi.hoisted(() => ({
  stateFn: vi.fn(),
  session: { value: { userId: "s-1" } as { userId: string } | null },
}));
vi.mock("@/lib/api/scaffolds", () => ({ scaffoldsApi: { state: stateFn } }));
vi.mock("@/lib/auth/session", () => ({ getSession: () => session.value }));

/**
 * Every branch here answers the same question: when is it right to say nothing?
 *
 * The indicator is a statement about a child. A concept we were never given, a
 * child who is not signed in, a concept never attempted and a read that failed
 * are all "we do not know" - and none of them is evidence that a child needs
 * more help or less.
 */

beforeEach(() => {
  stateFn.mockReset();
  session.value = { userId: "s-1" };
});

describe("when a concept is known", () => {
  it("reports the level the engine holds for it", async () => {
    stateFn.mockResolvedValue({ currentIntensity: "full_support" });

    const { result } = renderHook(() => useScaffoldLevel("c-1"));

    await waitFor(() =>
      expect(result.current).toBe(SCAFFOLD_LEVELS.FULL),
    );
    expect(stateFn).toHaveBeenCalledWith("s-1", "c-1");
  });

  it("reaches minimal, which no ordinary lesson can show", async () => {
    // The fourth circle. `ScaffoldingLevel` has three values, so this state
    // was unreachable before this source existed.
    stateFn.mockResolvedValue({ currentIntensity: "independent" });

    const { result } = renderHook(() => useScaffoldLevel("c-1"));

    await waitFor(() => expect(result.current).toBe(SCAFFOLD_LEVELS.MINIMAL));
  });

  it("asks once", async () => {
    stateFn.mockResolvedValue({ currentIntensity: "hints_only" });

    const { result, rerender } = renderHook(() => useScaffoldLevel("c-1"));

    await waitFor(() => expect(result.current).toBe(SCAFFOLD_LEVELS.LIGHT));
    rerender();
    rerender();

    expect(stateFn).toHaveBeenCalledTimes(1);
  });
});

describe("when there is nothing to ask about", () => {
  it("says nothing on an ordinary lesson, and does not call", async () => {
    // A `LessonSegment` carries no concept, so there is no subject for the
    // question "how much support on this?".
    const { result } = renderHook(() => useScaffoldLevel(undefined));

    expect(result.current).toBeNull();
    expect(stateFn).not.toHaveBeenCalled();
  });

  it("says nothing for a signed-out visitor, and does not call", async () => {
    // The designed walkthrough. There is no child to have a level, and the
    // endpoint is Bearer-only.
    session.value = null;

    const { result } = renderHook(() => useScaffoldLevel("c-1"));

    expect(result.current).toBeNull();
    expect(stateFn).not.toHaveBeenCalled();
  });
});

describe("when the answer is no use", () => {
  /*
   * ASSERTING A NON-EVENT NEEDS THE SETTLE FIRST, and the first version of
   * these two did not do it. They awaited only "the call was made", so they
   * passed whether or not the handler went on to set a level - a mutation that
   * filled the gap with "light" survived both. Flushing the microtask queue is
   * what makes the absence mean anything.
   */
  const settle = () =>
    act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

  it("stays null when the read fails", async () => {
    /*
     * The decisive one. Defaulting to a level here would draw a picture of how
     * much help a child needs out of a dropped connection.
     */
    stateFn.mockRejectedValue(new Error("network"));

    const { result } = renderHook(() => useScaffoldLevel("c-1"));

    await waitFor(() => expect(stateFn).toHaveBeenCalled());
    await settle();

    expect(result.current).toBeNull();
  });

  it("stays null on an intensity it does not recognise", async () => {
    stateFn.mockResolvedValue({ currentIntensity: "gently_guided" });

    const { result } = renderHook(() => useScaffoldLevel("c-1"));

    await waitFor(() => expect(stateFn).toHaveBeenCalled());
    await settle();

    expect(result.current).toBeNull();
  });
});
