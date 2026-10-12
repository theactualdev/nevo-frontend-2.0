import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { confirm, updateStructure, undo, push } = vi.hoisted(() => ({
  confirm: vi.fn(),
  updateStructure: vi.fn(),
  undo: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/lib/api/uploads", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/uploads")>();
  return { ...actual, uploadsApi: { ...actual.uploadsApi, confirm, updateStructure, undo } };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: push, prefetch: vi.fn() }),
}));

import { LiveStructureTree } from "./LiveStructureTree";
import type { UploadSegment, UploadStructure } from "@/lib/api/uploads";

/**
 * T73 and T70. The structure document carries the unit's own `title` and its
 * `segments` rows as of 12 Oct, and `PUT structure` persists renames at both
 * levels. So the block header and each segment row are inputs, and what a
 * teacher types there goes back in the document the commit saves first.
 */

const row = (segmentKey: string, title: string | null, sequenceOrder: number): UploadSegment => ({
  segmentKey,
  title,
  contentType: "explanatory_text",
  sequenceOrder,
  estimatedMinutes: 3,
  needsReview: false,
});

const ROWS = [row("k-1", "Springs", 1), row("k-2", "Streams", 2), row("k-3", null, 3)];

const doc = (over: Partial<UploadStructure> = {}): UploadStructure => ({
  lessonId: "l-1",
  modules: [],
  lessons: [
    {
      lessonId: "l-1",
      title: "Rivers",
      sequenceOrder: 1,
      modules: [
        { title: "Where rivers start", sequenceOrder: 1, segmentIds: ["k-1", "k-2", "k-3"], recap: null, preview: null },
      ],
    },
  ],
  ...over,
});

const show = (structure: UploadStructure, segments?: UploadSegment[]) =>
  render(
    <LiveStructureTree uploadId="u-1" structure={structure} segments={segments} blockName="water-cycle" />,
  );

/** What Save sent, the whole document. */
const saved = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(updateStructure).toHaveBeenCalled());
  return updateStructure.mock.calls.at(-1)?.[1] as UploadStructure;
};

/** Whether the browser would ask before leaving: the event was cancelled. */
const leavingAsks = () => {
  const e = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
};

beforeEach(() => {
  confirm.mockReset().mockResolvedValue({});
  updateStructure.mockReset().mockImplementation((_id: string, structure: unknown) =>
    Promise.resolve({ id: "u-1", structure, canUndo: true }),
  );
  undo.mockReset();
  push.mockReset();
});

describe("the unit's own title (T73)", () => {
  it("is an input holding the document's title", () => {
    show(doc({ title: "The water cycle", segments: ROWS }));

    expect(screen.getByLabelText("Unit title")).toHaveValue("The water cycle");
  });

  it("goes back as structure.title when renamed", async () => {
    show(doc({ title: "The water cycle", segments: ROWS }));
    fireEvent.change(screen.getByLabelText("Unit title"), { target: { value: "Water on the move" } });

    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    const sent = await saved();
    expect(sent.title).toBe("Water on the move");
    // The rest of the document goes back as it was.
    expect(sent.lessons?.[0].title).toBe("Rivers");
  });

  it("is written as typed when emptied, as a lesson title is", async () => {
    show(doc({ title: "The water cycle", segments: ROWS }));
    fireEvent.change(screen.getByLabelText("Unit title"), { target: { value: "" } });

    expect((await saved()).title).toBe("");
  });

  it("shows what the server stored once saved", async () => {
    updateStructure.mockResolvedValue({
      id: "u-1",
      structure: doc({ title: "Water on the move (stored)", segments: ROWS }),
      canUndo: true,
    });
    show(doc({ title: "The water cycle", segments: ROWS }));
    fireEvent.change(screen.getByLabelText("Unit title"), { target: { value: "Water on the move" } });
    await saved();

    expect(await screen.findByDisplayValue("Water on the move (stored)")).toBeInTheDocument();
  });

  it("comes back with an undo", async () => {
    undo.mockResolvedValue({ id: "u-1", structure: doc({ title: "The water cycle", segments: ROWS }), canUndo: false });
    show(doc({ title: "The water cycle", segments: ROWS }));
    fireEvent.change(screen.getByLabelText("Unit title"), { target: { value: "Water on the move" } });
    await saved();
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));

    await waitFor(() => expect(screen.getByLabelText("Unit title")).toHaveValue("The water cycle"));
  });
});

describe("a title the parse did not find", () => {
  it("leaves the unit's field empty, hinting only the file's own name", async () => {
    show(doc({ segments: ROWS }));
    const field = screen.getByLabelText("Unit title");

    expect(field).toHaveValue("");
    expect(field).toHaveAttribute("placeholder", "water-cycle");

    // An edit elsewhere does not write a title on the parse's behalf.
    fireEvent.change(screen.getByLabelText("Lesson 1 title"), { target: { value: "Rivers and streams" } });
    expect(await saved()).not.toHaveProperty("title");
  });

  it("sends a null title back as null, not as the file's name", async () => {
    show(doc({ title: null, segments: ROWS }));
    expect(screen.getByLabelText("Unit title")).toHaveValue("");

    fireEvent.change(screen.getByLabelText("Lesson 1 title"), { target: { value: "Rivers and streams" } });
    expect((await saved()).title).toBeNull();
  });

  it("leaves a segment's field empty, hinting only its number", async () => {
    show(doc({ title: "The water cycle", segments: ROWS }));
    const field = screen.getByLabelText("Segment 3 title");

    expect(field).toHaveValue("");
    expect(field).toHaveAttribute("placeholder", "Segment 3");

    fireEvent.change(screen.getByLabelText("Segment 1 title"), { target: { value: "Mountain springs" } });
    const sent = await saved();
    expect(sent.segments?.find((s) => s.segmentKey === "k-3")?.title).toBeNull();
  });
});

