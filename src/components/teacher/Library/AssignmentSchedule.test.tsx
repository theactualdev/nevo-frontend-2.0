import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Assignment } from "@/lib/api/assignments";

const { applyToAssignments, useTeacherClasses } = vi.hoisted(() => ({
  applyToAssignments: vi.fn(),
  useTeacherClasses: vi.fn(),
}));

vi.mock("@/lib/api/assignments", () => ({ applyToAssignments }));
vi.mock("@/hooks/useTeacherClasses", () => ({ useTeacherClasses }));

import {
  AssignmentSchedule,
  describeWindow,
  groupByClass,
  onDay,
  toDateInput,
} from "./AssignmentSchedule";

/**
 * Editing and cancelling an assignment (C06b).
 *
 * `PATCH` and `DELETE /api/v1/assignments/{id}` sat in the deployed spec for
 * weeks with no caller, so a teacher who assigned the wrong lesson to the wrong
 * class had no route back inside the product.
 *
 * Two properties matter more than the rest, and both are about telling the
 * truth rather than about the happy path:
 *
 *   - a partial write is never reported as a whole one
 *   - a group reads "Cancelled" only when EVERY child in it is
 */

const row = (over: Partial<Assignment> = {}): Assignment => ({
  id: "a-1",
  lesson: { id: "l-1", title: "Photosynthesis" } as Assignment["lesson"],
  studentId: "s-1",
  classId: "c-1",
  status: "assigned",
  availableFrom: "2026-10-03T00:00:00.000Z",
  dueAt: "2026-10-10T00:00:00.000Z",
  /** Landed 15 Sep. Null here: these rows are about dates, not messages. */
  note: null,
  assignedAt: "2026-09-01T00:00:00.000Z",
  ...over,
});

const CLASS_OF_THREE = [
  row({ id: "a-1", studentId: "s-1" }),
  row({ id: "a-2", studentId: "s-2" }),
  row({ id: "a-3", studentId: "s-3" }),
];

beforeEach(() => {
  applyToAssignments.mockReset();
  // THE SHAPE A SIGNED-IN TEACHER ACTUALLY GETS. `useTeacherClasses` returns
  // `classes: []` on the live path and fills only `options`; `classes` is the
  // signed-OUT fixture list. The first version of this mock supplied `classes`,
  // which is a shape no real teacher ever sees - so it passed while the screen
  // rendered "A class" for every row. A mock that cannot be wrong is worse than
  // no mock.
  useTeacherClasses.mockReturnValue({
    classes: [],
    liveClasses: [{ classId: "c-1", className: "JSS 2A", classCode: "2A" }],
    options: [{ id: "c-1", name: "JSS 2A", joinCode: "2A" }],
    live: true,
    sample: false,
    loading: false,
  });
});

function openConfirm() {
  fireEvent.click(screen.getByRole("button", { name: /Cancel lesson/i }));
}

