import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useAssignmentNote } from "./useAssignmentNote";

const { myDashboard } = vi.hoisted(() => ({ myDashboard: vi.fn() }));
vi.mock("@/lib/api/students", () => ({ studentsApi: { myDashboard } }));

/**
 * Which assignment's note, and when there is none.
 *
 * The note rides a list of every assignment the child has, so picking the
 * wrong row shows a child a message about a different lesson - written by a
 * teacher, to them, about something else.
 */

const dash = (assignments: unknown[]) => ({ assignments });

beforeEach(() => {
  myDashboard.mockReset();
});

const settle = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

describe("finding the right note", () => {
  it("returns the note on the assignment this lesson was opened from", async () => {
    myDashboard.mockResolvedValue(
      dash([
        { id: "a-1", note: "Not this one." },
        { id: "a-2", note: "Take your time on question 3." },
      ]),
    );

    const { result } = renderHook(() => useAssignmentNote("a-2"));

    await waitFor(() =>
      expect(result.current?.text).toBe("Take your time on question 3."),
    );
  });

  it("reads the child's own dashboard, not the teacher's assignment list", async () => {
    // `/assignments` is "every assignment the teacher can see". A child asking
    // it for their own row is the wrong actor on the wrong endpoint.
    myDashboard.mockResolvedValue(dash([{ id: "a-1", note: "Hello." }]));

    renderHook(() => useAssignmentNote("a-1"));

    await waitFor(() => expect(myDashboard).toHaveBeenCalledTimes(1));
  });

  it("trims what it shows, so trailing whitespace is not a message", async () => {
    myDashboard.mockResolvedValue(dash([{ id: "a-1", note: "  Well done.  " }]));

    const { result } = renderHook(() => useAssignmentNote("a-1"));

    await waitFor(() => expect(result.current?.text).toBe("Well done."));
  });
});

describe("when there is nothing to show", () => {
  it("says nothing for a lesson opened from the library, and does not read", async () => {
    // No assignment is the truth about it, not a missing note.
    const { result } = renderHook(() => useAssignmentNote(undefined));

    expect(result.current).toBeNull();
    expect(myDashboard).not.toHaveBeenCalled();
  });

  it("says nothing when the assignment carries no note", async () => {
    myDashboard.mockResolvedValue(dash([{ id: "a-1", note: null }]));

    const { result } = renderHook(() => useAssignmentNote("a-1"));

    await waitFor(() => expect(myDashboard).toHaveBeenCalled());
    await settle();

    expect(result.current).toBeNull();
  });

  it("treats a whitespace-only note as no note", async () => {
    // An empty card signed "Your teacher" is a message about nothing.
    myDashboard.mockResolvedValue(dash([{ id: "a-1", note: "   \n  " }]));

    const { result } = renderHook(() => useAssignmentNote("a-1"));

    await waitFor(() => expect(myDashboard).toHaveBeenCalled());
    await settle();

    expect(result.current).toBeNull();
  });

  it("says nothing when the assignment is not in the list", async () => {
    myDashboard.mockResolvedValue(dash([{ id: "a-9", note: "Someone else's." }]));

    const { result } = renderHook(() => useAssignmentNote("a-1"));

    await waitFor(() => expect(myDashboard).toHaveBeenCalled());
    await settle();

    expect(result.current).toBeNull();
  });

  it("stays silent when the read fails", async () => {
    /*
     * "Your teacher wrote something we could not load" names a message a child
     * cannot read and cannot ask for. Nothing is the kinder answer, and the
     * lesson is unaffected either way.
     */
    myDashboard.mockRejectedValue(new Error("network"));

    const { result } = renderHook(() => useAssignmentNote("a-1"));

    await waitFor(() => expect(myDashboard).toHaveBeenCalled());
    await settle();

    expect(result.current).toBeNull();
  });
});

describe("who wrote it", () => {
  it("carries the teacher who SET the assignment", async () => {
    /*
     * `assignedByName`, landed 24 Sep - and deliberately not
     * `lesson.createdByName`, which is whoever authored the lesson and is a
     * different person whenever somebody assigns a colleague's.
     */
    myDashboard.mockResolvedValue(
      dash([{ id: "a-1", note: "Well done.", assignedByName: "Ms Adeyemi" }]),
    );

    const { result } = renderHook(() => useAssignmentNote("a-1"));

    await waitFor(() => expect(result.current?.author).toBe("Ms Adeyemi"));
  });

  it("keeps the note when the name cannot be resolved", async () => {
    /*
     * THE ONE THAT MATTERS. Backend returns null rather than a placeholder for
     * a deleted or unnamed account, on the principle we argued for - naming
     * the wrong teacher is worse than naming none. A null name must therefore
     * be an UNSIGNED note, never a withheld one: the words are still something
     * a person typed to this child.
     */
    myDashboard.mockResolvedValue(
      dash([{ id: "a-1", note: "Well done.", assignedByName: null }]),
    );

    const { result } = renderHook(() => useAssignmentNote("a-1"));

    await waitFor(() => expect(result.current?.text).toBe("Well done."));
    expect(result.current?.author).toBeNull();
  });

  it("does the same on a deployment that carries no name field at all", async () => {
    // Neither field is in the schema's `required` list, so an older
    // deployment sends neither. Absent and null land in the same place.
    myDashboard.mockResolvedValue(dash([{ id: "a-1", note: "Well done." }]));

    const { result } = renderHook(() => useAssignmentNote("a-1"));

    await waitFor(() => expect(result.current?.text).toBe("Well done."));
    expect(result.current?.author).toBeNull();
  });

  it("treats a whitespace-only name as no name", async () => {
    myDashboard.mockResolvedValue(
      dash([{ id: "a-1", note: "Well done.", assignedByName: "   " }]),
    );

    const { result } = renderHook(() => useAssignmentNote("a-1"));

    await waitFor(() => expect(result.current?.text).toBe("Well done."));
    expect(result.current?.author).toBeNull();
  });
});
