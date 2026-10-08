import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { updateStructure, undo } = vi.hoisted(() => ({
  updateStructure: vi.fn(),
  undo: vi.fn(),
}));
vi.mock("@/lib/api/uploads", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/uploads")>();
  return { ...actual, uploadsApi: { ...actual.uploadsApi, updateStructure, undo, confirm: vi.fn() } };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { LiveStructureTree } from "./LiveStructureTree";

/**
 * T244. Undo on a unit's structure - the step back from a save - had no test.
 * It replaces what is on screen with what the server says the structure now
 * is, and offers itself only while there is a saved change to step back from.
 */

const lesson = (title: string) => ({
  lessonId: "l-1",
  title,
  sequenceOrder: 1,
  modules: [{ title: "Where rivers start", sequenceOrder: 1, segmentIds: ["k-1"], recap: null, preview: null }],
});
const structure = (title: string) => ({ lessonId: "l-1", modules: [], lessons: [lesson(title)] });
const SEGMENTS = [
  { segmentKey: "k-1", title: "Springs", contentType: "explanatory_text", sequenceOrder: 1, estimatedMinutes: 3, needsReview: false },
];

const saveRename = async (to: string) => {
  render(
    <LiveStructureTree uploadId="u-1" structure={structure("Rivers") as never} segments={SEGMENTS} blockName="Water" />,
  );
  fireEvent.change(screen.getByLabelText("Lesson 1 title"), { target: { value: to } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await screen.findByRole("button", { name: "Saved" });
};

beforeEach(() => {
  updateStructure.mockReset().mockImplementation((_id: string, s: unknown) =>
    Promise.resolve({ id: "u-1", structure: s, canUndo: true }),
  );
  undo.mockReset();
});

describe("undo", () => {
  it("is offered once a change has been saved", async () => {
    await saveRename("Streams");

    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
  });

  it("is not offered over changes that are not saved yet", async () => {
    await saveRename("Streams");
    fireEvent.change(screen.getByLabelText("Lesson 1 title"), { target: { value: "Streams and rivers" } });

    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });

  it("puts back what the server says the structure now is", async () => {
    undo.mockResolvedValue({ id: "u-1", structure: structure("Rivers"), canUndo: false });
    await saveRename("Streams");
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(await screen.findByDisplayValue("Rivers")).toBeInTheDocument();
    expect(undo).toHaveBeenCalledWith("u-1");
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });

  it("says so when it could not undo, and leaves the structure as it was", async () => {
    undo.mockRejectedValue(new Error("network"));
    await saveRename("Streams");
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(await screen.findByText("We couldn’t undo that just now.")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Streams")).toBeInTheDocument();
  });
});