describe("what a teacher sees", () => {
  it("names the class from the LIVE list, not the signed-out fixtures", () => {
    // The regression this file missed once. `classes` is populated only when
    // signed out; a real teacher gets it empty and everything from `options`.
    // Reading the wrong one renders "A class" for every row on a screen only
    // signed-in teachers can reach.
    useTeacherClasses.mockReturnValue({
      classes: [],
      liveClasses: [{ classId: "c-1", className: "JSS 2A", classCode: "2A" }],
      options: [{ id: "c-1", name: "JSS 2A", joinCode: "2A" }],
      live: true,
      sample: false,
      loading: false,
    });
    render(<AssignmentSchedule assignments={CLASS_OF_THREE} />);

    expect(screen.getByText("JSS 2A")).toBeInTheDocument();
    expect(screen.queryByText("A class")).not.toBeInTheDocument();
  });

  it("falls back honestly when the class list has not arrived", () => {
    // "A class" is the right answer when we genuinely do not know - it must
    // stay reachable, just not be the answer for everyone.
    useTeacherClasses.mockReturnValue({
      classes: [], liveClasses: [], options: [],
      live: false, sample: false, loading: true,
    });
    render(<AssignmentSchedule assignments={CLASS_OF_THREE} />);

    expect(screen.getByText("A class")).toBeInTheDocument();
  });

  it("names the class and how many children it affects", () => {
    render(<AssignmentSchedule assignments={CLASS_OF_THREE} />);

    expect(screen.getByText("JSS 2A")).toBeInTheDocument();
    expect(screen.getByText(/3 students/)).toBeInTheDocument();
  });

  it("groups a whole class into ONE row, not one per child", () => {
    // A teacher set one thing. Thirty rows would be the data model leaking
    // through into the screen.
    render(<AssignmentSchedule assignments={CLASS_OF_THREE} />);
    expect(screen.getAllByRole("button", { name: /Cancel lesson/i })).toHaveLength(1);
  });

  it("says so plainly when a lesson has no dates", () => {
    render(
      <AssignmentSchedule
        assignments={[row({ availableFrom: null, dueAt: null })]}
      />,
    );
    expect(screen.getByText(/no dates set/)).toBeInTheDocument();
  });

  it("renders nothing at all when the lesson is assigned to nobody", () => {
    const { container } = render(<AssignmentSchedule assignments={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("cancelling", () => {
  it("cannot be done in one tap", () => {
    // It removes a lesson from real children's screens.
    render(<AssignmentSchedule assignments={CLASS_OF_THREE} />);
    openConfirm();

    expect(applyToAssignments).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Yes, cancel it/i })).toBeInTheDocument();
  });

  it("patches every row in the group to cancelled", async () => {
    applyToAssignments.mockResolvedValue({ ok: ["a-1", "a-2", "a-3"], failed: [] });
    render(<AssignmentSchedule assignments={CLASS_OF_THREE} />);
    openConfirm();
    fireEvent.click(screen.getByRole("button", { name: /Yes, cancel it/i }));

    expect(applyToAssignments).toHaveBeenCalledWith(["a-1", "a-2", "a-3"], {
      status: "cancelled",
    });
    expect(await screen.findByText(/Cancelled\. Students will no longer see/i)).toBeInTheDocument();
  });

  it("can be backed out of, having sent nothing", () => {
    render(<AssignmentSchedule assignments={CLASS_OF_THREE} />);
    openConfirm();
    fireEvent.click(screen.getByRole("button", { name: /Keep it/i }));

    expect(applyToAssignments).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Cancel lesson/i })).toBeInTheDocument();
  });

  it("NEVER reports a partial cancel as a whole one", async () => {
    // The assertion this file exists for. Two of three children lost the
    // lesson; the third still has it, and the teacher has to know.
    applyToAssignments.mockResolvedValue({ ok: ["a-1", "a-2"], failed: ["a-3"] });
    render(<AssignmentSchedule assignments={CLASS_OF_THREE} />);
    openConfirm();
    fireEvent.click(screen.getByRole("button", { name: /Yes, cancel it/i }));

    expect(
      await screen.findByText(/Cancelled for 2 of 3 students\. The rest still have it\./),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Cancelled\. Students will no longer see/)).not.toBeInTheDocument();
  });

  it("offers to retry only the ones that failed", async () => {
    applyToAssignments.mockResolvedValue({ ok: ["a-1", "a-2"], failed: ["a-3"] });
    render(<AssignmentSchedule assignments={CLASS_OF_THREE} />);
    openConfirm();
    fireEvent.click(screen.getByRole("button", { name: /Yes, cancel it/i }));

    applyToAssignments.mockClear();
    fireEvent.click(await screen.findByRole("button", { name: /Try the rest/i }));

    expect(applyToAssignments).toHaveBeenCalledWith(["a-3"], { status: "cancelled" });
  });

  it("says nothing changed when nothing did", async () => {
    applyToAssignments.mockResolvedValue({ ok: [], failed: ["a-1", "a-2", "a-3"] });
    render(<AssignmentSchedule assignments={CLASS_OF_THREE} />);
    openConfirm();
    fireEvent.click(screen.getByRole("button", { name: /Yes, cancel it/i }));

    expect(await screen.findByText(/Nothing was cancelled/)).toBeInTheDocument();
  });
});

