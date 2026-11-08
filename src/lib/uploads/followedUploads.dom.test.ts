import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  followUpload,
  followedUploads,
  onFollowedUploadsChange,
  unfollowUpload,
} from "./followedUploads";

/**
 * The uploads a teacher started on this device, keyed by user, so the marker
 * can follow them without the school-wide list (C07j LU-03).
 */

const entry = (uploadId: string) => ({
  uploadId,
  name: `${uploadId}.pdf`,
  scope: "single" as const,
  startedAt: "2026-11-04T10:00:00Z",
});

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("followedUploads", () => {
  it("remembers an upload for the teacher who started it, and nobody else", () => {
    followUpload("t-1", entry("u-1"));

    expect(followedUploads("t-1").map((u) => u.uploadId)).toEqual(["u-1"]);
    expect(followedUploads("t-2")).toEqual([]);
    expect(followedUploads(null)).toEqual([]);
  });

  it("puts the newest first, once, and keeps the newest five", () => {
    for (const id of ["a", "b", "c", "d", "e", "f"]) followUpload("t-1", entry(id));
    followUpload("t-1", entry("c"));

    expect(followedUploads("t-1").map((u) => u.uploadId)).toEqual(["c", "f", "e", "d", "b"]);
  });

  it("lets one go", () => {
    followUpload("t-1", entry("u-1"));
    followUpload("t-1", entry("u-2"));
    unfollowUpload("t-1", "u-1");

    expect(followedUploads("t-1").map((u) => u.uploadId)).toEqual(["u-2"]);
  });

  it("reads a damaged store as nothing followed", () => {
    window.localStorage.setItem("nevo.uploads.t-1", "{not json");
    expect(followedUploads("t-1")).toEqual([]);

    window.localStorage.setItem("nevo.uploads.t-1", JSON.stringify([{ uploadId: 3 }, entry("ok")]));
    expect(followedUploads("t-1").map((u) => u.uploadId)).toEqual(["ok"]);
  });

  it("never throws when the store is unavailable", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    expect(() => followUpload("t-1", entry("u-1"))).not.toThrow();
    expect(followedUploads("t-1")).toEqual([]);
  });

  it("tells this tab when what is followed changes", () => {
    const heard = vi.fn();
    const stop = onFollowedUploadsChange(heard);
    followUpload("t-1", entry("u-1"));
    stop();
    followUpload("t-1", entry("u-2"));

    expect(heard).toHaveBeenCalledTimes(1);
  });
});
