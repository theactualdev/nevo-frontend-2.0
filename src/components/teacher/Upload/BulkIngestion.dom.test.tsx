import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const { batch, status, list, create, getToken } = vi.hoisted(() => ({
  batch: vi.fn(),
  status: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  getToken: vi.fn(),
}));
vi.mock("@/lib/api/uploads", () => ({
  uploadsApi: { batch, status, list, create },
}));
vi.mock("@/lib/api/lessons", () => ({ lessonsApi: { detail: vi.fn() } }));
vi.mock("@/lib/auth/session", () => ({ getToken }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { BulkIngestion } from "./BulkIngestion";

/**
 * The bulk parsing beat, and the counter that belonged to nobody.
 *
 * `TOTAL` is the frame's hardcoded 13 and `sorted` is advanced only by
 * `runDemo`, the signed-out beat. On the live path neither was touched, so a
 * signed-in teacher watched "0 of 13 lessons sorted" at 0% for the whole batch
 * - a fraction describing neither their files nor their progress - while the
 * inventory recorded this screen as LIVE with nothing missing.
 *
 * There is no per-lesson progress on the wire to replace it with: the batch
 * endpoint reports FILES accepted, not lessons sorted. So the fix is to say
 * what is known and let the spinner carry the waiting.
 */

const drop = (n: number) => {
  const input = document.querySelector('input[type="file"]');
  if (!input) throw new Error("no file input");
  const files = Array.from({ length: n }, (_, i) =>
    new File(["x"], `unit-${i}.pdf`, { type: "application/pdf" }),
  );
  Object.defineProperty(input, "files", { value: files, configurable: true });
  fireEvent.change(input);
};

beforeEach(() => {
  batch.mockReset();
  status.mockReset();
  list.mockReset();
  create.mockReset();
  getToken.mockReset();
  // A promise that never settles: the screen stays on the parsing beat, which
  // is the state under test.
  batch.mockReturnValue(new Promise(() => {}));
});

describe("a signed-in teacher's real batch", () => {
  beforeEach(() => getToken.mockReturnValue("tok"));

  it("shows no invented fraction while it parses", () => {
    render(<BulkIngestion />);
    drop(4);

    expect(screen.queryByText(/of 13 lessons sorted/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/0 of/i)).not.toBeInTheDocument();
  });

  it("says how many files actually went", () => {
    // The one number this path genuinely knows.
    render(<BulkIngestion />);
    drop(4);

    expect(screen.getByText(/4 files sent for reading/i)).toBeInTheDocument();
  });

  it("says file, not files, for one", () => {
    render(<BulkIngestion />);
    drop(1);

    expect(screen.getByText(/1 file sent for reading/i)).toBeInTheDocument();
  });

  it("still shows that something is happening", () => {
    // Removing the fraction must not leave a blank screen mid-parse.
    render(<BulkIngestion />);
    drop(2);

    expect(screen.getByText(/Working through your material/i)).toBeInTheDocument();
  });
});

describe("the signed-out designed beat", () => {
  it("keeps its counted bar", () => {
    // The demo is the one place the frame's 13 means anything, and design drew
    // it. It must not be collateral damage from fixing the live path.
    getToken.mockReturnValue(null);

    render(<BulkIngestion />);
    drop(3);

    expect(screen.getByText(/of 13 lessons sorted/i)).toBeInTheDocument();
  });

  it("sends nothing to the backend", () => {
    getToken.mockReturnValue(null);

    render(<BulkIngestion />);
    drop(3);

    expect(batch).not.toHaveBeenCalled();
  });
});

/**
 * THE TITLE THAT NEVER ARRIVED.
 *
 * `lessonTitle` landed on the upload status response on 3 Sep so a teacher
 * would see "Simplifying Expressions" instead of "wk2-final-v3.docx". The
 * screen read it ONCE, immediately after `POST /api/v1/uploads/batch`
 * resolved - and that POST returns as soon as the files are ACCEPTED, before
 * the parse has read a word of them. Every title came back null, every row
 * fell back to its filename, and nothing looked broken, because the fallback
 * is exactly what this screen did before the feature existed.
 *
 * A live upload on 23 Sep put the earliest possible title at about thirty
 * seconds. So the read is now repeated until each upload stops moving.
 */
const ONE_ACCEPTED = {
  acceptedCount: 1,
  rejectedCount: 0,
  uploads: [
    {
      uploadId: "u-1",
      filename: "wk2-final-v3.docx",
      accepted: true,
      error: null,
      status: "processing",
      stage: "lessons",
    },
  ],
};

/** Longer than one poll interval, so exactly one round goes out. */
const ONE_ROUND = 5000;

describe("the title that arrives after the batch does", () => {
  beforeEach(() => {
    getToken.mockReturnValue("tok");
    batch.mockResolvedValue(ONE_ACCEPTED);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Drop one file and let the batch POST resolve onto the results screen. */
  const toResults = async () => {
    render(<BulkIngestion />);
    drop(1);
    await act(async () => {});
  };

  /**
   * ONE POLL ROUND PER act BLOCK, and this is load-bearing rather than tidy.
   *
   * React commits the new waiting-list and re-arms the effect when the block
   * EXITS, so advancing four intervals inside one block fires exactly one
   * timeout. Two of the tests below were written that way and a mutation run
   * caught them: "a refused read is retried for ever" survived, because the
   * assertion counted one request either way.
   */
  const rounds = async (n = 1) => {
    for (let i = 0; i < n; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ONE_ROUND);
      });
    }
  };

  it("shows the filename while the parse is still reading", async () => {
    list.mockResolvedValue([{ id: "u-1", status: "processing", lessonTitle: null }]);

    await toResults();
    await rounds();

    expect(screen.getByText("wk2-final-v3.docx")).toBeInTheDocument();
  });

  it("shows the parse's own title once it lands, and keeps the filename", async () => {
    // Still reading on the first round; named on the second. This is the case
    // the single read could never reach.
    list
      .mockResolvedValueOnce([{ id: "u-1", status: "processing", lessonTitle: null }])
      .mockResolvedValueOnce([
        { id: "u-1", status: "ready", lessonTitle: "Simplifying Expressions" },
      ]);

    await toResults();
    await rounds(2);

    expect(screen.getByText("Simplifying Expressions")).toBeInTheDocument();
    expect(screen.getByText("wk2-final-v3.docx")).toBeInTheDocument();
  });

  it("stops asking once the upload has stopped moving", async () => {
    list.mockResolvedValue([
      { id: "u-1", status: "ready", lessonTitle: "Angles & Triangles" },
    ]);

    await toResults();
    await rounds();
    const afterFirst = list.mock.calls.length;
    await rounds(4);

    expect(afterFirst).toBe(1);
    expect(list.mock.calls.length).toBe(afterFirst);
  });

  it("drops an upload whose status read is refused rather than asking for ever", async () => {
    /*
     * That route answered 500 for every in-flight upload for three weeks. A
     * retry-until-it-answers would have been an endless request loop behind a
     * teacher's back, for a field that only ever improves a label.
     */
    list.mockRejectedValue(new Error("500"));

    await toResults();
    await rounds(4);

    expect(list.mock.calls.length).toBe(1);
    expect(screen.getByText("wk2-final-v3.docx")).toBeInTheDocument();
  });
});

describe("the imports this screen cannot perform", () => {
  /*
   * Two buttons with no handler, under a divider reading "or bring it from".
   * A teacher whose scheme of work lives in Drive - most of them - clicked one
   * and nothing happened at all. `POST /api/v1/uploads/import` exists, but it
   * needs a `fileId` that only Google's Picker or Microsoft Graph can produce,
   * and that needs an OAuth client id per school.
   */
  it("offers no import it cannot perform", () => {
    getToken.mockReturnValue("tok");

    render(<BulkIngestion />);

    expect(
      screen.queryByRole("button", { name: /google drive/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /onedrive/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/or bring it from/i)).not.toBeInTheDocument();
  });
});

/**
 * ONE REQUEST FOR THE BATCH, AND A ROW THAT OWNS ITS OWN FAILURE.
 *
 * Two things landed together on 24 Sep and they belong in one place, because
 * the second is only affordable because of the first. `GET /api/v1/uploads`
 * replaced twenty per-upload polls a round; the same answer already carried
 * `status`, `failureReason` and `incidentId`, and dropping them is how a row
 * went on looking like a success for a parse that had died.
 *
 * Design, 24 Sep: *"The row has to change and own it... keeping the filename and
 * looking like the others is the worst version, because the teacher walks away
 * believing it worked."*
 */
const THREE_ACCEPTED = {
  acceptedCount: 3,
  rejectedCount: 0,
  uploads: [0, 1, 2].map((i) => ({
    uploadId: `u-${i + 1}`,
    filename: `unit-${i}.pdf`,
    accepted: true,
    error: null,
    status: "processing",
    stage: "lessons",
  })),
};

describe("a batch that is accepted and then fails", () => {
  beforeEach(() => {
    getToken.mockReturnValue("tok");
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const toResults = async (n = 3, result = THREE_ACCEPTED) => {
    batch.mockResolvedValue(result);
    render(<BulkIngestion />);
    drop(n);
    await act(async () => {});
  };

  const rounds = async (n = 1) => {
    for (let i = 0; i < n; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
    }
  };

  it("asks once for the whole batch, not once per upload", async () => {
    list.mockResolvedValue(
      [1, 2, 3].map((i) => ({ id: `u-${i}`, status: "processing" })),
    );

    await toResults();
    await rounds();

    expect(list.mock.calls.length).toBe(1);
    expect(status).not.toHaveBeenCalled();
  });

  it("asks for a window wider than the batch, so nothing falls out of it", async () => {
    // Another tab's upload would otherwise push the oldest of this batch past
    // the limit, and a row absent from the answer learns nothing.
    list.mockResolvedValue([{ id: "u-1", status: "processing" }]);

    await toResults();
    await rounds();

    expect(list.mock.calls[0][0].limit).toBeGreaterThan(3);
  });

  it("keeps asking about an id the window did not cover", async () => {
    // Absent is not settled. Treating it as settled leaves the row saying it is
    // being read for ever.
    list.mockResolvedValue([{ id: "u-1", status: "ready", lessonTitle: "One" }]);

    await toResults();
    await rounds(2);

    expect(list.mock.calls.length).toBe(2);
  });

  it("says the reading stopped, in the server's words", async () => {
    list.mockResolvedValue([
      {
        id: "u-1",
        status: "failed",
        failureReason: "A fault at our end, not anything about your file.",
      },
      { id: "u-2", status: "ready", lessonTitle: "Angles" },
      { id: "u-3", status: "ready", lessonTitle: "Fractions" },
    ]);

    await toResults();
    await rounds();

    expect(
      screen.getByText("A fault at our end, not anything about your file."),
    ).toBeInTheDocument();
  });

  it("owns it in our own words when the server gave none", async () => {
    list.mockResolvedValue([{ id: "u-1", status: "failed" }]);

    await toResults(1, {
      acceptedCount: 1,
      rejectedCount: 0,
      uploads: [THREE_ACCEPTED.uploads[0]],
    });
    await rounds();

    expect(screen.getByText(/ours to sort out/i)).toBeInTheDocument();
  });

  it("never shows the raw error, even on the row that failed", async () => {
    // `error` is a driver exception. The first real one seen was an asyncpg
    // `UndefinedColumnError` with the failing INSERT in it.
    list.mockResolvedValue([
      {
        id: "u-1",
        status: "failed",
        failureReason: "A fault at our end.",
        error:
          "(sqlalchemy...asyncpg.ProgrammingError) column \"depth_variants\" does not exist",
      },
    ]);

    await toResults(1, {
      acceptedCount: 1,
      rejectedCount: 0,
      uploads: [THREE_ACCEPTED.uploads[0]],
    });
    await rounds();

    expect(
      screen.queryAllByText(/asyncpg|depth_variants/i),
    ).toHaveLength(0);
  });

  it("offers the reference a failed parse carries", async () => {
    list.mockResolvedValue([
      { id: "u-1", status: "failed", incidentId: "ca8435c98d08" },
    ]);

    await toResults(1, {
      acceptedCount: 1,
      rejectedCount: 0,
      uploads: [THREE_ACCEPTED.uploads[0]],
    });
    await rounds();

    expect(screen.getByText(/ca8435c98d08/)).toBeInTheDocument();
  });

  it("does not claim a failure while the parse is merely still running", async () => {
    // Accepted is not parsed, and "not yet finished" is not "failed". Only
    // `status: "failed"` may change this row.
    list.mockResolvedValue([{ id: "u-1", status: "processing" }]);

    await toResults();
    await rounds();

    expect(screen.queryByText(/ours to sort out/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /send this one again/i }),
    ).not.toBeInTheDocument();
  });

  it("sends that one file again, and starts asking about the new upload", async () => {
    /*
     * NOTHING IN THE CONTRACT RE-RUNS A FAILED PARSE. `retry-pages` needs page
     * numbers and takes at least one; a wholesale failure reports none.
     * `regenerate` needs a lesson id, and a failed staged upload reports null.
     * So the retry is the thing a teacher would do by hand.
     */
    list.mockResolvedValue([{ id: "u-1", status: "failed" }]);
    create.mockResolvedValue({ uploadId: "u-9", status: "processing", stage: "lessons" });

    await toResults(1, {
      acceptedCount: 1,
      rejectedCount: 0,
      uploads: [THREE_ACCEPTED.uploads[0]],
    });
    await rounds();

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /send this one again/i }),
      );
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][1]).toBe("term");
    // The row now describes a different upload, so the failure it reported must
    // not outlive the upload that failed.
    expect(screen.queryByText(/ours to sort out/i)).not.toBeInTheDocument();
  });
});

describe("a resend that cannot know which file a row is", () => {
  beforeEach(() => {
    getToken.mockReturnValue("tok");
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("offers nothing when the rows and the files sent disagree", async () => {
    /*
     * The retry is positional - the batch endpoint reports one row per file in
     * order, so row i is file i. A mismatch means we do not know which file a
     * row is, and re-uploading the wrong document is worse than offering
     * nothing. Found by a mutation run: removing the guard changed no test,
     * because every other case here has them agreeing.
     */
    list.mockResolvedValue([{ id: "u-1", status: "failed" }]);
    batch.mockResolvedValue({
      acceptedCount: 1,
      rejectedCount: 0,
      // TWO rows for ONE file dropped.
      uploads: [
        { uploadId: "u-1", filename: "unit-0.pdf", accepted: true, error: null, status: "failed", stage: "lessons" },
        { uploadId: "u-2", filename: "ghost.pdf", accepted: true, error: null, status: "processing", stage: "lessons" },
      ],
    });

    render(<BulkIngestion />);
    drop(1);
    await act(async () => {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    // The failure is still owned - only the action is withheld.
    expect(screen.getByText(/ours to sort out/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /send this one again/i }),
    ).not.toBeInTheDocument();
  });
});
