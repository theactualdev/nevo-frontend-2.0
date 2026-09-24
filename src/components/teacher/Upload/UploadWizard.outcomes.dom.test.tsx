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
    incident: null,
    slow: false,
    start,
    retryFailedPages: vi.fn(),
    reset: vi.fn(),
    ...over,
  };
};

/**
 * A REAL ONE, captured from a live upload on 23 Sep.
 *
 * `error` had never been legible before that day: the status route answered
 * 500 for every in-flight upload, so two screens rendered this field verbatim
 * as the sentence a teacher reads, on nothing but an assumption about what it
 * would hold. This is what it holds.
 */
const RAW_DB_ERROR =
  "(sqlalchemy.dialects.postgresql.asyncpg.ProgrammingError) " +
  "<class 'asyncpg.exceptions.UndefinedColumnError'>: column " +
  '"depth_variants" of relation "lesson_segments" does not exist\n' +
  "[SQL: INSERT INTO lesson_segments (lesson_id, parse_run_id, segment_key) " +
  "VALUES ($1::UUID, $2::UUID, $3::VARCHAR)]";

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
    /*
     * The heading moved on 23 Sep - "Nevo couldn't finish this one" became
     * "WE couldn't finish reading this one" - because design ruled that a
     * failed parse is ours and the copy has to say so rather than implying
     * the teacher handed us a bad file. What this test guards is unchanged.
     */
    stagedState({
      uploadId: "u-1",
      failed: true,
      failureKind: "parse",
      error: "The document had no readable text after page 3.",
    });

    startSingleUpload();

    expect(screen.getByText(/couldn’t finish reading this one/i)).toBeInTheDocument();
    expect(screen.queryByText(/couldn’t reach Nevo/i)).not.toBeInTheDocument();
  });

  it("does not put the server's own error in front of a teacher", () => {
    /*
     * IT USED TO. The argument was that the backend knows why and we do not,
     * which is true and is not the same as the backend having a sentence. A
     * teacher whose lesson did not arrive would have read a driver exception
     * with the failing INSERT and its bound UUIDs in it.
     */
    stagedState({
      uploadId: "u-1",
      failed: true,
      failureKind: "parse",
      error: RAW_DB_ERROR,
    });

    startSingleUpload();

    expect(
      screen.queryAllByText(/asyncpg|depth_variants|INSERT INTO/i),
    ).toHaveLength(0);
  });

  it("does not open the lesson that was never built", () => {
    stagedState({
      uploadId: "u-1",
      failed: true,
      failureKind: "parse",
      error: null,
    });

    startSingleUpload();

    expect(screen.getByText(/couldn’t finish reading this one/i)).toBeInTheDocument();
    expect(detail).not.toHaveBeenCalled();
  });
});

describe("a parse that stopped is not a file that was bad", () => {
  it("owns the failure instead of pointing at the teacher's file", () => {
    /*
     * Design, 23 Sep: the failed-parse state must not borrow the unreadable
     * one, because "unreadable is a file problem the teacher can fix by
     * uploading something else. A failed parse is our problem, and the copy
     * should say so rather than implying they gave us a bad file."
     */
    stagedState({ uploadId: "u-1", failed: true, failureKind: "parse", error: null });

    startSingleUpload();

    expect(screen.getByText(/ours to sort out/i)).toBeInTheDocument();
  });

  it("offers no hunt for a different file, because this one was fine", () => {
    // "Try another file" belongs to the unreadable screen. Here it would send
    // a teacher to find a replacement they do not need, one line after we
    // said their file was not the problem.
    stagedState({ uploadId: "u-1", failed: true, failureKind: "parse", error: null });

    startSingleUpload();

    expect(
      screen.queryByRole("button", { name: /try another file/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /try this file again/i }),
    ).toBeInTheDocument();
  });

  it("says our own sentence even when the server sent one of its own", () => {
    // The screen reads the same whether or not `error` is set, which is the
    // whole point: there is no input that turns this paragraph into the
    // server's words.
    stagedState({
      uploadId: "u-1",
      failed: true,
      failureKind: "parse",
      error: RAW_DB_ERROR,
    });

    startSingleUpload();

    expect(screen.getByText(/ours to sort out/i)).toBeInTheDocument();
    expect(screen.queryAllByText(/asyncpg/i)).toHaveLength(0);
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

describe("a failure nobody planned for", () => {
  it("gives a teacher something to quote", () => {
    /*
     * A 500 is the one failure this console can say nothing useful about.
     * Backend could not find the ~18 Sep one from their side because there
     * was nothing to match on; this is the smallest thing that fixes that.
     */
    stagedState({
      uploadId: "u-1",
      failed: true,
      failureKind: "request",
      incident: "a1b2c3d4",
    });

    startSingleUpload();

    expect(screen.getByText("a1b2c3d4")).toBeInTheDocument();
    expect(screen.getByText(/quote/i)).toBeInTheDocument();
  });

  it("says nothing when there is no reference", () => {
    // Most failures. An empty "quote this" line is worse than none.
    stagedState({ uploadId: "u-1", failed: true, failureKind: "request" });

    startSingleUpload();

    expect(screen.queryByText(/quote/i)).not.toBeInTheDocument();
  });

  it("offers no reference for a file the server explained", () => {
    // A refused file has a REASON, and a reason beats a reference. The
    // incident line must not follow a teacher onto a screen that already
    // told them what to do about it.
    stagedState({ uploadId: "u-1", failed: true, failureKind: "file" });

    startSingleUpload();

    expect(screen.getByText(/couldn’t read this file/i)).toBeInTheDocument();
    expect(screen.queryByText(/quote/i)).not.toBeInTheDocument();
  });

  it("gives a unit's teacher the same thing", () => {
    stagedState({
      uploadId: "u-1",
      failed: true,
      failureKind: "request",
      incident: "a1b2c3d4",
    });

    startUnitUpload();

    expect(screen.getByText("a1b2c3d4")).toBeInTheDocument();
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

    // SCRUM-172 replaced the spinner with the named ladder, so the sentence
    // moved. What it guards did not: a wait that is running long says so,
    // rather than leaving a teacher to decide the product has hung.
    expect(screen.getByText(/taking a while/i)).toBeInTheDocument();
    expect(screen.getByText(/hasn.t stalled/i)).toBeInTheDocument();
  });

  it("promises no duration it cannot keep", () => {
    stagedState({ uploadId: "u-1", status: "processing" });

    startSingleUpload();

    // The ladder is what a teacher reads now, and it promises nothing about
    // how long any of it takes - which is the point of the assertion below.
    expect(screen.getByText("Reading the document")).toBeInTheDocument();
    expect(screen.queryByText(/under a minute/i)).not.toBeInTheDocument();
    // And the long-wait line stays off a wait that is not long yet - said
    // over every upload it would stop meaning anything on the one that is.
    expect(screen.queryByText(/taking a while/i)).not.toBeInTheDocument();
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

  it("keeps the server's error off the block screen too", () => {
    // The same field was rendered on both paths, so removing it from one
    // would have left a teacher uploading a unit reading the exception.
    stagedState({
      uploadId: "u-1",
      failed: true,
      failureKind: "parse",
      error: RAW_DB_ERROR,
    });

    startUnitUpload();

    expect(screen.getByText(/started and stopped partway/i)).toBeInTheDocument();
    expect(
      screen.queryAllByText(/asyncpg|depth_variants|INSERT INTO/i),
    ).toHaveLength(0);
  });
});
