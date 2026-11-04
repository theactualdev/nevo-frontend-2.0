import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { detail, useCurrentUser, start, confirm, updateStructure, staged } =
  vi.hoisted(() => ({
    detail: vi.fn(),
    useCurrentUser: vi.fn(),
    start: vi.fn(),
    confirm: vi.fn(),
    updateStructure: vi.fn(),
    staged: { value: {} as Record<string, unknown> },
  }));
vi.mock("@/lib/api/lessons", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/lessons")>();
  return { ...actual, lessonsApi: { ...actual.lessonsApi, detail } };
});
vi.mock("@/lib/api/uploads", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/uploads")>();
  return {
    ...actual,
    uploadsApi: { ...actual.uploadsApi, confirm, updateStructure },
  };
});
vi.mock("@/hooks/useCurrentUser", () => ({ useCurrentUser }));
vi.mock("@/hooks/useStagedUpload", () => ({
  useStagedUpload: () => staged.value,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { UploadWizard } from "./UploadWizard";
import { setSession, clearSession } from "@/lib/auth/session";
import { followUpload, followedUploads } from "@/lib/uploads/followedUploads";

/* The same staged-upload harness as UploadWizard.review.dom.test.tsx. */



const LESSON = {
  id: "l-1",
  title: "Adding fractions",
  segmentCount: 1,
  reviewSegmentCount: 0,
  segments: [],
  modules: [],
  confirmationSummary: null,
};

const stagedState = (over: Record<string, unknown> = {}) => {
  staged.value = {
    uploadId: null,
    status: null,
    stage: null,
    structure: null,
    segments: undefined,
    failedPages: [],
    retrying: false,
    lessonTitle: null,
    failed: false,
    failureKind: null,
    error: null,
    slow: false,
    start,
    retryFailedPages: vi.fn(),
    reset: vi.fn(),
    ...over,
  };
};


const dropFile = () => {
  const input = document.querySelector('input[type="file"]');
  if (!input) throw new Error("no file input");
  fireEvent.change(input, {
    target: {
      files: [new File(["x"], "fractions.pdf", { type: "application/pdf" })],
    },
  });
};

const uploadOneLesson = () => {
  render(<UploadWizard />);
  fireEvent.click(screen.getByRole("button", { name: /one lesson/i }));
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
  dropFile();
};

beforeEach(() => {
  stagedState();
  detail.mockReset().mockResolvedValue(LESSON);
  start.mockReset().mockResolvedValue("staged");
  confirm.mockReset().mockResolvedValue({ lessonId: "l-1", status: "confirmed" });
  updateStructure.mockReset();
  useCurrentUser.mockReset().mockReturnValue(null);
  clearSession();
  window.localStorage.clear();
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: "t-1",
    role: "teacher",
  });
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * C07j LU-02 and LU-03 (backlog 17, 18, 20): the upload follows the teacher.
 * Every upload staged here is remembered on this device by its id, "Carry on"
 * goes back to the library while it runs, and `?upload=` brings them back to
 * one this device follows.
 */
describe("the upload follows the teacher", () => {
  it("is remembered on this device once the server has given it an id", () => {
    const { rerender } = render(<UploadWizard />);
    fireEvent.click(screen.getByRole("button", { name: /one lesson/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    dropFile();
    stagedState({ uploadId: "u-9", status: "processing", stage: "lessons" });
    rerender(<UploadWizard />);

    expect(followedUploads("t-1")).toEqual([
      expect.objectContaining({ uploadId: "u-9", name: "fractions.pdf", scope: "single" }),
    ]);
  });

  it("offers Carry on back to the library while it runs", () => {
    stagedState({ uploadId: "u-9", status: "processing", stage: "lessons" });
    uploadOneLesson();

    expect(
      screen.getByRole("link", { name: "Carry on - we’ll tell you when it’s ready" }),
    ).toHaveAttribute("href", "/teacher/lessons");
  });

  it("picks up an upload this device follows, from ?upload=", async () => {
    const adopt = vi.fn();
    stagedState({ adopt });
    followUpload("t-1", { uploadId: "u-7", name: "Osmosis.pdf", scope: "single", startedAt: "2026-11-04T10:00:00Z" });
    window.history.pushState({}, "", "/teacher/lessons/upload?upload=u-7");
    try {
      render(<UploadWizard />);
      await waitFor(() => expect(adopt).toHaveBeenCalledWith("u-7"));
    } finally {
      window.history.pushState({}, "", "/");
    }
  });

  it("ignores an id this device never followed", () => {
    const adopt = vi.fn();
    stagedState({ adopt });
    window.history.pushState({}, "", "/teacher/lessons/upload?upload=someone-elses");
    try {
      render(<UploadWizard />);
      expect(adopt).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: /one lesson/i })).toBeInTheDocument();
    } finally {
      window.history.pushState({}, "", "/");
    }
  });
});
