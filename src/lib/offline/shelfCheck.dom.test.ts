import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { LessonDetailResponse } from "@/lib/api/lessons";
import {
  canOpenOffline,
  forgetChecks,
  isChecked,
  saveLesson,
  savedLesson,
  trustedNow,
} from "./savedLessons";
import {
  SHELF_CHANGED,
  checkSavedLesson,
  checkShelf,
  resetShelfCheck,
} from "./shelfCheck";
import { FRESH_DOWNLOAD } from "./testDownload";

/**
 * The status check a saved copy passes before it is read on a connection
 * (safety v2, Teslim 9f4d763 and his handoff of 18 Nov). Each answer does
 * what his handoff says it does, and nothing reads a copy the server has not
 * vouched for.
 */

const { offlineDownloadStatus, downloadLesson } = vi.hoisted(() => ({
  offlineDownloadStatus: vi.fn(),
  downloadLesson: vi.fn(),
}));
vi.mock("@/lib/api/lessons", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  lessonsApi: { offlineDownloadStatus },
}));
vi.mock("./lessonPackage", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  downloadLesson,
}));

const detail = (id: string, title = `Lesson ${id}`) =>
  ({ id, title, segments: [] }) as unknown as LessonDetailResponse;

const status = (
  reason: "current" | "expired" | "safety_revoked",
  over: Record<string, unknown> = {},
) => ({
  id: FRESH_DOWNLOAD.downloadId,
  usable: reason === "current",
  reason,
  checkedAt: "2026-11-19T10:00:00Z",
  expiresAt: "2099-02-01T00:00:00Z",
  ...over,
});

const fresh = (id: string, downloadId = "download-2") => ({
  detail: detail(id, `Fresh ${id}`),
  sizeBytes: 2_000,
  includesMedia: false,
  downloadId,
  expiresAt: "2099-03-01T00:00:00Z",
});

/** A copy kept on an earlier connection: on the shelf, not yet checked. */
const keep = (id: string, pkg: object = FRESH_DOWNLOAD) => {
  saveLesson("ada", detail(id), pkg);
  forgetChecks();
};

beforeEach(() => {
  window.localStorage.clear();
  forgetChecks();
  resetShelfCheck();
  offlineDownloadStatus.mockReset();
  downloadLesson.mockReset();
});

describe("each answer the status check can give", () => {
  it("current: the copy may be read, on the server's expiry and clock", async () => {
    keep("l1");
    offlineDownloadStatus.mockResolvedValue(status("current"));

    expect(await checkSavedLesson("ada", "l1")).toBe("current");

    expect(offlineDownloadStatus).toHaveBeenCalledWith(FRESH_DOWNLOAD.downloadId);
    const kept = savedLesson("ada", "l1")!;
    expect(kept.expiresAt).toBe("2099-02-01T00:00:00Z");
    expect(kept.hold).toBeUndefined();
    expect(canOpenOffline(kept)).toBe(true);
    expect(isChecked("ada", "l1")).toBe(true);
  });

  it("safety_revoked: the copy is deleted, and nothing downloaded in its place", async () => {
    keep("l1");
    offlineDownloadStatus.mockResolvedValue(status("safety_revoked"));

    expect(await checkSavedLesson("ada", "l1")).toBe("removed");

    expect(savedLesson("ada", "l1")).toBeNull();
    expect(downloadLesson).not.toHaveBeenCalled();
  });

  it("expired: downloaded afresh, with its new download and expiry", async () => {
    keep("l1");
    offlineDownloadStatus.mockResolvedValue(status("expired"));
    downloadLesson.mockResolvedValue(fresh("l1"));

    expect(await checkSavedLesson("ada", "l1")).toBe("current");

    expect(downloadLesson).toHaveBeenCalledWith("l1");
    expect(savedLesson("ada", "l1")).toMatchObject({
      title: "Fresh l1",
      downloadId: "download-2",
      expiresAt: "2099-03-01T00:00:00Z",
    });
  });

  it("expired, and the fresh download does not land: the old copy stays shut", async () => {
    keep("l1");
    offlineDownloadStatus.mockResolvedValue(status("expired"));
    downloadLesson.mockRejectedValue(new ApiError(0, "Network"));

    expect(await checkSavedLesson("ada", "l1")).toBe("held");

    const kept = savedLesson("ada", "l1")!;
    expect(kept.hold).toBe("stale");
    expect(canOpenOffline(kept)).toBe(false);
  });

  it("404: the server cannot vouch for it, so it is downloaded afresh - never assumed safe", async () => {
    keep("l1");
    offlineDownloadStatus.mockRejectedValue(new ApiError(404, "Not Found"));
    downloadLesson.mockResolvedValue(fresh("l1"));

    expect(await checkSavedLesson("ada", "l1")).toBe("current");
    expect(savedLesson("ada", "l1")?.downloadId).toBe("download-2");
  });

  it("a failed check with a response: never current, held, and shut offline too", async () => {
    keep("l1");
    offlineDownloadStatus.mockRejectedValue(new ApiError(500, "Server"));

    expect(await checkSavedLesson("ada", "l1")).toBe("held");

    const kept = savedLesson("ada", "l1")!;
    expect(kept.hold).toBe("unchecked");
    expect(canOpenOffline(kept)).toBe(false);
  });

  it("a later check that says current opens it again", async () => {
    keep("l1");
    offlineDownloadStatus.mockRejectedValueOnce(new ApiError(500, "Server"));
    await checkSavedLesson("ada", "l1");
    offlineDownloadStatus.mockResolvedValue(status("current"));

    expect(await checkSavedLesson("ada", "l1")).toBe("current");
    expect(canOpenOffline(savedLesson("ada", "l1")!)).toBe(true);
  });

  it("no response at all: no connection, and nothing changes", async () => {
    keep("l1");
    offlineDownloadStatus.mockRejectedValue(new ApiError(0, "Network"));

    expect(await checkSavedLesson("ada", "l1")).toBe("offline");

    const kept = savedLesson("ada", "l1")!;
    expect(kept.hold).toBeUndefined();
    expect(canOpenOffline(kept)).toBe(true);
  });

  it("an answer this player does not know is not current", async () => {
    keep("l1");
    offlineDownloadStatus.mockResolvedValue(
      status("current", { usable: false }),
    );

    expect(await checkSavedLesson("ada", "l1")).toBe("held");
    expect(savedLesson("ada", "l1")?.hold).toBe("unchecked");
  });

  it("a copy kept before safety v2 has nothing to ask about, and is downloaded afresh", async () => {
    keep("l1", {});
    downloadLesson.mockResolvedValue(fresh("l1"));

    expect(await checkSavedLesson("ada", "l1")).toBe("current");

    expect(offlineDownloadStatus).not.toHaveBeenCalled();
    expect(savedLesson("ada", "l1")?.downloadId).toBe("download-2");
  });

  it("a copy the child removed while it downloaded afresh is not kept again", async () => {
    keep("l1");
    offlineDownloadStatus.mockResolvedValue(status("expired"));
    downloadLesson.mockImplementation(async () => {
      window.localStorage.removeItem("nevo.offline.lessons.ada");
      return fresh("l1");
    });

    expect(await checkSavedLesson("ada", "l1")).toBe("removed");
    expect(savedLesson("ada", "l1")).toBeNull();
  });
});