describe("a segment's title (T70)", () => {
  it("is an input on each named row", () => {
    show(doc({ title: "The water cycle", segments: ROWS }));

    expect(screen.getByLabelText("Segment 1 title")).toHaveValue("Springs");
    expect(screen.getByLabelText("Segment 2 title")).toHaveValue("Streams");
  });

  it("goes back on its own row in structure.segments when renamed", async () => {
    show(doc({ title: "The water cycle", segments: ROWS }));
    fireEvent.change(screen.getByLabelText("Segment 1 title"), { target: { value: "Mountain springs" } });

    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    const sent = await saved();
    expect(sent.segments).toEqual([
      { ...ROWS[0], title: "Mountain springs" },
      ROWS[1],
      ROWS[2],
    ]);
  });

  it("keeps the space a teacher is typing", () => {
    show(doc({ title: "The water cycle", segments: ROWS }));
    fireEvent.change(screen.getByLabelText("Segment 1 title"), { target: { value: "Mountain " } });

    expect(screen.getByLabelText("Segment 1 title")).toHaveValue("Mountain ");
  });

  it("travels with its segment when the segment moves", async () => {
    show(doc({ title: "The water cycle", segments: ROWS }));
    fireEvent.change(screen.getByLabelText("Segment 1 title"), { target: { value: "Mountain springs" } });
    fireEvent.click(screen.getByRole("button", { name: "Move Mountain springs down" }));

    expect(screen.getByLabelText("Segment 2 title")).toHaveValue("Mountain springs");
    const sent = await saved();
    expect(sent.lessons?.[0].modules[0].segmentIds).toEqual(["k-2", "k-1", "k-3"]);
    expect(sent.segments?.find((s) => s.segmentKey === "k-1")?.title).toBe("Mountain springs");
  });

  it("reads the document's rows over the status response's", () => {
    show(doc({ title: "The water cycle", segments: ROWS }), [row("k-1", "Old springs", 1)]);

    expect(screen.getByLabelText("Segment 1 title")).toHaveValue("Springs");
  });

  it("falls back to the status response's rows when the document has none", async () => {
    show(doc({ title: "The water cycle" }), ROWS);
    fireEvent.change(screen.getByLabelText("Segment 2 title"), { target: { value: "Fast streams" } });

    const sent = await saved();
    expect(sent.segments?.find((s) => s.segmentKey === "k-2")?.title).toBe("Fast streams");
  });

  it("is not offered for a key with no row to hold a title", () => {
    show(doc({ title: "The water cycle", segments: [row("k-1", "Springs", 1)] }));

    expect(screen.getByText("Segment 2")).toBeInTheDocument();
    expect(screen.queryByLabelText("Segment 2 title")).not.toBeInTheDocument();
  });
});

describe("adding to the library", () => {
  it("saves the renamed unit and segment titles before it asks, then commits", async () => {
    show(doc({ title: "The water cycle", segments: ROWS }));
    fireEvent.change(screen.getByLabelText("Unit title"), { target: { value: "Water on the move" } });
    fireEvent.change(screen.getByLabelText("Segment 2 title"), { target: { value: "Fast streams" } });
    fireEvent.click(screen.getByRole("button", { name: /Looks right - add to my library/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Yes, add them" }));

    await waitFor(() => expect(confirm).toHaveBeenCalledWith("u-1"));
    const sent = updateStructure.mock.calls[0][1] as UploadStructure;
    expect(sent.title).toBe("Water on the move");
    expect(sent.segments?.find((s) => s.segmentKey === "k-2")?.title).toBe("Fast streams");
    expect(updateStructure.mock.invocationCallOrder[0]).toBeLessThan(confirm.mock.invocationCallOrder[0]);
  });
});

describe("the unsaved guard", () => {
  it("asks before leaving once the unit is renamed, until it is saved", async () => {
    show(doc({ title: "The water cycle", segments: ROWS }));
    expect(leavingAsks()).toBe(false);

    fireEvent.change(screen.getByLabelText("Unit title"), { target: { value: "Water on the move" } });
    expect(leavingAsks()).toBe(true);

    await saved();
    await screen.findByRole("button", { name: "Saved" });
    await waitFor(() => expect(leavingAsks()).toBe(false));
  });

  it("asks before leaving once a segment is renamed", () => {
    show(doc({ title: "The water cycle", segments: ROWS }));
    fireEvent.change(screen.getByLabelText("Segment 1 title"), { target: { value: "Mountain springs" } });

    expect(leavingAsks()).toBe(true);
  });
});
