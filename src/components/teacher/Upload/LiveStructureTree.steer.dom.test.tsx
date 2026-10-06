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

  it("numbers a segment the parse did not name, rather than inventing a title", () => {
    show();

    // Lesson 1's third segment overall: two in section 1, then this one.
    expect(screen.getByText("Segment 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Section 2 segments" })).toBeInTheDocument();
  });

  it("opens nothing on an older upload that carries no segment rows", () => {
    render(<LiveStructureTree uploadId="u-1" structure={STRUCTURE as never} blockName="Water" />);

    expect(screen.queryByRole("button", { name: "Section 1 segments" })).not.toBeInTheDocument();
    expect(screen.queryByText("Segment 1")).not.toBeInTheDocument();
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

/** Whether the browser would ask before leaving: the event was cancelled. */
const leavingAsks = () => {
  const e = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
};

describe("edits the server has not seen", () => {
  it("make the browser ask before leaving, until they are saved", async () => {
    show();
    expect(leavingAsks()).toBe(false);

    fireEvent.change(screen.getByLabelText("Lesson 1 title"), { target: { value: "Rivers and streams" } });
    expect(leavingAsks()).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByRole("button", { name: "Saved" });
    expect(leavingAsks()).toBe(false);
  });
});

/**
 * T70. C07d steers at every level, segments included. `PUT structure` takes
 * `segmentIds` per section, so a segment can be reordered, moved to the
 * section beside it, or made the start of a new section.
 */
describe("steering a segment", () => {
  /** What Save would send for one lesson: its sections' keys, in order. */
  const sentKeys = async (li = 0) => {
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(updateStructure).toHaveBeenCalled());
    const sent = updateStructure.mock.calls.at(-1)?.[1] as {
      lessons: { modules: { segmentIds: string[]; title: string }[] }[];
    };
    return sent.lessons[li].modules;
  };

  it("reorders a segment within its section", async () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Move Springs down" }));

    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect((await sentKeys()).map((m) => m.segmentIds)).toEqual([["k-2", "k-1"], ["k-9"]]);
  });

  it("moves a segment to the start of the section below", async () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Move Streams to the section below" }));

    expect((await sentKeys()).map((m) => m.segmentIds)).toEqual([["k-1"], ["k-2", "k-9"]]);
  });

  it("moves a segment to the end of the section above, and drops a section it empties", async () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Move Segment 3 to the section above" }));

    const mods = await sentKeys();
    expect(mods.map((m) => m.segmentIds)).toEqual([["k-1", "k-2", "k-9"]]);
  });

  it("starts a new, untitled section after a segment", async () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Start a new section after Springs" }));

    const mods = await sentKeys();
    expect(mods.map((m) => m.segmentIds)).toEqual([["k-1"], ["k-2"], ["k-9"]]);
    expect(mods[1].title).toBe("");
    expect(mods[0].title).toBe("Where rivers start");
  });

  it("offers no split after a section's last segment", () => {
    show();

    expect(screen.getByRole("button", { name: "Start a new section after Springs" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start a new section after Streams" })).not.toBeInTheDocument();
  });

  it("holds the moves that would go nowhere", () => {
    show();

    expect(screen.getByRole("button", { name: "Move Springs up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Streams down" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Springs to the section above" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Segment 3 to the section below" })).toBeDisabled();
  });

  it("keeps a moved segment inside its own lesson", async () => {
    show();
    // Lesson 2 has one section, so its segment has nowhere to move across.
    expect(screen.getByRole("button", { name: "Move Mouths to the section above" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Move Streams to the section below" }));

    expect((await sentKeys(1)).map((m) => m.segmentIds)).toEqual([["k-3"]]);
  });
});
