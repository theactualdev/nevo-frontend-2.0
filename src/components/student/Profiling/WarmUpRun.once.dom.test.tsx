import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WarmUpRun } from "./WarmUpRun";
import { markWarmUpDone } from "@/lib/profiling/warmUpDone";

/**
 * ONE WARM-UP A DAY.
 *
 * It was re-sittable any number of times, and the cost was not cosmetic: every
 * run reduces to a feature vector and submits it, so a child who opened it
 * four times sent four measurements of the same dimension on the same day -
 * and the engine recalibrates on those. The screen already had the gentle done
 * state design confirmed on 23 Sep; what it lacked was a memory that it had
 * happened.
 *
 * So the load-bearing assertion is about the SUBMISSION, not the screen: a
 * second visit must reach `baselineApi` zero times.
 */

const { submit } = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock("@/lib/api", () => ({ baselineApi: { submitWithRetry: submit } }));
const { holdBaseline } = vi.hoisted(() => ({ holdBaseline: vi.fn() }));
vi.mock("@/lib/profiling/pendingBaseline", () => ({ holdBaseline }));
// These pin the task with the `dimension` prop; the engine's prompt is
// covered in WarmUpRun.engine.dom.test.tsx.
vi.mock("@/hooks/useWarmUpDimension", () => ({
  useWarmUpPrompt: () => ({ state: "waiting" }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

/*
 * PARTIAL mock, spreading the real module. A whole-module replacement drops
 * `getToken`, which `useHasSession` calls through `useConsentGate` on this very
 * component - so the run dies at mount and every test in the file fails for a
 * reason that has nothing to do with what it is testing. Same trap as the
 * `deviceRoster` mock that once blanked `SHAPE_COUNT`.
 */
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  return { ...actual, getSession };
});

const settle = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
};

const doneHeading = () => screen.queryByText(/That's it for today/i);
const taskIsOnScreen = () => screen.queryByText("Right") !== null;

beforeEach(() => {
  vi.useFakeTimers();
  submit.mockReset();
  submit.mockResolvedValue(true);
  holdBaseline.mockReset();
  getSession.mockReturnValue({ userId: "child-1" });
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the first warm-up of the day", () => {
  it("runs, submits, and closes on the done state", async () => {
    render(<WarmUpRun dimension="attention" />);
    expect(taskIsOnScreen()).toBe(true);

    fireEvent.click(screen.getByText("Right"));
    await settle();

    expect(submit).toHaveBeenCalledTimes(1);
    expect(doneHeading()).toBeInTheDocument();
  });

  it("offers the way Home rather than another go", async () => {
    // Design, 23 Sep: "it closes". Where to went Home on 1 Oct (D18).
    render(<WarmUpRun dimension="attention" />);
    fireEvent.click(screen.getByText("Right"));
    await settle();

    expect(screen.getByRole("button", { name: "Home" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /again|retry|another/i }),
    ).toBeNull();
  });

  it("says nothing about how they did", async () => {
    // Ruled explicitly, and it is the line the whole product holds.
    render(<WarmUpRun dimension="attention" />);
    fireEvent.click(screen.getByText("Left"));
    await settle();

    expect(document.body.textContent).not.toMatch(
      /score|correct|wrong|right answer|well done|%/i,
    );
  });
});

describe("coming back the same day", () => {
  it("after actually doing one, a second visit does not run again", async () => {
    /*
     * THE ONE THAT EARNS THE FLAG RATHER THAN SEEDING IT.
     *
     * The tests below start from `markWarmUpDone`, which proves the guard
     * reads the memory but not that the run ever WRITES it - a mutation that
     * removed the write survived all of them. This completes a real run first,
     * so the whole loop is covered.
     */
    const first = render(<WarmUpRun dimension="attention" />);
    fireEvent.click(screen.getByText("Right"));
    await settle();
    expect(submit).toHaveBeenCalledTimes(1);
    first.unmount();

    render(<WarmUpRun dimension="attention" />);
    await settle();

    expect(doneHeading()).toBeInTheDocument();
    expect(taskIsOnScreen()).toBe(false);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("opens on the done state instead of another run", async () => {
    markWarmUpDone("child-1");

    render(<WarmUpRun dimension="attention" />);
    await settle();

    expect(doneHeading()).toBeInTheDocument();
    expect(taskIsOnScreen()).toBe(false);
  });

  it("submits nothing at all, which is the point", async () => {
    /*
     * THE DECISIVE ONE. Four visits used to mean four measurements of the same
     * dimension on the same day, and the engine recalibrates on them.
     */
    markWarmUpDone("child-1");

    render(<WarmUpRun dimension="attention" />);
    await settle();

    expect(submit).not.toHaveBeenCalled();
    expect(holdBaseline).not.toHaveBeenCalled();
  });
});

describe("a second child on the same tablet", () => {
  it("gets their own warm-up, not the first child's done state", async () => {
    /*
     * The tablet remembers up to six children. A flag on the device alone
     * would tell the second child of the morning that they had already done a
     * warm-up they have never seen - and it is the one thing on the dashboard
     * addressed to them.
     */
    markWarmUpDone("child-1");
    getSession.mockReturnValue({ userId: "child-2" });

    render(<WarmUpRun dimension="attention" />);
    await settle();

    expect(taskIsOnScreen()).toBe(true);
    expect(doneHeading()).toBeNull();
  });
});
