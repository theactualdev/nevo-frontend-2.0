import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { LessonDetailResponse } from "@/lib/api/lessons";
import { ApiError } from "@/lib/api/client";

const { editStructure, push } = vi.hoisted(() => ({
  editStructure: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/lib/api/lessons", () => ({ lessonsApi: { editStructure } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: push, back: push, prefetch: vi.fn() }),
}));

import { LessonStructureEdit } from "./LessonStructureEdit";

/**
 * C07d for a lesson already in the library (Teslim d78756b), shipped reduced
 * (the Hub, 28 Oct): renaming everywhere, arrows to reorder, moving between
 * sections, a new section, folding into the one above. An assigned lesson
 * offers renaming only, and a reorder says the review is signed again.
 */
const lesson = (over: Record<string, unknown> = {}) =>
  ({
    id: "l-1",
    title: "Osmosis",
    status: "completed",
    assignmentCount: 0,
    segments: [
      { id: "s-1", segmentKey: "k-1", sequenceOrder: 1, title: "Water in" },
      { id: "s-2", segmentKey: "k-2", sequenceOrder: 2, title: "Water out" },
      { id: "s-3", segmentKey: "k-3", sequenceOrder: 3, title: "Cells" },
    ],
    modules: [
      { id: "m-1", title: "Water", recap: "Water moves.", preview: null, sequenceOrder: 1, segmentIds: [], segmentRecordIds: ["s-1", "s-2"] },
      { id: "m-2", title: "Cells", recap: null, preview: null, sequenceOrder: 2, segmentIds: [], segmentRecordIds: ["s-3"] },
    ],
    ...over,
  }) as unknown as LessonDetailResponse;

beforeEach(() => {
  editStructure.mockReset();
  push.mockReset();
  editStructure.mockResolvedValue({});
});

describe("renaming", () => {
  it("saves a new name, and says the review is not affected", async () => {
    render(<LessonStructureEdit lesson={lesson()} />);
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox", { name: "Segment 1 title" }), {
      target: { value: "Water goes in" },
    });
    expect(screen.getByText("Only names change, so the review is not affected.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(editStructure).toHaveBeenCalled());
    const [id, body] = editStructure.mock.calls[0];
    expect(id).toBe("l-1");
    expect(body.segments[0]).toEqual({ id: "s-1", title: "Water goes in" });
    // Recap and preview go back as read, or the route wipes them.
    expect(body.modules[0]).toEqual({
      id: "m-1",
      title: "Water",
      segmentRecordIds: ["s-1", "s-2"],
      recap: "Water moves.",
      preview: null,
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/teacher/lessons/l-1/review?step=1"));
  });

  it("won't save a section with no name", () => {
    render(<LessonStructureEdit lesson={lesson()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Section 1 title" }), { target: { value: " " } });

    expect(screen.getByText("The lesson and every section need a name.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });
});

describe("reordering", () => {
  it("moves a segment, and says the review needs signing again", () => {
    render(<LessonStructureEdit lesson={lesson()} />);
    fireEvent.click(screen.getByRole("button", { name: "Move Water out up" }));

    const titles = screen.getAllByRole("textbox", { name: /^Segment \d title$/ }).map((i) => (i as HTMLInputElement).value);
    expect(titles).toEqual(["Water out", "Water in", "Cells"]);
    expect(
      screen.getByText("Changing the order means the review needs your sign-off again."),
    ).toBeInTheDocument();
  });

  it("starts a new section, and folds one into the section above", () => {
    render(<LessonStructureEdit lesson={lesson()} />);
    fireEvent.click(screen.getByRole("button", { name: "Start a new section after Water in" }));
    expect(screen.getByRole("textbox", { name: "Section 3 title" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Fold section 2 into the section above" }));
    expect(screen.queryByRole("textbox", { name: "Section 3 title" })).not.toBeInTheDocument();
  });

  it("offers no split, merge or remove of a segment, which the route can't do", () => {
    render(<LessonStructureEdit lesson={lesson()} />);

    expect(screen.queryByRole("button", { name: /Remove|Merge|Split/ })).not.toBeInTheDocument();
  });
});

describe("an assigned lesson", () => {
  it("offers renaming only, and says why", () => {
    render(<LessonStructureEdit lesson={lesson({ assignmentCount: 3 })} />);

    expect(
      screen.getByText("This lesson is assigned, so its order can’t change while it is. You can still rename anything."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Move .* up/ })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Segment 1 title" })).toBeInTheDocument();
  });

  it("keeps the names and puts the order back when the server says it is assigned", async () => {
    editStructure.mockRejectedValueOnce(
      new ApiError(409, "x", { detail: { code: "lesson_structure_in_use" } }),
    );
    render(<LessonStructureEdit lesson={lesson()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Segment 3 title" }), { target: { value: "Inside cells" } });
    fireEvent.click(screen.getByRole("button", { name: "Move Water out up" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This lesson is assigned, so its order can’t change. Your new names are kept - save them on their own.",
    );
    const titles = screen.getAllByRole("textbox", { name: /^Segment \d title$/ }).map((i) => (i as HTMLInputElement).value);
    expect(titles).toEqual(["Water in", "Water out", "Inside cells"]);
    expect(screen.queryByRole("button", { name: /Move .* up/ })).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