describe("once per connection", () => {
  it("asks once, and a check on its way is shared", async () => {
    keep("l1");
    offlineDownloadStatus.mockResolvedValue(status("current"));

    await Promise.all([
      checkSavedLesson("ada", "l1"),
      checkSavedLesson("ada", "l1"),
    ]);
    await checkSavedLesson("ada", "l1");

    expect(offlineDownloadStatus).toHaveBeenCalledTimes(1);
  });

  it("asks again on a new connection", async () => {
    keep("l1");
    offlineDownloadStatus.mockResolvedValue(status("current"));
    await checkSavedLesson("ada", "l1");

    forgetChecks();
    await checkSavedLesson("ada", "l1");

    expect(offlineDownloadStatus).toHaveBeenCalledTimes(2);
  });

  it("does not ask about a copy downloaded on this connection", async () => {
    saveLesson("ada", detail("l1"), FRESH_DOWNLOAD);

    expect(await checkSavedLesson("ada", "l1")).toBe("current");
    expect(offlineDownloadStatus).not.toHaveBeenCalled();
  });

  it("asks nothing about a lesson that is not on the shelf", async () => {
    expect(await checkSavedLesson("ada", "nowhere")).toBe("removed");
    expect(offlineDownloadStatus).not.toHaveBeenCalled();
  });
});

describe("the whole shelf", () => {
  it("checks every copy, and says the shelf changed", async () => {
    keep("l1", { ...FRESH_DOWNLOAD, downloadId: "d1" });
    keep("l2", { ...FRESH_DOWNLOAD, downloadId: "d2" });
    offlineDownloadStatus.mockImplementation(async (id: string) =>
      id === "d1" ? status("safety_revoked") : status("current"),
    );
    const heard = vi.fn();
    window.addEventListener(SHELF_CHANGED, heard);

    await checkShelf("ada");

    window.removeEventListener(SHELF_CHANGED, heard);
    expect(offlineDownloadStatus).toHaveBeenCalledTimes(2);
    expect(savedLesson("ada", "l1")).toBeNull();
    expect(isChecked("ada", "l2")).toBe(true);
    expect(heard).toHaveBeenCalled();
  });

  it("stops at the first copy that finds no connection", async () => {
    keep("l1", { ...FRESH_DOWNLOAD, downloadId: "d1" });
    keep("l2", { ...FRESH_DOWNLOAD, downloadId: "d2" });
    offlineDownloadStatus.mockRejectedValue(new ApiError(0, "Network"));

    await checkShelf("ada");

    expect(offlineDownloadStatus).toHaveBeenCalledTimes(1);
  });

  it("takes the server's clock over the device's", async () => {
    keep("l1");
    offlineDownloadStatus.mockResolvedValue(
      status("current", { checkedAt: "2099-01-15T00:00:00Z" }),
    );

    await checkSavedLesson("ada", "l1");

    expect(trustedNow()).toBe(Date.parse("2099-01-15T00:00:00Z"));
  });
});
