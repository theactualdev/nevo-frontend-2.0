import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

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
 * WHOSE FAULT THE FAILED UPLOAD WAS.
 *
 * This hook reported every rejected upload as `request` - our server being
 * unreachable - so a file the backend had READ and REFUSED was answered with
 * "nothing is wrong with your file", and the advice was to send the same one
 * again. The single-lesson path classified by status and got this right; when
 * that path moved onto this hook on 21 Sep, the distinction would have been
 * lost with it.
 *
 * Any 4xx is the server's answer about this document. Only a 5xx, or no
 * status at all - the call never arrived - is ours.
 */

const signIn = () =>
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: "t-1",
    role: "teacher",
  });

const upload = async () => {
  const { result } = renderHook(() => useStagedUpload());
  act(() => result.current.start(new File(["x"], "lesson.pdf"), "lesson"));
  await waitFor(() => expect(result.current.failed).toBe(true));
  return result;
};

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  signIn();
  create.mockReset();
  status.mockReset().mockResolvedValue(undefined);
});

describe("an upload the server refused", () => {
  it("is about the file when the server answered about the file", async () => {
    create.mockRejectedValue(new ApiError(422, "no readable text"));

    const result = await upload();

    expect(result.current.failureKind).toBe("file");
  });

  it("is about the file for any 4xx, not only the one we have seen", async () => {
    // 400 is documented on the content route and 422 on this one. Pinning a
    // single status is how the old single-path handler had a file branch that
    // never fired.
    create.mockRejectedValue(new ApiError(400, "bad"));

    const result = await upload();

    expect(result.current.failureKind).toBe("file");
  });
});

describe("the reference for a failure nobody planned for", () => {
  it("keeps the incident id off an unhandled error", async () => {
    /*
     * The whole point. A staged upload answered 500 on ~18 Sep and backend
     * could not find it from their side, because nothing on this end kept
     * anything to match on. `ApiError.detail` held the body all along.
     */
    create.mockRejectedValue(
      new ApiError(500, "server", { incidentId: "a1b2c3d4" }),
    );

    const result = await upload();

    expect(result.current.incident).toBe("a1b2c3d4");
  });

  it("keeps nothing when the body carried no reference", async () => {
    // Most failures, and a screen that invented one would be worse than a
    // screen that says nothing.
    create.mockRejectedValue(new ApiError(422, "unsupported"));

    const result = await upload();

    expect(result.current.incident).toBeNull();
  });

  it("keeps nothing from a plain-text error page", async () => {
    // Which is what the 18 Sep 500 actually returned.
    create.mockRejectedValue(new ApiError(500, "server", "Internal Server Error"));

    const result = await upload();

    expect(result.current.incident).toBeNull();
  });

  it("does not carry one upload's reference over to the next", async () => {
    create.mockRejectedValue(
      new ApiError(500, "server", { incidentId: "a1b2c3d4" }),
    );
    const { result } = renderHook(() => useStagedUpload());
    act(() => result.current.start(new File(["x"], "one.pdf"), "lesson"));
    await waitFor(() => expect(result.current.incident).toBe("a1b2c3d4"));

    create.mockResolvedValue({ uploadId: "u-2", status: "processing", stage: "lessons" });
    act(() => result.current.start(new File(["x"], "two.pdf"), "lesson"));

    await waitFor(() => expect(result.current.incident).toBeNull());
  });
});

describe("an upload that never landed", () => {
  it("is ours when the server broke", async () => {
    create.mockRejectedValue(new ApiError(503, "down"));

    const result = await upload();

    expect(result.current.failureKind).toBe("request");
  });

  it("is ours when there was no answer at all", async () => {
    // No status: the call did not reach anything that could judge the file.
    create.mockRejectedValue(new Error("network"));

    const result = await upload();

    expect(result.current.failureKind).toBe("request");
  });
});
