import { beforeEach, describe, expect, it, vi } from "vitest";
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
 * WHEN A SAFETY CHECK STOPS NEVO READING A LESSON (Lydia, 9 Nov, item 6).
 *
 * Before backend 86f8e10 a held file had no code of its own: it came back as
 * a plain failure or an empty upload, and a teacher concluded their file was the
 * problem. It is `reasonCode: "safety_held"` now, and the screen says Lydia's line
 * - "Nothing beyond that. Not which rule fired, not what triggered it, and
 * never anything that quotes or points at the content that caused it."
 */

const LINE =
  "Nevo stopped partway through this lesson because of a safety check, so the sections it would normally propose are not here. Nothing has reached your class.";

// The server's own sentences, as `content_parsing/failures.py` writes them.
const SERVER_HELD =
  "Our safety check held this file back, so the lesson has not been prepared. If the material is ordinary classroom content, tell us the reference below and we will look at the check rather than your file.";
const SERVER_UNAVAILABLE =
  "Our safety check could not run, so the lesson has not been prepared. Nothing is wrong with your file - please try again shortly.";

const dropFile = () => {
  const input = document.querySelector('input[type="file"]');
  if (!input) throw new Error("no file input");
  fireEvent.change(input, {
    target: { files: [new File(["x"], "lesson.pdf", { type: "application/pdf" })] },
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
    failureReason: null,
    reasonCode: null,
    incident: null,
    slow: false,
    reused: false,
    start,
    retryFailedPages: vi.fn(),
    resume: vi.fn(),
    adopt: vi.fn(),
    reset: vi.fn(),
    ...over,
  };
};

const stopped = (reasonCode: string, failureReason: string) =>
  stagedState({
    uploadId: "u-1",
    status: "failed",
    failed: true,
    failureKind: "parse",
    reasonCode,
    failureReason,
    incident: "ca8435c98d08",
  });

const startUpload = (scope: RegExp) => {
  render(<UploadWizard />);
  fireEvent.click(screen.getByRole("button", { name: scope }));
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
  dropFile();
};
const SINGLE = /one lesson/i;
const UNIT = /whole unit|unit/i;

beforeEach(() => {
  stagedState();
  detail.mockReset();
  start.mockReset().mockResolvedValue("staged");
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

describe.each([
  ["a single lesson", SINGLE],
  ["a unit", UNIT],
])("a safety stop on %s", (_name, scope) => {
  it("says Lydia's line, word for word, in place of the server's sentence", async () => {
    stopped("safety_held", SERVER_HELD);

    startUpload(scope);

    expect(await screen.findByText(LINE)).toBeInTheDocument();
    expect(screen.queryByText(SERVER_HELD)).not.toBeInTheDocument();
  });

  it("says nothing beyond it - no reference, no retry, nothing that blames the file", async () => {
    stopped("safety_held", SERVER_HELD);

    startUpload(scope);

    await screen.findByText(LINE);
    expect(screen.queryByText(/ca8435c98d08/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Try this file again/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Try another file/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/fine to send again/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to my library" })).toHaveAttribute(
      "href",
      "/teacher/lessons",
    );
  });
});

/*
 * The check could not run. Lydia has given no words for it (asked), so the
 * screen keeps the server's own sentence - which says nothing is wrong with
 * the file - and offers the same file again, never another one.
 */
describe("a safety check that could not run", () => {
  it("keeps the single lesson's screen as it is, with the server's sentence and the same file again", async () => {
    stopped("safety_check_unavailable", SERVER_UNAVAILABLE);

    startUpload(SINGLE);

    expect(await screen.findByText(SERVER_UNAVAILABLE)).toBeInTheDocument();
    expect(screen.queryByText(LINE)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Try this file again/ })).toBeInTheDocument();
  });

  it("offers a unit the same file again, not another one", async () => {
    stopped("safety_check_unavailable", SERVER_UNAVAILABLE);

    startUpload(UNIT);

    expect(await screen.findByText(SERVER_UNAVAILABLE)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Try another file/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try this file again" }));
    // The same file, staged again.
    expect(start).toHaveBeenCalledTimes(2);
  });
});

/*
 * THE UNIT CARD FOLLOWS THE SINGLE LESSON'S RULE (Hub, 9 Nov): "Try another
 * file" only where the file is the cause. A stop that is ours sends the same
 * file again - Lydia's item 6 reasoning, that it must not teach a teacher to
 * distrust their material.
 */
describe("any other stopped parse on a unit", () => {
  it("sends the same file again when the stop was not the file's fault", async () => {
    stopped("preparation_timeout", "Preparing this lesson took longer than we allow.");

    startUpload(UNIT);

    expect(await screen.findByText("Preparing this lesson took longer than we allow.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Try another file/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try this file again" }));
    expect(start).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(LINE)).not.toBeInTheDocument();
  });

  it("does the same for a stop the server gave no code for", async () => {
    stopped(null as unknown as string, "Nevo could not finish preparing this lesson.");

    startUpload(UNIT);

    expect(await screen.findByText("Nevo could not finish preparing this lesson.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try this file again" })).toBeInTheDocument();
  });

  it("offers another file only when the file held nothing to read", async () => {
    stopped("no_readable_text", "We could not find any lesson text in that file.");
    const reset = vi.fn();
    staged.value = { ...staged.value, reset };

    startUpload(UNIT);

    fireEvent.click(await screen.findByRole("button", { name: "Try another file" }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /Try this file again/ })).not.toBeInTheDocument();
  });
});
