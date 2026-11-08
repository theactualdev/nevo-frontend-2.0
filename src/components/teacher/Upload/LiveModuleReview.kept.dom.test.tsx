import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { updateStructure, confirm } = vi.hoisted(() => ({
  updateStructure: vi.fn(),
  confirm: vi.fn(),
}));
vi.mock("@/lib/api/uploads", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/uploads")>();
  return {
    ...actual,
    uploadsApi: { ...actual.uploadsApi, updateStructure, confirm },
  };
});

import { LiveModuleReview } from "./LiveModuleReview";
import { clearSession, setSession } from "@/lib/auth/session";
import type { UploadStructure } from "@/lib/api/uploads";

/**
 * Backlog item 44 (SCRUM-246): a single lesson's section edits survive a
 * lapsed session or leaving the page, as the unit tree's already do - kept on
 * the device for this upload, offered back, and never laid over the saved
 * sections until the teacher says so.
 */

const STRUCTURE: UploadStructure = {
  lessonId: "l-1",
  modules: [],
  lessons: [
    {
      lessonId: "l-1",
      title: "Photosynthesis",
      sequenceOrder: 1,
      modules: [
        { title: "Introduction", sequenceOrder: 1, segmentIds: ["s1", "s2"], recap: null, preview: null },
        { title: "Practice", sequenceOrder: 2, segmentIds: ["s3"], recap: null, preview: null },
      ],
    },
  ],
};

const SEGMENTS = [
  { segmentKey: "s1", title: "What plants need", contentType: "explanatory_text", sequenceOrder: 1, estimatedMinutes: 3, needsReview: false },
  { segmentKey: "s2", title: "Inside a leaf", contentType: "explanatory_text", sequenceOrder: 2, estimatedMinutes: 4, needsReview: false },
  { segmentKey: "s3", title: "Light and water", contentType: "explanatory_text", sequenceOrder: 3, estimatedMinutes: 3, needsReview: false },
];

const show = () =>
  render(
    <LiveModuleReview
      uploadId="u-1"
      structure={STRUCTURE}
      segments={SEGMENTS as never}
      onBack={vi.fn()}
      onConfirmed={vi.fn()}
    />,
  );

const kept = () =>
  Object.keys(window.localStorage).filter((k) => k.startsWith("nevo.draft.t-1.upload-sections:u-1"));
const sectionTitle = () => screen.getByLabelText("Section 1 title") as HTMLInputElement;
const rename = () => fireEvent.change(sectionTitle(), { target: { value: "Getting started" } });

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: "t-1",
    role: "teacher",
  });
  updateStructure.mockReset().mockImplementation((_id: string, s: unknown) =>
    Promise.resolve({ id: "u-1", structure: s, canUndo: true }),
  );
  confirm.mockReset().mockResolvedValue({ lessonId: "l-1", status: "confirmed" });
});

describe("section edits not yet saved", () => {
  it("are kept, and offered back - not laid over the sections - when the step opens again", async () => {
    const first = show();
    rename();
    await waitFor(() => expect(kept()).toHaveLength(1));
    first.unmount();

    show();
    // The saved sections, until the teacher answers.
    expect(sectionTitle().value).toBe("Introduction");
    fireEvent.click(screen.getByRole("button", { name: "Put it back" }));

    expect(sectionTitle().value).toBe("Getting started");
    expect(screen.queryByRole("button", { name: "Put it back" })).not.toBeInTheDocument();
  });

  it("are let go when the teacher discards them", async () => {
    const first = show();
    rename();
    await waitFor(() => expect(kept()).toHaveLength(1));
    first.unmount();

    show();
    fireEvent.click(screen.getByRole("button", { name: "Discard it" }));

    expect(sectionTitle().value).toBe("Introduction");
    expect(kept()).toHaveLength(0);
  });

  it("are let go once saved", async () => {
    show();
    rename();
    await waitFor(() => expect(kept()).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Looks right, continue" }));

    await waitFor(() => expect(updateStructure).toHaveBeenCalled());
    await waitFor(() => expect(kept()).toHaveLength(0));
  });

  it("offer nothing back when nothing was left", () => {
    show();

    expect(screen.queryByRole("button", { name: "Put it back" })).not.toBeInTheDocument();
    expect(kept()).toHaveLength(0);
  });
});
