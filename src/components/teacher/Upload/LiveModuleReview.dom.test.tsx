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
import type { UploadStructure } from "@/lib/api/uploads";

/**
 * SCRUM-101's module review, over a real staged upload.
 *
 * C07g makes this step 3 of the single-lesson path and a signed-in teacher
 * never reached it: the component that draws the frame is hardcoded to the
 * Photosynthesis six and gated on having no token. So the split, merge,
 * rename and re-order the frame promises existed for a visitor and not for a
 * teacher.
 *
 * WHAT THESE TESTS ARE ACTUALLY GUARDING is the write. Every control here
 * ends in one `PUT /uploads/{id}/structure` carrying the whole document back,
 * so an edit that looks right on screen and normalises wrongly is a lesson
 * that reaches children in the wrong order. The assertions are on what goes
 * over the wire, not only on what re-renders.
 */

const SEGMENTS = [
  { segmentKey: "s1", title: "What plants need to live", contentType: "explanatory_text", sequenceOrder: 1, estimatedMinutes: 3, needsReview: false },
  { segmentKey: "s2", title: "Inside a leaf", contentType: "explanatory_text", sequenceOrder: 2, estimatedMinutes: 4, needsReview: false },
  { segmentKey: "s3", title: "Light, water and air", contentType: "explanatory_text", sequenceOrder: 3, estimatedMinutes: 3, needsReview: true },
  { segmentKey: "s4", title: "Quick recap", contentType: "summary", sequenceOrder: 4, estimatedMinutes: 2, needsReview: false },
];

const structure = (over: Partial<UploadStructure> = {}): UploadStructure => ({
  lessonId: "l-1",
  modules: [],
  lessons: [
    {
      lessonId: "l-1",
      title: "Photosynthesis",
      sequenceOrder: 1,
      modules: [
        {
          title: "Introduction",
          sequenceOrder: 1,
          segmentIds: ["s1", "s2"],
          recap: "You saw what plants need.",
          preview: "Now you will try it.",
        },
        {
          title: "Practice",
          sequenceOrder: 2,
          segmentIds: ["s3", "s4"],
          recap: null,
          preview: null,
        },
      ],
    },
  ],
  ...over,
});

const show = (over: Partial<UploadStructure> = {}, props = {}) => {
  const onConfirmed = vi.fn();
  render(
    <LiveModuleReview
      uploadId="u-1"
      structure={structure(over)}
      segments={SEGMENTS as never}
      onBack={vi.fn()}
      onConfirmed={onConfirmed}
      {...props}
    />,
  );
  return { onConfirmed };
};

/** What the last save actually sent for the lesson being reviewed. */
const sentModules = () => updateStructure.mock.calls.at(-1)![1].lessons[0].modules;

const press = (name: RegExp | string) =>
  fireEvent.click(screen.getByRole("button", { name }));

beforeEach(() => {
  updateStructure.mockReset().mockImplementation((_id, s) =>
    Promise.resolve({ id: "u-1", structure: s, canUndo: true }),
  );
  confirm.mockReset().mockResolvedValue({ lessonId: "l-9", status: "confirmed" });
});

