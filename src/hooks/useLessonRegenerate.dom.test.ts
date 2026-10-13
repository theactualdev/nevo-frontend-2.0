import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const { regenerate, awaitParseRun, detail } = vi.hoisted(() => ({
  regenerate: vi.fn(),
  awaitParseRun: vi.fn(),
  detail: vi.fn(),
}));
vi.mock("@/lib/api/content", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/content")>();
  return {
    ...actual,
    contentApi: { ...actual.contentApi, regenerate },
    awaitParseRun,
  };
});
vi.mock("@/lib/api/lessons", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/lessons")>();
  return { ...actual, lessonsApi: { ...actual.lessonsApi, detail } };
});

import { useLessonRegenerate } from "./useLessonRegenerate";

/**
 * "Try that again" - the remedy for a lesson Nevo transformed badly.
 *
 * THE THING THIS HAS TO GET RIGHT is that the teacher ends up with ONE lesson.
 * Re-uploading was the only remedy before this, and it leaves two assignable
 * lessons with the same title on a product that cannot delete either. So the
 * test that matters most is not the happy path: it is that a second click
 * while a run is in flight does not start a second parse.
 */

const RECEIPT = {
  lessonId: "l-1",
  parseRunId: "run-1",
  status: "processing",
  pollUrl: "/api/content/parse-runs/run-1",
};
const DONE = { status: "completed", finished: true, failureReason: null };
const LESSON = { id: "l-1", title: "Fractions 3", segments: [] };

const settle = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(() => {
  regenerate.mockReset().mockResolvedValue(RECEIPT);
  awaitParseRun.mockReset().mockResolvedValue(DONE);
  detail.mockReset().mockResolvedValue(LESSON);
});

describe("reading the lesson again", () => {
  it("re-runs over the lesson it was given and hands back what came out", async () => {
    const onLesson = vi.fn();
    const { result } = renderHook(() => useLessonRegenerate(onLesson));

    act(() => result.current.run("l-1"));

    await waitFor(() => expect(onLesson).toHaveBeenCalledWith(LESSON));
    expect(regenerate).toHaveBeenCalledWith("l-1");
    expect(awaitParseRun).toHaveBeenCalledWith("run-1", expect.anything());
    expect(result.current.state).toBe("idle");
  });

  it("says so while it is running", async () => {
    let finish: (v: unknown) => void = () => {};
    awaitParseRun.mockReturnValue(new Promise((r) => (finish = r)));
    const { result } = renderHook(() => useLessonRegenerate(vi.fn()));

    act(() => result.current.run("l-1"));

    await waitFor(() => expect(result.current.state).toBe("running"));
    await act(async () => {
      finish(DONE);
    });
  });

  it("starts ONE parse however many times the control is pressed", async () => {
    // Two runs over one lesson race two answers into the same screen, and the
    // second could land first.
    awaitParseRun.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useLessonRegenerate(vi.fn()));

    act(() => result.current.run("l-1"));
    act(() => result.current.run("l-1"));
    act(() => result.current.run("l-1"));

    await settle();
    expect(regenerate).toHaveBeenCalledTimes(1);
  });

  it("reports a run that finished having failed", async () => {
    // `finished` is true for `failed` too, so this arrives as an answer rather
    // than as a hang. The lesson is untouched either way.
    const onLesson = vi.fn();
    awaitParseRun.mockResolvedValue({
      status: "failed",
      finished: true,
      failureReason: "could not read the source",
    });
    const { result } = renderHook(() => useLessonRegenerate(onLesson));

    act(() => result.current.run("l-1"));

    await waitFor(() => expect(result.current.state).toBe("failed"));
    expect(onLesson).not.toHaveBeenCalled();
    expect(detail).not.toHaveBeenCalled();
  });

  it("reports a request that never landed", async () => {
    regenerate.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useLessonRegenerate(vi.fn()));

    act(() => result.current.run("l-1"));

    await waitFor(() => expect(result.current.state).toBe("failed"));
  });

  it("stops asking when the screen goes away, and reports nothing", async () => {
    // A teacher who navigates away has not cancelled the run - the backend
    // finishes it - but nothing here should set state on a dead component or
    // call back with a lesson nobody is showing.
    const onLesson = vi.fn();
    let finish: (v: unknown) => void = () => {};
    awaitParseRun.mockReturnValue(new Promise((r) => (finish = r)));
    const { result, unmount } = renderHook(() => useLessonRegenerate(onLesson));

    act(() => result.current.run("l-1"));
    await waitFor(() => expect(result.current.state).toBe("running"));
    unmount();
    await act(async () => {
      finish(DONE);
    });

    expect(onLesson).not.toHaveBeenCalled();
  });
});

/**
 * A RE-READ THAT FAILED, AND WHY. The parse run's own sentence was wrapped in
 * an error and thrown away, and its reference never read - so the lesson
 * page gave a generic line where the upload screens give the server's.
 */
describe("a re-read that failed", () => {
  it("keeps the run's own reason and reference", async () => {
    awaitParseRun.mockResolvedValue({
      status: "failed",
      finished: true,
      failureReason: "Nevo couldn’t find readable text in that file.",
      incidentId: "7e728d46d73e",
    });
    const { result } = renderHook(() => useLessonRegenerate(vi.fn()));

    act(() => result.current.run("l-1"));

    await waitFor(() => expect(result.current.state).toBe("failed"));
    expect(result.current.failureReason).toBe("Nevo couldn’t find readable text in that file.");
    expect(result.current.incident).toBe("7e728d46d73e");
  });

  it("keeps a reference from a request that failed outright", async () => {
    const { ApiError } = await import("@/lib/api/client");
    regenerate.mockRejectedValue(
      new ApiError(500, "server", { detail: { code: "unexpected_error", incidentId: "9f2c4a7b1d3e" } }),
    );
    const { result } = renderHook(() => useLessonRegenerate(vi.fn()));

    act(() => result.current.run("l-1"));

    await waitFor(() => expect(result.current.state).toBe("failed"));
    expect(result.current.incident).toBe("9f2c4a7b1d3e");
    expect(result.current.failureReason).toBeNull();
  });

  it("forgets the last failure when it is run again", async () => {
    awaitParseRun.mockResolvedValueOnce({
      status: "failed",
      finished: true,
      failureReason: "A fault at our end.",
      incidentId: "aa11",
    });
    const { result } = renderHook(() => useLessonRegenerate(vi.fn()));
    act(() => result.current.run("l-1"));
    await waitFor(() => expect(result.current.state).toBe("failed"));

    awaitParseRun.mockReturnValueOnce(new Promise(() => {}));
    act(() => result.current.run("l-1"));

    expect(result.current.failureReason).toBeNull();
    expect(result.current.incident).toBeNull();
  });
});