describe("un-cancelling", () => {
  // PATCH was chosen over DELETE because it is reversible. Until this existed
  // that argument was theoretical: a teacher who cancelled the wrong class was
  // in the same dead end the change set out to remove.

  const CANCELLED = CLASS_OF_THREE.map((a) => ({ ...a, status: "cancelled" }));

  it("offers to set a cancelled lesson again", () => {
    render(<AssignmentSchedule assignments={CANCELLED} />);
    expect(screen.getByRole("button", { name: /Set it again/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cancel lesson/i })).not.toBeInTheDocument();
  });

  it("patches the group back to assigned", async () => {
    applyToAssignments.mockResolvedValue({ ok: ["a-1", "a-2", "a-3"], failed: [] });
    render(<AssignmentSchedule assignments={CANCELLED} />);
    fireEvent.click(screen.getByRole("button", { name: /Set it again/i }));

    expect(applyToAssignments).toHaveBeenCalledWith(["a-1", "a-2", "a-3"], {
      status: "assigned",
    });
    expect(await screen.findByText(/Set again\. Students can see this lesson\./)).toBeInTheDocument();
  });

  it("overrides a cancellation that came from the server, not just a local one", async () => {
    // The subtle case: these rows arrived cancelled, so there is nothing in the
    // local cancelled set to remove. The restoration has to win over the wire.
    applyToAssignments.mockResolvedValue({ ok: ["a-1", "a-2", "a-3"], failed: [] });
    render(<AssignmentSchedule assignments={CANCELLED} />);
    fireEvent.click(screen.getByRole("button", { name: /Set it again/i }));

    expect(await screen.findByRole("button", { name: /Cancel lesson/i })).toBeInTheDocument();
    expect(screen.queryByText("Cancelled")).not.toBeInTheDocument();
  });

  it("never reports a partial restore as a whole one", async () => {
    applyToAssignments.mockResolvedValue({ ok: ["a-1"], failed: ["a-2", "a-3"] });
    render(<AssignmentSchedule assignments={CANCELLED} />);
    fireEvent.click(screen.getByRole("button", { name: /Set it again/i }));

    expect(await screen.findByText(/Set again for 1 of 3 students/)).toBeInTheDocument();
  });
});

describe("changing the dates", () => {
  it("refuses a lesson due before it opens", () => {
    // `availableFrom` is when it OPENS and `dueAt` is when it is DUE. A lesson
    // that opens after it is due is not a schedule, it is a mistake.
    render(<AssignmentSchedule assignments={CLASS_OF_THREE} />);
    fireEvent.click(screen.getByRole("button", { name: /Change dates/i }));

    fireEvent.change(screen.getByLabelText(/Opens/i), { target: { value: "2026-10-20" } });
    fireEvent.change(screen.getByLabelText(/Due/i), { target: { value: "2026-10-10" } });

    expect(screen.getByRole("alert")).toHaveTextContent(/cannot be due before it opens/i);
    expect(screen.getByRole("button", { name: /Save dates/i })).toBeDisabled();
  });

  it("sends both dates as ISO for the whole group", async () => {
    applyToAssignments.mockResolvedValue({ ok: ["a-1", "a-2", "a-3"], failed: [] });
    render(<AssignmentSchedule assignments={CLASS_OF_THREE} />);
    fireEvent.click(screen.getByRole("button", { name: /Change dates/i }));

    fireEvent.change(screen.getByLabelText(/Due/i), { target: { value: "2026-11-01" } });
    fireEvent.click(screen.getByRole("button", { name: /Save dates/i }));

    expect(applyToAssignments).toHaveBeenCalledWith(
      ["a-1", "a-2", "a-3"],
      expect.objectContaining({ dueAt: "2026-11-01T00:00:00.000Z" }),
    );
    expect(await screen.findByText(/Dates updated/)).toBeInTheDocument();
  });

  it("keeps an emptied date as null rather than dropping the field", async () => {
    // An empty box means "no date", which is a real value, not an omission.
    applyToAssignments.mockResolvedValue({ ok: ["a-1"], failed: [] });
    render(<AssignmentSchedule assignments={[row()]} />);
    fireEvent.click(screen.getByRole("button", { name: /Change dates/i }));

    fireEvent.change(screen.getByLabelText(/Due/i), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /Save dates/i }));

    expect(applyToAssignments).toHaveBeenCalledWith(
      ["a-1"],
      expect.objectContaining({ dueAt: null }),
    );
  });
});

