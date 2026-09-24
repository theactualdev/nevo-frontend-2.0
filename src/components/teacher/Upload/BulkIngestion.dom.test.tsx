import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const { batch, status, getToken } = vi.hoisted(() => ({
  batch: vi.fn(),
  status: vi.fn(),
  getToken: vi.fn(),
}));
vi.mock("@/lib/api/uploads", () => ({ uploadsApi: { batch, status } }));
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
    status.mockResolvedValue({ status: "processing", lessonTitle: null });

    await toResults();
    await rounds();

    expect(screen.getByText("wk2-final-v3.docx")).toBeInTheDocument();
  });

  it("shows the parse's own title once it lands, and keeps the filename", async () => {
    // Still reading on the first round; named on the second. This is the case
    // the single read could never reach.
    status
      .mockResolvedValueOnce({ status: "processing", lessonTitle: null })
      .mockResolvedValueOnce({ status: "ready", lessonTitle: "Simplifying Expressions" });

    await toResults();
    await rounds(2);

    expect(screen.getByText("Simplifying Expressions")).toBeInTheDocument();
    expect(screen.getByText("wk2-final-v3.docx")).toBeInTheDocument();
  });

  it("stops asking once the upload has stopped moving", async () => {
    status.mockResolvedValue({ status: "ready", lessonTitle: "Angles & Triangles" });

    await toResults();
    await rounds();
    const afterFirst = status.mock.calls.length;
    await rounds(4);

    expect(afterFirst).toBe(1);
    expect(status.mock.calls.length).toBe(afterFirst);
  });

  it("drops an upload whose status read is refused rather than asking for ever", async () => {
    /*
     * That route answered 500 for every in-flight upload for three weeks. A
     * retry-until-it-answers would have been an endless request loop behind a
     * teacher's back, for a field that only ever improves a label.
     */
    status.mockRejectedValue(new Error("500"));

    await toResults();
    await rounds(4);

    expect(status.mock.calls.length).toBe(1);
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
