import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

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

/**
 * STEP 3 OF THE SINGLE-LESSON PATH, which a signed-in teacher could not reach.
 *
 * C07g: "Review the sections - segment and module review, the SCRUM-101 step.
 * No lesson-level pass." What shipped was a component hardcoded to the
 * Photosynthesis six and reachable only with NO token, so the step existed for
 * a visitor to the marketing site and not for the teacher whose lesson it is.
 *
 * It could not simply be wired where it stood. `PUT /uploads/{id}/structure`
 * is the only endpoint in the contract that writes module boundaries, and the
 * single path used `POST /api/content/upload`, whose receipt carries no upload
 * id. The staged route takes `scope` with a default of `lesson`; the pipeline
 * was always able to do this and the single path was not using it.
 *
 * THE FIXTURE LEAK THIS ALMOST SHIPPED, and the reason one test here looks
 * like a duplicate of another. The wizard chose between the live outcome and
 * the fixture review on `parsed ? ... : <SectionReview />`. Confirm now reads
 * the lesson back, so for the moment between confirming and that read landing,
 * `parsed` is null on a path where it never used to be - and a signed-in
 * teacher would have been shown Photosynthesis as though it were their upload.
 * The fixture is gated on `sample` now, which is what it always meant.
 */

const STRUCTURE = {
  lessonId: "l-1",
  modules: [],
  lessons: [
    {
      lessonId: "l-1",
      title: "Adding fractions",
      sequenceOrder: 1,
      modules: [
        {
          title: "Finding a common denominator",
          sequenceOrder: 1,
          segmentIds: ["s1"],
          recap: null,
          preview: null,
        },
      ],
    },
  ],
};

const SEGMENTS = [
  {
    segmentKey: "s1",
    title: "Halves and thirds",
    contentType: "explanatory_text",
    sequenceOrder: 1,
    estimatedMinutes: 3,
    needsReview: false,
  },
];

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

const ready = (over: Record<string, unknown> = {}) =>
  stagedState({
    uploadId: "u-1",
    status: "ready",
    stage: "structure",
    structure: STRUCTURE,
    segments: SEGMENTS,
    ...over,
  });

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
  start.mockReset();
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

describe("a teacher's own lesson reaches the review", () => {
  it("shows what Nevo proposed, from the upload", () => {
    ready();

    uploadOneLesson();

    expect(
      screen.getByDisplayValue("Finding a common denominator"),
    ).toBeInTheDocument();
    expect(screen.getByText("Halves and thirds")).toBeInTheDocument();
  });

  it("shows nothing from the Photosynthesis fixture", () => {
    // The whole defect in one assertion: this screen used to be unreachable
    // signed in, and what stood in its place named a lesson nobody uploaded.
    ready();

    uploadOneLesson();

    expect(
      screen.queryByText(/What plants need to live/),
    ).not.toBeInTheDocument();
  });

  it("asks the question the frame asks", () => {
    ready();

    uploadOneLesson();

    expect(
      screen.getByRole("heading", { name: "How should this lesson be split up?" }),
    ).toBeInTheDocument();
  });

  it("waits for the parse before it asks anything", () => {
    stagedState({ uploadId: "u-1", status: "processing", stage: "lessons" });

    uploadOneLesson();

    // The heading became the lesson's own name over a stage ladder
    // (SCRUM-172). Still the processing screen, still not the review.
    expect(screen.getByText("fractions")).toBeInTheDocument();
    expect(screen.getByText("Reading the document")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Looks right, continue" }),
    ).not.toBeInTheDocument();
  });

  it("waits even once there is a structure to show", () => {
    /*
     * A STRUCTURE IS NOT A FINISHED PARSE. `useStagedUpload` writes
     * `structure` on every poll, so it is on the hook well before the status
     * settles - and a review opened then asks a teacher to approve boundaries
     * that are still moving, over a document Nevo is still reading.
     *
     * A mutation run is what found this: dropping the status check from the
     * gate killed nothing, because every other test here had a null structure
     * whenever the status was not ready.
     */
    ready({ status: "processing", stage: "lessons" });

    uploadOneLesson();

    expect(
      screen.queryByRole("button", { name: "Looks right, continue" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByDisplayValue("Finding a common denominator"),
    ).not.toBeInTheDocument();
  });
});

describe("committing it", () => {
  it("opens the lesson that was created, not the one that was uploaded", async () => {
    // `confirm` answers with the lesson id: on a split the server mints them,
    // so the id to read back is its answer rather than the one we started
    // with.
    confirm.mockResolvedValue({ lessonId: "l-77", status: "confirmed" });
    ready();

    uploadOneLesson();
    fireEvent.click(screen.getByRole("button", { name: "Looks right, continue" }));

    await waitFor(() => expect(detail).toHaveBeenCalledWith("l-77"));
  });

  it("lands on the outcome screen for the real lesson", async () => {
    ready();

    uploadOneLesson();
    fireEvent.click(screen.getByRole("button", { name: "Looks right, continue" }));

    expect(await screen.findByText("Adding fractions")).toBeInTheDocument();
    expect(
      screen.queryByText(/What plants need to live/),
    ).not.toBeInTheDocument();
  });

  it("says the lesson is ready even when reading it back failed", async () => {
    // Confirm answered: the lesson exists and is in the library. Failing to
    // re-read it is not a failure to create it, and saying so would send a
    // teacher to upload the same file twice.
    detail.mockRejectedValue(new Error("network"));
    ready();

    uploadOneLesson();
    fireEvent.click(screen.getByRole("button", { name: "Looks right, continue" }));

    expect(await screen.findByText(/is ready/)).toBeInTheDocument();
  });
});

describe("the signed-out walkthrough", () => {
  it("still walks the designed beats on fixture content", async () => {
    // The demo is the one place the Photosynthesis six belong, and it is the
    // reason `SectionReview` is kept rather than deleted.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    clearSession();
    window.localStorage.clear();
    stagedState();

    uploadOneLesson();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(
      await screen.findByText(/What plants need to live/),
    ).toBeInTheDocument();
    // And it says so, rather than passing the sample off as the upload.
    expect(screen.getByText(/this is a sample lesson/)).toBeInTheDocument();
  });
});
