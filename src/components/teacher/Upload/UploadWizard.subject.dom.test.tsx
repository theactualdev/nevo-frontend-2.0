import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { detail, useCurrentUser, start } = vi.hoisted(() => ({
  detail: vi.fn(),
  useCurrentUser: vi.fn(),
  start: vi.fn().mockResolvedValue("staged"),
}));
vi.mock("@/lib/api/lessons", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/lessons")>();
  return { ...actual, lessonsApi: { ...actual.lessonsApi, detail } };
});
vi.mock("@/hooks/useCurrentUser", () => ({ useCurrentUser }));
vi.mock("@/hooks/useStagedUpload", () => ({
  useStagedUpload: () => ({
    uploadId: null,
    status: null,
    stage: null,
    structure: null,
    segments: undefined,
    failedPages: [],
    retrying: false,
    lessonTitle: null,
    failed: false,
    error: null,
    slow: false,
    start,
    retryFailedPages: vi.fn(),
    reset: vi.fn(),
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { UploadWizard } from "./UploadWizard";
import { setSession, clearSession } from "@/lib/auth/session";

/**
 * The subject a teacher puts on an upload.
 *
 * Both upload routes have accepted an optional `subject` since they existed,
 * and neither wrapper sent one - so every lesson this console created arrived
 * unlabelled, and the library's filter had nothing to sort by. The wizard is
 * where the value has to be collected, which is why it is tested here rather
 * than only at the API.
 *
 * THE OPTIONS COME FROM THE TEACHER, not from a list in this repo. C07 draws
 * a four-value select that is already wrong for this product's own fixtures,
 * where a class is Biology, Chemistry and Physics.
 */

const identity = (subjects: string[]) => ({
  userId: "t-1",
  role: "teacher",
  name: "Amina Bello",
  initials: "AB",
  email: "amina@school.test",
  school: "Corona",
  subjects,
  photoUrl: null,
});

const chooseScope = (name: RegExp) =>
  fireEvent.click(screen.getByRole("button", { name }));

const dropFile = () => {
  const input = document.querySelector('input[type="file"]');
  if (!input) throw new Error("no file input");
  fireEvent.change(input, {
    target: { files: [new File(["x"], "lesson.pdf", { type: "application/pdf" })] },
  });
};

beforeEach(() => {
  detail.mockReset().mockResolvedValue({
    id: "l-1",
    title: "Fractions",
    segmentCount: 1,
    reviewSegmentCount: 0,
    segments: [],
    modules: [],
    confirmationSummary: null,
  });
  start.mockReset();
  useCurrentUser.mockReset().mockReturnValue(identity(["Mathematics", "English"]));
  clearSession();
  window.localStorage.clear();
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: "t-1",
    role: "teacher",
  });
});

describe("the subject on an upload", () => {
  it("offers the teacher's own subjects", () => {
    render(<UploadWizard />);

    const select = screen.getByRole("combobox", { name: /subject/i });
    expect(select).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Mathematics" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "English" })).toBeInTheDocument();
    // Optional on the wire, so it must be possible to send none.
    expect(screen.getByRole("option", { name: "Not set" })).toBeInTheDocument();
  });

  it("asks nothing when the teacher has no subjects recorded", () => {
    // There is no vocabulary to offer, and inventing one is how a product
    // ends up with a taxonomy nobody agreed to.
    useCurrentUser.mockReturnValue(identity([]));

    render(<UploadWizard />);

    expect(screen.queryByRole("combobox", { name: /subject/i })).not.toBeInTheDocument();
  });

  it("sends it with a single lesson", async () => {
    render(<UploadWizard />);
    fireEvent.change(screen.getByRole("combobox", { name: /subject/i }), {
      target: { value: "English" },
    });
    chooseScope(/one lesson/i);
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    dropFile();

    await waitFor(() =>
      expect(start).toHaveBeenCalledWith(expect.any(File), "lesson", "English"),
    );
  });

  it("calls the scope what the contract calls it", async () => {
    /*
     * THE ONE TRANSLATION IN THE MOVE, and a 422 if it is dropped. This
     * wizard names its scopes single / unit / term, after C07c. The upload
     * body takes `^(lesson|unit|term)$`, so two of the three already agree
     * and the third does not - and "single" would be refused by a validator
     * that says nothing a teacher could act on.
     *
     * Asserted on its own rather than only inside the case above, where a
     * reader would take the string for part of the subject.
     */
    render(<UploadWizard />);
    chooseScope(/one lesson/i);
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    dropFile();

    await waitFor(() => expect(start).toHaveBeenCalled());
    expect(start.mock.calls[0][1]).toBe("lesson");
    expect(start.mock.calls[0][1]).not.toBe("single");
  });

  it("sends nothing when the teacher left it unset", async () => {
    render(<UploadWizard />);
    chooseScope(/one lesson/i);
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    dropFile();

    await waitFor(() =>
      expect(start).toHaveBeenCalledWith(expect.any(File), "lesson", undefined),
    );
  });

  it("sends it with a whole unit too", async () => {
    // The staged route takes the same optional field, and a unit is where a
    // subject is most useful: it labels every lesson the parse produces.
    render(<UploadWizard />);
    fireEvent.change(screen.getByRole("combobox", { name: /subject/i }), {
      target: { value: "Mathematics" },
    });
    chooseScope(/whole unit|unit/i);
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    dropFile();

    await waitFor(() =>
      expect(start).toHaveBeenCalledWith(expect.any(File), "unit", "Mathematics"),
    );
  });
});