describe("groupByClass", () => {
  it("collapses individually-assigned children into one group", () => {
    // A teacher who picked six names set one thing, not six.
    const groups = groupByClass(
      [
        row({ id: "a-1", classId: null, studentId: "s-1" }),
        row({ id: "a-2", classId: null, studentId: "s-2" }),
      ],
      new Set(),
      {},
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].students).toBe(2);
    expect(groups[0].classId).toBeNull();
  });

  it("marks a group cancelled ONLY when every row is", () => {
    // A group with one live row is still set for that child. Saying otherwise
    // would be a lie about who can see the lesson.
    const partly = groupByClass(CLASS_OF_THREE, new Set(["a-1", "a-2"]), {});
    expect(partly[0].cancelled).toBe(false);

    const fully = groupByClass(CLASS_OF_THREE, new Set(["a-1", "a-2", "a-3"]), {});
    expect(fully[0].cancelled).toBe(true);
  });

  it("counts distinct students, not rows", () => {
    const groups = groupByClass(
      [row({ id: "a-1", studentId: "s-1" }), row({ id: "a-2", studentId: "s-1" })],
      new Set(),
      {},
    );
    expect(groups[0].students).toBe(1);
  });
});

describe("describeWindow", () => {
  it("reads as a sentence when both dates exist", () => {
    expect(describeWindow("2026-10-03T00:00:00Z", "2026-10-10T00:00:00Z")).toBe(
      "opens 3 Oct · due 10 Oct",
    );
  });

  it("says only what it knows", () => {
    expect(describeWindow("2026-10-03T00:00:00Z", null)).toBe("opens 3 Oct");
    expect(describeWindow(null, "2026-10-10T00:00:00Z")).toBe("due 10 Oct");
    expect(describeWindow(null, null)).toBe("no dates set");
  });
});

/**
 * A CHILD WHO HAS FINISHED IS LEFT ALONE.
 *
 * `AssignmentStatus` gained `completed` in the contract on 25 Sep - the value
 * the progress route has always written and the enum never listed. This file
 * never knew it either, so a finished row read as live: cancelling a class's
 * lesson would have sent `cancelled` to a child who had already done it, and
 * overwritten the one record that they had.
 *
 * Found by the first real end-to-end run: the probe child finished a section
 * and their assignment row came back `completed`.
 */
describe("a child who has already finished", () => {
  const CLASS_WITH_ONE_DONE = [
    row({ id: "a-1", studentId: "s-1" }),
    row({ id: "a-2", studentId: "s-2" }),
    row({ id: "a-3", studentId: "s-3", status: "completed" }),
  ];

  it("is never among the rows an action may touch", () => {
    const [g] = groupByClass(CLASS_WITH_ONE_DONE, new Set(), {});

    expect(g.ids).toEqual(["a-1", "a-2"]);
  });

  it("still counts as someone the lesson was set for", () => {
    const [g] = groupByClass(CLASS_WITH_ONE_DONE, new Set(), {});

    expect(g.students).toBe(3);
    expect(g.reachable).toBe(2);
    expect(g.finished).toBe(1);
  });

  it("does not stop the rest of the class reading as cancelled", () => {
    // A finished child is not "cancelled", and must not hold a group open
    // that every child who could still see it has had cancelled.
    const rows = [
      row({ id: "a-1", studentId: "s-1", status: "cancelled" }),
      row({ id: "a-2", studentId: "s-2", status: "completed" }),
    ];

    expect(groupByClass(rows, new Set(), {})[0].cancelled).toBe(true);
  });

  it("is not cancelled when everyone has finished", () => {
    const rows = [
      row({ id: "a-1", studentId: "s-1", status: "completed" }),
      row({ id: "a-2", studentId: "s-2", status: "completed" }),
    ];
    const [g] = groupByClass(rows, new Set(), {});

    expect(g.ids).toEqual([]);
    expect(g.cancelled).toBe(false);
  });

  it("is left out of the cancel that goes to the server", async () => {
    // THE ONE THAT MATTERS. Everything else here is about what the teacher
    // reads; this is about what reaches a child's record.
    applyToAssignments.mockResolvedValue({ ok: ["a-1", "a-2"], failed: [] });
    render(<AssignmentSchedule assignments={CLASS_WITH_ONE_DONE} />);
    openConfirm();
    fireEvent.click(screen.getByRole("button", { name: /Yes, cancel it/i }));

    expect(applyToAssignments).toHaveBeenCalledWith(["a-1", "a-2"], {
      status: "cancelled",
    });
  });

  it("is counted out of the confirmation, and told they keep it", () => {
    render(<AssignmentSchedule assignments={CLASS_WITH_ONE_DONE} />);
    openConfirm();

    expect(
      screen.getByText(/Cancel this lesson for 2 students in JSS 2A/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/The student who has already finished it keeps it/),
    ).toBeInTheDocument();
  });

  it("names more than one finished child as more than one", () => {
    render(
      <AssignmentSchedule
        assignments={[
          row({ id: "a-1", studentId: "s-1" }),
          row({ id: "a-2", studentId: "s-2", status: "completed" }),
          row({ id: "a-3", studentId: "s-3", status: "completed" }),
        ]}
      />,
    );
    openConfirm();

    expect(
      screen.getByText(/The 2 students who have already finished it keep it/),
    ).toBeInTheDocument();
  });

  it("says nothing about finishing when nobody has", () => {
    render(<AssignmentSchedule assignments={CLASS_OF_THREE} />);
    openConfirm();

    expect(screen.queryByText(/already finished/)).not.toBeInTheDocument();
  });

  it("offers nothing to change when every child has finished", () => {
    // There is no row left that a cancel or a new date could honestly reach.
    render(
      <AssignmentSchedule
        assignments={[
          row({ id: "a-1", studentId: "s-1", status: "completed" }),
          row({ id: "a-2", studentId: "s-2", status: "completed" }),
        ]}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /Cancel lesson/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Change dates/i }),
    ).not.toBeInTheDocument();
  });
});

