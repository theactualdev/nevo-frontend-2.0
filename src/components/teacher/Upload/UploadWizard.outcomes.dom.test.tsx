import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { detail, useCurrentUser, start, staged } = vi.hoisted(() => ({
  detail: vi.fn(),
  useCurrentUser: vi.fn(),
  start: vi.fn(),
  staged: { value: {} as Record<string, unknown> },
}));
vi.mock("@/lib/api/lessons", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/lessons")>();
  return { ...actual, lessonsApi: { ...actual.lessonsApi, detail } };
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
 * WHAT THE UPLOAD SCREEN SAYS WHEN THINGS GO WRONG - and it was saying the
 * same thing for three different things.
 *
 * Backend's report, 18 Sep: polling gave up after five minutes and showed
 * "We couldn't reach Nevo just then" for run de43cb1c, which had COMPLETED
 * half a second before the last poll went out. Ten segments, sitting in the
 * library, reported as a failure.
 *
 * Underneath that were two more confusions in the same handler. A run that
 * finished FAILED was turned into a synthetic 500 and reported as a
 * connection problem, discarding the `failureReason` the backend had written.
 * And the only other outcome, a request that genuinely failed, was the one
 * case that sentence fits.
 *
 * Three outcomes, three things to say. That is what this file pins.
 *
 * THE PIPELINE UNDERNEATH THEM CHANGED ON 21 SEP, and these tests moved with
 * it rather than being deleted. The single-lesson path used
 * `POST /api/content/upload`, which returns no upload id and therefore has no
 * structure to review - so C07g's step 3 could never be wired to it. It stages
 * the file now, like a unit does, and the three outcomes are the staged
 * hook's `failureKind` rather than this component's own try/catch.
 *
 * ONE OF THEM WOULD HAVE BEEN LOST IN THE MOVE. `useStagedUpload` reported
 * EVERY refused upload as `request` - our server being unreachable - where the
 * old single path classified by status and blamed the file only when the
 * server had answered about the file. Kept, as `failureKind: "file"`, and the
 * block path gains the distinction it never had.
 */

const LESSON = {
  id: "l-1",
  title: "Fractions",
  segmentCount: 1,
  reviewSegmentCount: 0,
  segments: [],
  modules: [],
  confirmationSummary: null,
};

const dropFile = () => {
  const input = document.querySelector('input[type="file"]');
  if (!input) throw new Error("no file input");
  fireEvent.change(input, {
    target: {
      files: [new File(["x"], "lesson.pdf", { type: "application/pdf" })],
    },
  });
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

const startSingleUpload = () => {
  render(<UploadWizard />);
  fireEvent.click(screen.getByRole("button", { name: /one lesson/i }));
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
  dropFile();
};

const startUnitUpload = () => {
  render(<UploadWizard />);
  fireEvent.click(screen.getByRole("button", { name: /whole unit|unit/i }));
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
  dropFile();
};

beforeEach(() => {
  stagedState();
  detail.mockReset().mockResolvedValue(LESSON);
  start.mockReset();
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

describe("a run that finished failed", () => {
  it("says the reading did not finish, not that we lost the connection", () => {
    stagedState({
      uploadId: "u-1",
      failed: true,
      failureKind: "parse",
      error: "The document had no readable text after page 3.",
    });

    startSingleUpload();

    expect(screen.getByText(/couldn’t finish this one/i)).toBeInTheDocument();
    expect(screen.queryByText(/couldn’t reach Nevo/i)).not.toBeInTheDocument();
  });

  it("says the server's own reason rather than guessing at one", () => {
    // The backend knows why and we do not. This was being thrown away.
    stagedState({
      uploadId: "u-1",
      failed: true,
      failureKind: "parse",
      error: "The document had no readable text after page 3.",
    });

    startSingleUpload();

    expect(
      screen.getByText("The document had no readable text after page 3."),
    ).toBeInTheDocument();
  });

  it("does not open the lesson that was never built", () => {
    stagedState({
      uploadId: "u-1",
      failed: true,
      failureKind: "parse",
      error: null,
    });

    startSingleUpload();

    expect(screen.getByText(/couldn’t finish this one/i)).toBeInTheDocument();
    expect(detail).not.toHaveBeenCalled();
  });
});

describe("a request that failed", () => {
  it("is the one case that is about the connection", () => {
    stagedState({ uploadId: "u-1", failed: true, failureKind: "request" });

    startSingleUpload();

    expect(screen.getByText(/couldn’t reach Nevo/i)).toBeInTheDocument();
  });
});

describe("a file the server refused", () => {
  it("blames the file only when the server answered about the file", () => {
    /*
     * The third outcome, and the one the move onto the staged hook would
     * have quietly dropped: `start` reported every rejection as `request`,
     * so a 422 about the document would have been shown as our own outage,
     * with "nothing is wrong with your file" written over a file the server
     * had just refused.
     */
    stagedState({ uploadId: "u-1", failed: true, failureKind: "file" });

    startSingleUpload();

    expect(screen.getByText(/couldn’t read this file/i)).toBeInTheDocument();
    expect(screen.queryByText(/couldn’t reach Nevo/i)).not.toBeInTheDocument();
  });
});

describe("a parse that is simply taking a while", () => {
  it("says so rather than leaving a teacher to decide it has hung", () => {
    /*
     * The screen used to promise "under a minute" - measured on a parse with
     * no pictures in it. In production the text step alone runs about 115
     * seconds, and each generated image has a budget of up to 600.
     *
     * The measure is the staged hook's now, taken from when the file went up,
     * rather than a timer this component kept for a path it no longer owns.
     */
    stagedState({ uploadId: "u-1", status: "processing", slow: true });

    startSingleUpload();

    expect(screen.getByText(/Still building your lesson/i)).toBeInTheDocument();
  });

  it("promises no duration it cannot keep", () => {
    stagedState({ uploadId: "u-1", status: "processing" });

    startSingleUpload();

    expect(screen.getByText(/Reading the content/i)).toBeInTheDocument();
    expect(screen.queryByText(/under a minute/i)).not.toBeInTheDocument();
  });
});

describe("the same failures on a whole unit", () => {
  it("names the connection when the request failed", () => {
    stagedState({ uploadId: "u-1", failed: true, failureKind: "request" });

    startUnitUpload();

    expect(screen.getByText(/couldn’t reach Nevo/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/couldn’t read that one/i),
    ).not.toBeInTheDocument();
  });

  it("names the file when the server refused the file", () => {
    // The block path had two sentences for three outcomes, and a refused
    // unit was told the reading had started and stopped partway.
    stagedState({ uploadId: "u-1", failed: true, failureKind: "file" });

    startUnitUpload();

    expect(screen.getByText(/couldn’t read that one/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/started and stopped partway/i),
    ).not.toBeInTheDocument();
  });

  it("names the parse when the parse stopped", () => {
    stagedState({
      uploadId: "u-1",
      failed: true,
      failureKind: "parse",
      error: null,
    });

    startUnitUpload();

    expect(screen.getByText(/couldn’t finish that one/i)).toBeInTheDocument();
  });
});
