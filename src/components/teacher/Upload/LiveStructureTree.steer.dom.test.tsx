import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { confirm, updateStructure, push } = vi.hoisted(() => ({
  confirm: vi.fn(),
  updateStructure: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/lib/api/uploads", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/uploads")>();
  return { ...actual, uploadsApi: { ...actual.uploadsApi, confirm, updateStructure } };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: push, prefetch: vi.fn() }),
}));

import { LiveStructureTree } from "./LiveStructureTree";

/**
 * C07d's steering, on a real staged unit: the commit that saves before it
 * asks, and the tree that folds.
 */

const STRUCTURE = {
  lessonId: "l-1",
  modules: [],
  lessons: [
    {
      lessonId: "l-1",
      title: "Rivers",
      sequenceOrder: 1,
      modules: [
        { title: "Where rivers start", sequenceOrder: 1, segmentIds: ["k-1", "k-2"], recap: null, preview: null },
        { title: "Unnamed rows", sequenceOrder: 2, segmentIds: ["k-9"], recap: null, preview: null },
      ],
    },
    {
      lessonId: "l-2",
      title: "Deltas",
      sequenceOrder: 2,
      modules: [
        { title: "Where rivers end", sequenceOrder: 1, segmentIds: ["k-3"], recap: null, preview: null },
      ],
    },
  ],
};

const SEGMENTS = [
  { segmentKey: "k-1", title: "Springs", contentType: "explanatory_text", sequenceOrder: 1, estimatedMinutes: 3, needsReview: false },
  { segmentKey: "k-2", title: "Streams", contentType: "explanatory_text", sequenceOrder: 2, estimatedMinutes: 4, needsReview: false },
  { segmentKey: "k-3", title: "Mouths", contentType: "explanatory_text", sequenceOrder: 3, estimatedMinutes: 2, needsReview: false },
];

const show = () =>
  render(
    <LiveStructureTree
      uploadId="u-1"
      structure={STRUCTURE as never}
      segments={SEGMENTS}
      blockName="Water"
    />,
  );

const addButton = () =>
  screen.getByRole("button", { name: /Looks right - add to my library/ });

beforeEach(() => {
  confirm.mockReset().mockResolvedValue({});
  updateStructure.mockReset().mockImplementation((_id: string, structure: unknown) =>
    Promise.resolve({ id: "u-1", structure, canUndo: true }),
  );
  push.mockReset();
});

/**
 * T76. The commit was greyed out over unsaved edits, explained only by a
 * hover title. It now saves, then asks.
 */
describe("adding with unsaved changes", () => {
  it("stays pressable while there are unsaved edits", () => {
    show();
    fireEvent.change(screen.getByLabelText("Lesson 1 title"), { target: { value: "Rivers and streams" } });

    expect(addButton()).not.toBeDisabled();
    expect(addButton()).not.toHaveAttribute("title");
  });

  it("saves what is on screen first, then asks", async () => {
    show();
    fireEvent.change(screen.getByLabelText("Lesson 1 title"), { target: { value: "Rivers and streams" } });
    fireEvent.click(addButton());

    expect(await screen.findByRole("button", { name: "Yes, add them" })).toBeInTheDocument();
    expect(updateStructure).toHaveBeenCalledTimes(1);
    const sent = updateStructure.mock.calls[0][1] as { lessons: { title: string }[] };
    expect(sent.lessons[0].title).toBe("Rivers and streams");
    // Asking is not adding.
    expect(confirm).not.toHaveBeenCalled();
  });

  it("asks nothing when the save failed, and says why", async () => {
    updateStructure.mockRejectedValue(new Error("500"));
    show();
    fireEvent.change(screen.getByLabelText("Lesson 1 title"), { target: { value: "Rivers and streams" } });
    fireEvent.click(addButton());

    expect(await screen.findByText(/couldn.t save that just now/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Yes, add them" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Lesson 1 title")).toHaveValue("Rivers and streams");
  });

  it("asks straight away when there is nothing to save", async () => {
    show();
    fireEvent.click(addButton());

    expect(await screen.findByRole("button", { name: "Yes, add them" })).toBeInTheDocument();
    expect(updateStructure).not.toHaveBeenCalled();
  });
});

/**
 * T73. C07d draws a caret on each lesson and section, and "Expand all" /
 * "Collapse all" above the tree.
 */
describe("folding the tree", () => {
  it("opens fully expanded, so the toggle offers to collapse", () => {
    show();

    expect(screen.getAllByLabelText("Section 1 title")).toHaveLength(2);
    expect(screen.getByText("Springs")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse all" })).toBeInTheDocument();
  });

  it("collapses everything, then expands it all again", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));

    expect(screen.queryByLabelText("Section 1 title")).not.toBeInTheDocument();
    expect(screen.queryByText("Springs")).not.toBeInTheDocument();
    // The lessons themselves stay: only what is under them folds.
    expect(screen.getByLabelText("Lesson 1 title")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(screen.getAllByLabelText("Section 1 title")).toHaveLength(2);
    expect(screen.getByText("Springs")).toBeInTheDocument();
    expect(screen.getByText("Mouths")).toBeInTheDocument();
  });

  it("folds the sections too, so a lesson opened after Collapse all shows them folded", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    fireEvent.click(screen.getByRole("button", { name: "Lesson 1 sections" }));

    expect(screen.getAllByLabelText("Section 1 title")).toHaveLength(1);
    expect(screen.queryByText("Springs")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Section 1 segments" })[0]).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("folds one lesson without touching the other", () => {
    show();
    const caret = screen.getByRole("button", { name: "Lesson 1 sections" });
    fireEvent.click(caret);

    expect(caret).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Springs")).not.toBeInTheDocument();
    expect(screen.getByText("Mouths")).toBeInTheDocument();
    // Anything folded means the toggle now offers to expand.
    expect(screen.getByRole("button", { name: "Expand all" })).toBeInTheDocument();
  });

  it("folds a section's rows and keeps the section", () => {
    show();
    fireEvent.click(screen.getAllByRole("button", { name: "Section 1 segments" })[0]);

    expect(screen.queryByText("Springs")).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("Section 1 title")).toHaveLength(2);
  });

  it("offers no caret on a section with nothing named under it", () => {
    show();

    expect(screen.queryByRole("button", { name: "Section 2 segments" })).not.toBeInTheDocument();
  });

  it("keeps an edit made before folding", () => {
    show();
    fireEvent.change(screen.getByLabelText("Lesson 1 title"), { target: { value: "Rivers and streams" } });
    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));

    expect(screen.getByLabelText("Lesson 1 title")).toHaveValue("Rivers and streams");
  });
});

describe("the commit itself", () => {
  it("still adds once the teacher says yes", async () => {
    show();
    fireEvent.click(addButton());
    fireEvent.click(await screen.findByRole("button", { name: "Yes, add them" }));

    await waitFor(() => expect(confirm).toHaveBeenCalledWith("u-1"));
  });
});
