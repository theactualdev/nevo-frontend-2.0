import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { useSubjectProgress } from "./useSubjectProgress";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * The per-card note (backend B29, 1 Oct). `StudentProgressResponse.note` is a
 * plain string defaulting to "" - not nullable, not required - so an empty or
 * missing one is the backend saying it wrote no note, and must never reach a
 * card as a blank line where the concept names would have been.
 *
 * Signed in, because `useLiveQuery` makes no read without a token and a test
 * with no session would assert against a request that never happened.
 */

const subjectProgress = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/students", () => ({
  studentsApi: { subjectProgress },
}));

const reply = (note: unknown) => ({
  studentId: "student-1",
  subject: "Mathematics",
  masteryAverage: null,
  concepts: [],
  lessons: [],
  reflection: "A paragraph about maths.",
  highlights: [],
  ...(note === undefined ? {} : { note }),
});

beforeEach(() => {
  setSession({
    token: "tok-test",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId: "student-1",
    role: "student",
  });
  subjectProgress.mockReset();
});

afterEach(() => {
  cleanup();
  clearSession();
});

describe("a subject's note", () => {
  it("is the backend's, as written", async () => {
    subjectProgress.mockResolvedValue(reply("Getting quicker with fractions"));

    const { result } = renderHook(() => useSubjectProgress("Mathematics"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.note).toBe("Getting quicker with fractions");
    expect(subjectProgress).toHaveBeenCalledWith("student-1", "Mathematics");
  });

  it("is no note when the backend sent an empty one", async () => {
    subjectProgress.mockResolvedValue(reply("   "));

    const { result } = renderHook(() => useSubjectProgress("Mathematics"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.note).toBeNull();
  });

  it("is no note when an older response carries none", async () => {
    subjectProgress.mockResolvedValue(reply(undefined));

    const { result } = renderHook(() => useSubjectProgress("Mathematics"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.note).toBeNull();
    // The reflection beside it is untouched.
    expect(result.current.reflection).toBe("A paragraph about maths.");
  });
});
