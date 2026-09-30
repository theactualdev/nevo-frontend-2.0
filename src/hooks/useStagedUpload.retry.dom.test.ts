import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const { create, status, retryPages } = vi.hoisted(() => ({
  create: vi.fn(),
  status: vi.fn(),
  retryPages: vi.fn(),
}));
vi.mock("@/lib/api/uploads", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/uploads")>();
  return {
    ...actual,
    uploadsApi: { ...actual.uploadsApi, create, status, retryPages },
  };
});

import { useStagedUpload } from "./useStagedUpload";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * The pages a parser could not read, and asking for them again.
 *
 * WHAT WAS BROKEN. `failedPages` is on the status response and was absent
 * from the client type, so a partly unreadable PDF produced a structure with
 * pages silently missing from it. `retryPages` was wrapped and unused, and it
 * had nothing to ask for: the page numbers only exist in the field nobody
 * read.
 *
 * The retry puts the upload BACK INTO PARSING - the response carries `status`
 * and `stage` for exactly that reason - so the test that matters most is that
 * polling resumes afterwards rather than the screen sitting on a structure
 * that is about to be replaced.
 */

const READY = {
  id: "u-1",
  status: "ready",
  stage: "complete",
  lessonTitle: "Fractions",
  segments: [],
  failedPages: [4, 7],
  structure: { lessons: [] },
  error: null,
};

const signIn = () =>
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: "t-1",
    role: "teacher",
  });

const startUpload = async (result: { current: ReturnType<typeof useStagedUpload> }) => {
  act(() => result.current.start(new File(["x"], "unit.pdf"), "unit"));
  await waitFor(() => expect(result.current.uploadId).toBe("u-1"));
  await waitFor(() => expect(result.current.failedPages).toEqual([4, 7]), {
    timeout: 4000,
  });
};

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  signIn();
  create.mockReset().mockResolvedValue({
    uploadId: "u-1",
    status: "processing",
    stage: "lessons",
  });
  status.mockReset().mockResolvedValue(READY);
  retryPages.mockReset().mockResolvedValue({
    uploadId: "u-1",
    status: "processing",
    stage: "lessons",
    pagesRetried: [4, 7],
    structure: { lessons: [] },
  });
});

describe("faint pages", () => {
  it("reaches the screen at all", async () => {
    const { result } = renderHook(() => useStagedUpload());

    await startUpload(result);

    expect(result.current.failedPages).toEqual([4, 7]);
  });

  it("is empty, not undefined, when the parse read everything", async () => {
    status.mockResolvedValue({ ...READY, failedPages: undefined });
    const { result } = renderHook(() => useStagedUpload());

    act(() => result.current.start(new File(["x"], "unit.pdf"), "unit"));
    await waitFor(() => expect(result.current.status).toBe("ready"), {
      timeout: 4000,
    });

    expect(result.current.failedPages).toEqual([]);
  });

  it("sends exactly the pages that are outstanding", async () => {
    const { result } = renderHook(() => useStagedUpload());
    await startUpload(result);

    act(() => result.current.retryFailedPages());

    await waitFor(() => expect(retryPages).toHaveBeenCalledWith("u-1", [4, 7]));
  });

  it("goes back to parsing, and keeps polling", async () => {
    // The whole point of the retry response carrying status and stage. A
    // screen that stayed on `ready` would show a structure the server is in
    // the middle of replacing.
    const { result } = renderHook(() => useStagedUpload());
    await startUpload(result);
    const pollsBefore = status.mock.calls.length;

    act(() => result.current.retryFailedPages());

    await waitFor(() => expect(result.current.status).toBe("processing"));
    await waitFor(
      () => expect(status.mock.calls.length).toBeGreaterThan(pollsBefore),
      { timeout: 4000 },
    );
  });

  it("sends nothing when there is nothing outstanding", async () => {
    // `pageNumbers` is minItems 1 on the contract: an empty retry is a 422.
    status.mockResolvedValue({ ...READY, failedPages: [] });
    const { result } = renderHook(() => useStagedUpload());
    act(() => result.current.start(new File(["x"], "unit.pdf"), "unit"));
    await waitFor(() => expect(result.current.status).toBe("ready"), {
      timeout: 4000,
    });

    act(() => result.current.retryFailedPages());

    expect(retryPages).not.toHaveBeenCalled();
  });

  it("asks once however many times the control is pressed", async () => {
    retryPages.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useStagedUpload());
    await startUpload(result);

    act(() => result.current.retryFailedPages());
    act(() => result.current.retryFailedPages());
    act(() => result.current.retryFailedPages());

    await waitFor(() => expect(retryPages).toHaveBeenCalledTimes(1));
    expect(result.current.retrying).toBe(true);
  });

  it("leaves the pages outstanding when the retry itself failed", async () => {
    // Nothing about the upload changed, so the control must still be there.
    retryPages.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useStagedUpload());
    await startUpload(result);

    act(() => result.current.retryFailedPages());

    await waitFor(() => expect(result.current.retrying).toBe(false));
    expect(result.current.failedPages).toEqual([4, 7]);
  });
});

describe("whose failure it was", () => {
  /*
   * TWO FAILURES WORE ONE FLAG. `failed` was set both when the parse came
   * back `failed` and when the request itself blew up, and the screen said
   * "We couldn't read that one" over either - so our own server being
   * unreachable was reported as a fault in the teacher's file, with the
   * advice to go and find another one. Backend asked for the split on
   * 18 Sep, along with the polling fix.
   */
  it("is the parse when Nevo read the file and could not finish", async () => {
    status.mockResolvedValue({
      ...READY,
      status: "failed",
      error: "The document had no readable text after page 3.",
    });
    const { result } = renderHook(() => useStagedUpload());

    act(() => result.current.start(new File(["x"], "unit.pdf"), "unit"));
    await waitFor(() => expect(result.current.failed).toBe(true), {
      timeout: 4000,
    });

    expect(result.current.failureKind).toBe("parse");
    expect(result.current.error).toBe(
      "The document had no readable text after page 3.",
    );
  });

  it("is the request when the call never landed", async () => {
    create.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useStagedUpload());

    act(() => result.current.start(new File(["x"], "unit.pdf"), "unit"));

    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.failureKind).toBe("request");
  });

  it("is the request when the polls keep blowing up mid-parse", async () => {
    // Three in a row, two seconds apart: one blip is not an outage any more.
    // The count itself is pinned in useStagedUpload.poll.dom.test.ts.
    create.mockResolvedValue({
      uploadId: "u-1",
      status: "processing",
      stage: "lessons",
    });
    status.mockRejectedValue(new Error("502"));
    const { result } = renderHook(() => useStagedUpload());

    act(() => result.current.start(new File(["x"], "unit.pdf"), "unit"));

    await waitFor(() => expect(result.current.failed).toBe(true), {
      timeout: 9000,
    });
    expect(result.current.failureKind).toBe("request");
  }, 12_000);

  it("carries no kind at all before anything has gone wrong", async () => {
    const { result } = renderHook(() => useStagedUpload());

    expect(result.current.failureKind).toBeNull();
  });
});