describe("what Nevo proposed", () => {
  it("shows the sections and names the segments under them", () => {
    show();

    expect(screen.getByDisplayValue("Introduction")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Practice")).toBeInTheDocument();
    expect(screen.getByText("What plants need to live")).toBeInTheDocument();
    expect(screen.getByText("Quick recap")).toBeInTheDocument();
  });

  it("numbers a segment the parse left untitled rather than naming it", () => {
    // `title` is nullable on the contract. Inventing one here would put words
    // in the parse's mouth and a teacher would never know.
    show({
      lessons: [
        {
          lessonId: "l-1",
          title: "T",
          sequenceOrder: 1,
          modules: [
            { title: "One", sequenceOrder: 1, segmentIds: ["sx"], recap: null, preview: null },
          ],
        },
      ],
    });

    expect(screen.getByText("Segment 1")).toBeInTheDocument();
  });

  it("says nothing about minutes when the parse measured none", () => {
    // `estimatedMinutes` defaults to 0 in the contract, and "about 0 minutes"
    // is a measurement we were never given.
    render(
      <LiveModuleReview
        uploadId="u-1"
        structure={structure()}
        segments={
          SEGMENTS.map((s) => ({ ...s, estimatedMinutes: 0 })) as never
        }
        onBack={vi.fn()}
        onConfirmed={vi.fn()}
      />,
    );

    expect(screen.queryByText(/minutes/)).not.toBeInTheDocument();
    expect(screen.getByText(/4 segments/)).toBeInTheDocument();
  });
});

describe("moving the boundaries", () => {
  it("splits a section after the segment the teacher chose", async () => {
    show();

    // The first Split control sits between segment 1 and segment 2.
    fireEvent.click(screen.getAllByRole("button", { name: "Split here" })[0]);
    press("Looks right, continue");

    await waitFor(() => expect(updateStructure).toHaveBeenCalled());
    expect(sentModules().map((m: { segmentIds: string[] }) => m.segmentIds)).toEqual([
      ["s1"],
      ["s2"],
      ["s3", "s4"],
    ]);
  });

  it("renumbers what it sends, so order is never a stale label", async () => {
    show();

    fireEvent.click(screen.getAllByRole("button", { name: "Split here" })[0]);
    press("Looks right, continue");

    await waitFor(() => expect(updateStructure).toHaveBeenCalled());
    expect(
      sentModules().map((m: { sequenceOrder: number }) => m.sequenceOrder),
    ).toEqual([1, 2, 3]);
  });

  it("merges a section into the one above it", async () => {
    show();

    press("Merge into Section 1");
    press("Looks right, continue");

    await waitFor(() => expect(updateStructure).toHaveBeenCalled());
    expect(sentModules()).toHaveLength(1);
    expect(sentModules()[0].segmentIds).toEqual(["s1", "s2", "s3", "s4"]);
  });

  it("keeps the preview of a section it folded away", async () => {
    // The preview belongs to whatever now comes last. Dropping it loses a
    // sentence a teacher wrote.
    show({
      lessons: [
        {
          lessonId: "l-1",
          title: "T",
          sequenceOrder: 1,
          modules: [
            { title: "One", sequenceOrder: 1, segmentIds: ["s1"], recap: null, preview: null },
            { title: "Two", sequenceOrder: 2, segmentIds: ["s2"], recap: null, preview: "Then the recap." },
          ],
        },
      ],
    });

    press("Merge into Section 1");
    press("Looks right, continue");

    await waitFor(() => expect(updateStructure).toHaveBeenCalled());
    expect(sentModules()[0].preview).toBe("Then the recap.");
  });

  it("moves a segment within its section", async () => {
    show();

    press(/Move Inside a leaf up/);
    press("Looks right, continue");

    await waitFor(() => expect(updateStructure).toHaveBeenCalled());
    expect(sentModules()[0].segmentIds).toEqual(["s2", "s1"]);
  });

  it("moves a segment into the section below", async () => {
    show();

    press(/Move Inside a leaf to the section below/);
    press("Looks right, continue");

    await waitFor(() => expect(updateStructure).toHaveBeenCalled());
    expect(sentModules()[0].segmentIds).toEqual(["s1"]);
    expect(sentModules()[1].segmentIds).toEqual(["s2", "s3", "s4"]);
  });

  it("drops a section the last segment left, rather than sending an empty one", async () => {
    show({
      lessons: [
        {
          lessonId: "l-1",
          title: "T",
          sequenceOrder: 1,
          modules: [
            { title: "One", sequenceOrder: 1, segmentIds: ["s1"], recap: null, preview: null },
            { title: "Two", sequenceOrder: 2, segmentIds: ["s2"], recap: null, preview: null },
          ],
        },
      ],
    });

    press(/Move What plants need to live to the section below/);
    press("Looks right, continue");

    await waitFor(() => expect(updateStructure).toHaveBeenCalled());
    expect(sentModules()).toHaveLength(1);
    expect(sentModules()[0].segmentIds).toEqual(["s1", "s2"]);
  });

  it("offers no move across when there is only one section", () => {
    show({
      lessons: [
        {
          lessonId: "l-1",
          title: "T",
          sequenceOrder: 1,
          modules: [
            { title: "One", sequenceOrder: 1, segmentIds: ["s1", "s2"], recap: null, preview: null },
          ],
        },
      ],
    });

    // Every one of them, not the first: a move across with nowhere to go
    // would drop the segment out of the only section there is.
    screen
      .getAllByRole("button", { name: /to the section (above|below)/ })
      .forEach((b) => expect(b).toBeDisabled());
  });
});

describe("renaming and the boundary copy", () => {
  it("sends the title a teacher typed", async () => {
    show();

    fireEvent.change(screen.getByLabelText("Section 1 title"), {
      target: { value: "Getting started" },
    });
    press("Looks right, continue");

    await waitFor(() => expect(updateStructure).toHaveBeenCalled());
    expect(sentModules()[0].title).toBe("Getting started");
  });

  it("sends an emptied recap as nothing, not as an empty string", async () => {
    // Nullable in the contract, and clearing the box is how a teacher removes
    // one. "" would store a boundary line that renders as a blank gap.
    show();

    fireEvent.change(screen.getAllByLabelText(/What you just did/)[0], {
      target: { value: "" },
    });
    press("Looks right, continue");

    await waitFor(() => expect(updateStructure).toHaveBeenCalled());
    expect(sentModules()[0].recap).toBeNull();
  });
});

describe("keeping it as one flow", () => {
  it("is a deliberate opt-out that sends no sections at all", async () => {
    show();

    press("Keep as one flow");
    expect(screen.getByText(/one continuous flow/)).toBeInTheDocument();
    press("Looks right, continue");

    await waitFor(() => expect(updateStructure).toHaveBeenCalled());
    expect(sentModules()).toEqual([]);
  });

  it("gives the teacher their own grouping back, not Nevo's", () => {
    show();

    fireEvent.change(screen.getByLabelText("Section 1 title"), {
      target: { value: "Getting started" },
    });
    press("Keep as one flow");
    press("Add sections back");

    expect(screen.getByDisplayValue("Getting started")).toBeInTheDocument();
  });
});

describe("a lesson Nevo proposed no sections for", () => {
  const flat = { lessons: [{ lessonId: "l-1", title: "T", sequenceOrder: 1, modules: [] }] };

  it("claims no reason it was not given", () => {
    /*
     * The frame says "this lesson is short - 5 segments or fewer - so it
     * stays as one flow", because it flips the default at 6+ segments in the
     * client. The server decides it and does not say why, so neither do we -
     * and counting segments here to reconstruct the sentence would be this
     * console deciding a threshold it does not own.
     */
    show(flat);

    expect(screen.getByText(/didn’t propose any sections/)).toBeInTheDocument();
    expect(screen.queryByText(/5 segments or fewer/)).not.toBeInTheDocument();
    // And it is ONE state, not both: there is nothing to go back to, so the
    // opt-out's own panel has no business here.
    expect(
      screen.queryByRole("button", { name: "Add sections back" }),
    ).not.toBeInTheDocument();
  });

  it("still lists the segments in the order the parse found them", () => {
    show(flat);

    const names = screen
      .getAllByText(/What plants need to live|Inside a leaf|Quick recap/)
      .map((n) => n.textContent);
    expect(names[0]).toBe("What plants need to live");
    expect(names[1]).toBe("Inside a leaf");
  });

  it("lets a teacher start the sections themselves", async () => {
    show(flat);

    press("Add sections myself");
    press("Looks right, continue");

    await waitFor(() => expect(updateStructure).toHaveBeenCalled());
    expect(sentModules()).toHaveLength(1);
    expect(sentModules()[0].segmentIds).toEqual(["s1", "s2", "s3", "s4"]);
  });
});

describe("continuing", () => {
  it("saves before it commits, because confirm acts on the stored structure", async () => {
    const order: string[] = [];
    updateStructure.mockImplementation((_id, s) => {
      order.push("save");
      return Promise.resolve({ id: "u-1", structure: s, canUndo: true });
    });
    confirm.mockImplementation(() => {
      order.push("confirm");
      return Promise.resolve({ lessonId: "l-9", status: "confirmed" });
    });
    show();

    press("Merge into Section 1");
    press("Looks right, continue");

    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(order).toEqual(["save", "confirm"]);
  });

  it("hands the lesson back to the wizard", async () => {
    const { onConfirmed } = show();

    press("Looks right, continue");

    await waitFor(() => expect(onConfirmed).toHaveBeenCalledWith("l-9"));
  });

  it("writes nothing when the teacher changed nothing", async () => {
    // The stored structure already is what is on screen. A save here would be
    // an undo point for an edit nobody made.
    const { onConfirmed } = show();

    press("Looks right, continue");

    await waitFor(() => expect(onConfirmed).toHaveBeenCalled());
    expect(updateStructure).not.toHaveBeenCalled();
  });

  it("does not commit a structure it could not save", async () => {
    updateStructure.mockRejectedValue(new Error("nope"));
    show();

    press("Merge into Section 1");
    press("Looks right, continue");

    expect(
      await screen.findByText(/couldn’t save how you’ve split this up/),
    ).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("says the split is safe when it was the commit that failed", async () => {
    confirm.mockRejectedValue(new Error("nope"));
    show();

    press("Merge into Section 1");
    press("Looks right, continue");

    expect(
      await screen.findByText(/trying again won’t lose it/),
    ).toBeInTheDocument();
  });
});

describe("reset", () => {
  it("restores what Nevo proposed", () => {
    show();

    press("Merge into Section 1");
    expect(screen.queryByDisplayValue("Practice")).not.toBeInTheDocument();

    press("Reset structure");
    expect(screen.getByDisplayValue("Practice")).toBeInTheDocument();
  });

  it("offers nothing to reset until something has changed", () => {
    show();

    expect(screen.getByRole("button", { name: "Reset structure" })).toBeDisabled();
  });
});

/**
 * DESIGN, 8 OCT: body content in the module review caps at 820px, centred -
 * the console's reading column, now a design-system value. It was 720px and
 * pinned to the left.
 */
describe("its reading column", () => {
  it("is 820px and centred, with no narrower cap inside it", () => {
    show();
    const column = document.querySelector("[class*='max-w-[820px]']")!;

    expect(column).toHaveClass("mx-auto");
    expect(document.querySelector("[class*='max-w-[720px]']")).toBeNull();
  });
});
