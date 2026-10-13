import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const { classStudents } = vi.hoisted(() => ({ classStudents: vi.fn() }));
vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return { ...actual, classesApi: { ...actual.classesApi, classStudents } };
});

import { lastSeenLine, studentName, useClassRoster } from "./useClassRoster";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * T242. A roster that could not be read and a class with nobody in it are two
 * different screens, and the hook is where they are told apart.
 */

const student = (over: Record<string, unknown> = {}) =>
  ({
    studentId: "s-1",
    firstName: "Ada",
    lastName: "Obi",
    displayName: "Ada O.",
    latestSessionAt: null,
    ...over,
  }) as never;

beforeEach(() => {
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: "t-1",
    role: "teacher" as never,
  });
  classStudents.mockReset();
});
afterEach(() => clearSession());

describe("the roster read", () => {
  it("is loading, not empty, before it answers", () => {
    classStudents.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useClassRoster("c-1"));

    expect(result.current.loading).toBe(true);
    expect(result.current.failed).toBe(false);
  });

  it("is the class's own children once it answers", async () => {
    classStudents.mockResolvedValue([student()]);
    const { result } = renderHook(() => useClassRoster("c-1"));

    await waitFor(() => expect(result.current.students).toHaveLength(1));
    expect(classStudents).toHaveBeenCalledWith("c-1");
    expect(result.current.failed).toBe(false);
  });

  it("is an empty class when the class is empty", async () => {
    classStudents.mockResolvedValue([]);
    const { result } = renderHook(() => useClassRoster("c-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.students).toEqual([]);
    expect(result.current.failed).toBe(false);
  });

  it("says it failed when it failed, which an empty class does not", async () => {
    classStudents.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useClassRoster("c-1"));

    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.students).toEqual([]);
    expect(result.current.loading).toBe(false);
  });
});

describe("a child's name on the roster", () => {
  it("is their first and last name", () => {
    expect(studentName(student())).toBe("Ada Obi");
  });

  it("is the name the school gave when there is no first or last", () => {
    expect(studentName(student({ firstName: null, lastName: null }))).toBe("Ada O.");
  });

  it("is whichever half there is", () => {
    expect(studentName(student({ lastName: null }))).toBe("Ada");
  });
});

describe("when a child was last here", () => {
  const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

  it("says they have not started, rather than a date that is not there", () => {
    expect(lastSeenLine(student())).toBe("Hasn’t started yet");
  });

  it("says today, yesterday, and a count of days within the week", () => {
    expect(lastSeenLine(student({ latestSessionAt: ago(0) }))).toBe("Here today");
    expect(lastSeenLine(student({ latestSessionAt: ago(1) }))).toBe("Here yesterday");
    expect(lastSeenLine(student({ latestSessionAt: ago(3) }))).toBe("Here 3 days ago");
  });

  it("gives the date after a week", () => {
    expect(lastSeenLine(student({ latestSessionAt: ago(10) }))).toMatch(/^Last here \d{1,2} \w+$/);
  });
});