/**
 * "TRY THE REST" REPEATS WHAT FAILED, NOT A CANCEL.
 *
 * The audit's most severe finding. The retry was hardwired to cancel, so a
 * partial DATE change or a partial RESTORE, retried, cancelled the lesson for
 * the children whose write had failed. Only the cancel retry was tested -
 * which is exactly the one case the hardwiring got right.
 */
describe("finishing a write that only partly landed", () => {
  it("retries a partial date change as a date change", async () => {
    applyToAssignments.mockResolvedValue({ ok: ["a-1", "a-2"], failed: ["a-3"] });
    render(<AssignmentSchedule assignments={CLASS_OF_THREE} />);
    fireEvent.click(screen.getByRole("button", { name: /Change dates/i }));
    fireEvent.change(screen.getByLabelText(/Due/i), { target: { value: "2026-11-01" } });
    fireEvent.click(screen.getByRole("button", { name: /Save dates/i }));

    applyToAssignments.mockClear();
    fireEvent.click(await screen.findByRole("button", { name: /Try the rest/i }));

    expect(applyToAssignments).toHaveBeenCalledTimes(1);
    expect(applyToAssignments).toHaveBeenCalledWith(
      ["a-3"],
      expect.objectContaining({ dueAt: "2026-11-01T00:00:00.000Z" }),
    );
    expect(applyToAssignments).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "cancelled" }),
    );
  });

  it("retries a partial restore as a restore", async () => {
    const CANCELLED = CLASS_OF_THREE.map((a) => ({ ...a, status: "cancelled" }));
    applyToAssignments.mockResolvedValue({ ok: ["a-1"], failed: ["a-2", "a-3"] });
    render(<AssignmentSchedule assignments={CANCELLED} />);
    fireEvent.click(screen.getByRole("button", { name: /Set it again/i }));

    applyToAssignments.mockClear();
    fireEvent.click(await screen.findByRole("button", { name: /Try the rest/i }));

    expect(applyToAssignments).toHaveBeenCalledWith(["a-2", "a-3"], { status: "assigned" });
  });

  it("still retries a partial cancel as a cancel", async () => {
    applyToAssignments.mockResolvedValue({ ok: ["a-1", "a-2"], failed: ["a-3"] });
    render(<AssignmentSchedule assignments={CLASS_OF_THREE} />);
    openConfirm();
    fireEvent.click(screen.getByRole("button", { name: /Yes, cancel it/i }));

    applyToAssignments.mockClear();
    fireEvent.click(await screen.findByRole("button", { name: /Try the rest/i }));

    expect(applyToAssignments).toHaveBeenCalledWith(["a-3"], { status: "cancelled" });
  });

  it("reports the retried date change honestly when it lands", async () => {
    applyToAssignments
      .mockResolvedValueOnce({ ok: ["a-1", "a-2"], failed: ["a-3"] })
      .mockResolvedValueOnce({ ok: ["a-3"], failed: [] });
    render(<AssignmentSchedule assignments={CLASS_OF_THREE} />);
    fireEvent.click(screen.getByRole("button", { name: /Change dates/i }));
    fireEvent.change(screen.getByLabelText(/Due/i), { target: { value: "2026-11-01" } });
    fireEvent.click(screen.getByRole("button", { name: /Save dates/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Try the rest/i }));

    expect(await screen.findByText(/Dates updated/)).toBeInTheDocument();
    expect(screen.queryByText(/Cancelled/)).not.toBeInTheDocument();
  });
});

