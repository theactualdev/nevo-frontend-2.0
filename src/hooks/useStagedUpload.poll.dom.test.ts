import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const { create, status } = vi.hoisted(() => ({
  create: vi.fn(),
  status: vi.fn(),
}));
vi.mock("@/lib/api/uploads", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/uploads")>();
  return { ...actual, uploadsApi: { ...actual.uploadsApi, create, status } };
});

import { useStagedUpload } from "./useStagedUpload";
import { ApiError } from "@/lib/api/client";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * ONE BLIP IS NOT AN ANSWER.
 *
 * The status poll gave up on its first rejected request. A single 502 from a
 * cold-started proxy told a teacher we could not reach Nevo, while the parse
 * carried on server-side and finished with nobody watching. `awaitParseRun`
 * in content.ts has allowed three in a row since the same thing happened
 * there; this poll never did.
 *
 * And "Try again" on that screen then staged the file a SECOND time, because
 * nothing could ask about the upload that already existed.
 */

const POLL_MS = 2000;

const PROCESSING = {
  id: "u-1",
  status: "processing",
  stage: "lessons",
  structure: null,
  error: null,
};
const READY = {
  ...PROCESSING,
  status: "ready",
  stage: "complete",
  structure: { lessonId: "l-1", modules: [], lessons: [] },
};
const blip = () => new ApiError(502, "bad gateway");

/** One poll interval, flushed - one per `act`, or React batches the rounds. */
const poll = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(POLL_MS);
  });
};

const staged = async () => {
  const { result } = renderHook(() => useStagedUpload());
  await act(async () => {
    result.current.start(new File(["x"], "lesson.pdf"), "lesson");
  });
  return result;
};

beforeEach(() => {
  vi.useFakeTimers();
  clearSession();
  window.localStorage.clear();
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: "t-1",
    role: "teacher",
  });
  create.mockReset().mockResolvedValue({
    uploadId: "u-1",
    status: "processing",
    stage: "lessons",
  });
  status.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a status request that failed once", () => {
  it("keeps watching instead of calling the upload failed", async () => {
    status.mockRejectedValueOnce(blip()).mockResolvedValue(READY);
    const result = await staged();

    await poll();
    expect(result.current.failed).toBe(false);

    await poll();
    expect(result.current.status).toBe("ready");
    expect(result.current.failed).toBe(false);
  });

  it("survives two in a row", async () => {
    status
      .mockRejectedValueOnce(blip())
      .mockRejectedValueOnce(blip())
      .mockResolvedValue(READY);
    const result = await staged();

    await poll();
    await poll();
    expect(result.current.failed).toBe(false);

    await poll();
    expect(result.current.status).toBe("ready");
  });

  it("counts only failures IN A ROW - an answer in between starts again", async () => {
    // Two, an answer, two more: never three consecutive, so never an outage.
    status
      .mockRejectedValueOnce(blip())
      .mockRejectedValueOnce(blip())
      .mockResolvedValueOnce(PROCESSING)
      .mockRejectedValueOnce(blip())
      .mockRejectedValueOnce(blip())
      .mockResolvedValue(READY);
    const result = await staged();

    for (let i = 0; i < 5; i++) await poll();
    expect(result.current.failed).toBe(false);

    await poll();
    expect(result.current.status).toBe("ready");
  });
});

describe("a connection that is really down", () => {
  it("is called a failure on the third in a row, and the connection's", async () => {
    status.mockRejectedValue(blip());
    const result = await staged();

    await poll();
    await poll();
    expect(result.current.failed).toBe(false);

    await poll();
    expect(result.current.failed).toBe(true);
    expect(result.current.failureKind).toBe("request");
  });

  it("stops asking once it has said so", async () => {
    status.mockRejectedValue(blip());
    await staged();
    for (let i = 0; i < 3; i++) await poll();
    const asked = status.mock.calls.length;

    await poll();
    await poll();

    expect(status.mock.calls.length).toBe(asked);
  });

  it("keeps the reference from the failure that ended it", async () => {
    status.mockRejectedValue(
      new ApiError(500, "server", {
        detail: { code: "unexpected_error", incidentId: "9f2c4a7b1d3e" },
      }),
    );
    const result = await staged();
    for (let i = 0; i < 3; i++) await poll();

    expect(result.current.incident).toBe("9f2c4a7b1d3e");
  });
});

describe("trying again after the connection failed", () => {
  const toOutage = async () => {
    status.mockRejectedValue(blip());
    const result = await staged();
    for (let i = 0; i < 3; i++) await poll();
    expect(result.current.failureKind).toBe("request");
    return result;
  };

  it("asks about the SAME upload, and sends no file", async () => {
    const result = await toOutage();
    status.mockReset().mockResolvedValue(READY);

    await act(async () => result.current.resume());
    await poll();

    expect(status).toHaveBeenCalledWith("u-1");
    expect(create).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("ready");
  });

  it("clears the failure while it asks", async () => {
    const result = await toOutage();
    status.mockReset().mockResolvedValue(PROCESSING);

    await act(async () => result.current.resume());

    expect(result.current.failed).toBe(false);
    expect(result.current.failureKind).toBeNull();
    expect(result.current.incident).toBeNull();
  });

  it("gets three more chances, not one", async () => {
    // The count starts again, or the first blip after a resume would end it.
    const result = await toOutage();
    status.mockReset().mockRejectedValueOnce(blip()).mockResolvedValue(READY);

    await act(async () => result.current.resume());
    await poll();
    expect(result.current.failed).toBe(false);

    await poll();
    expect(result.current.status).toBe("ready");
  });

  it("does nothing to a parse that failed - that was an answer", async () => {
    status.mockResolvedValue({ ...PROCESSING, status: "failed", error: "x" });
    const result = await staged();
    await poll();
    expect(result.current.failureKind).toBe("parse");
    status.mockClear();

    await act(async () => result.current.resume());
    await poll();

    expect(status).not.toHaveBeenCalled();
    expect(result.current.failed).toBe(true);
  });

  it("does nothing when the file never landed - there is no upload to ask about", async () => {
    create.mockRejectedValue(blip());
    const result = await staged();
    expect(result.current.failureKind).toBe("request");

    await act(async () => result.current.resume());
    await poll();

    expect(status).not.toHaveBeenCalled();
    expect(result.current.failed).toBe(true);
  });
});