/**
 * "A CLASS". The group names came from the teacher's class list alone - the
 * fixture three while it loads or after it fails, none of whose ids match a
 * real class - so the cancel confirmation asked to cancel the lesson "for 7
 * students in A class". The lesson read names every class it went to.
 */
describe("naming the class a group belongs to", () => {
  it("uses the lesson's own class name while the class list is not in", () => {
    useTeacherClasses.mockReturnValue({ options: [], live: false, loading: true, sample: false });
    render(
      <AssignmentSchedule
        assignments={CLASS_OF_THREE}
        classes={[{ id: CLASS_OF_THREE[0].classId as string, name: "Year 7 Blue" }]}
      />,
    );

    expect(screen.getAllByText(/Year 7 Blue/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/A class/)).not.toBeInTheDocument();
  });

  it("never takes a name from a fixture class list", () => {
    // A fixture whose id happened to collide would name a real group after
    // an invented class. Only a live list may name anything.
    useTeacherClasses.mockReturnValue({
      options: [{ id: CLASS_OF_THREE[0].classId as string, name: "JSS 2A" }],
      live: false,
      loading: false,
      sample: true,
    });
    render(<AssignmentSchedule assignments={CLASS_OF_THREE} />);

    expect(screen.queryByText(/JSS 2A/)).not.toBeInTheDocument();
  });
});

/**
 * C03. The editor read dates in UTC, wrote every date back as midnight UTC,
 * and sent both fields whichever one moved - so changing a due date moved an
 * 08:00 opening to 01:00 as well, and a lesson opening just after midnight in
 * Lagos showed the day before.
 *
 * Built from local times, so these hold in whatever zone the run is in.
 */
describe("dates in the teacher's own day (C03)", () => {
  const local = (y: number, m: number, d: number, h = 0, min = 0) =>
    new Date(y, m - 1, d, h, min).toISOString();

  it("reads the date as the teacher's day, not UTC's", () => {
    expect(toDateInput(local(2026, 10, 10, 0, 30))).toBe("2026-10-10");
    expect(toDateInput(local(2026, 10, 10, 23, 30))).toBe("2026-10-10");
  });

  it("keeps the time a date had when the day moves", () => {
    const moved = new Date(onDay("2026-10-05", local(2026, 10, 3, 8, 0), "start")!);

    expect([moved.getDate(), moved.getHours(), moved.getMinutes()]).toEqual([5, 8, 0]);
  });

  it("opens a date that had no time at the start of its day", () => {
    const opens = new Date(onDay("2026-10-05", null, "start")!);

    expect([opens.getDate(), opens.getHours(), opens.getMinutes()]).toEqual([5, 0, 0]);
  });

  it("makes a new due date due by the end of its day, not before it starts", () => {
    const due = new Date(onDay("2026-10-05", null, "end")!);

    expect([due.getDate(), due.getHours(), due.getMinutes()]).toEqual([5, 23, 59]);
  });

  it("keeps an emptied box as no date", () => {
    expect(onDay("", local(2026, 10, 3, 8, 0), "start")).toBeNull();
  });

  it("sends only the date that moved", async () => {
    applyToAssignments.mockResolvedValue({ ok: ["a-1"], failed: [] });
    render(<AssignmentSchedule assignments={[row({ availableFrom: local(2026, 10, 3, 8, 0) })]} />);
    fireEvent.click(screen.getByRole("button", { name: /Change dates/i }));
    fireEvent.change(screen.getByLabelText(/Due/i), { target: { value: "2026-11-01" } });
    fireEvent.click(screen.getByRole("button", { name: /Save dates/i }));

    const sent = applyToAssignments.mock.calls[0][1];
    expect(Object.keys(sent)).toEqual(["dueAt"]);
    expect(await screen.findByText(/Dates updated/)).toBeInTheDocument();
  });

  it("offers no Save until something has moved", () => {
    render(<AssignmentSchedule assignments={[row()]} />);
    fireEvent.click(screen.getByRole("button", { name: /Change dates/i }));

    expect(screen.getByRole("button", { name: /Save dates/i })).toBeDisabled();
  });
});
