import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const api = vi.hoisted(() => ({
  profile: vi.fn(),
  learnerProfile: vi.fn(),
  mastery: vi.fn(),
  masteryByLevel: vi.fn(),
  recommendations: vi.fn(),
  adaptations: vi.fn(),
  progress: vi.fn(),
  accommodations: vi.fn(),
  forStudent: vi.fn(),
}));
const holds = vi.hoisted(() => ({ value: true }));
vi.mock("./useLearningSupport", () => ({ useHoldsLearningSupport: () => holds.value }));
vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return {
    ...actual,
    studentsApi: {
      ...actual.studentsApi,
      profile: api.profile,
      learnerProfile: api.learnerProfile,
      mastery: api.mastery,
      masteryByLevel: api.masteryByLevel,
      recommendations: api.recommendations,
      adaptations: api.adaptations,
      progress: api.progress,
      accommodations: api.accommodations,
    },
    conversationEvidenceApi: { forStudent: api.forStudent },
  };
});

import { useStudentProfile } from "./useStudentProfile";
import { clearSession, setSession } from "@/lib/auth/session";
import { ApiError } from "@/lib/api/client";

/**
 * Each background read now says where it stands. They were all swallowed, so
 * "still loading" and "failed" both arrived as an empty default - and the
 * page read that as a child Nevo did not know yet.
 */

beforeEach(() => {
  holds.value = true;
  clearSession();
  window.localStorage.clear();
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: "t-1",
    role: "teacher",
  });
  api.profile.mockReset().mockResolvedValue({
    student: { id: "s-1", firstName: "Amara", lastName: "Okafor", ageBand: "11 to 12" },
    profile: null,
    openFlagCount: 0,
  });
  api.learnerProfile.mockReset().mockResolvedValue({ status: "observed" });
  api.mastery.mockReset().mockResolvedValue([]);
  api.masteryByLevel.mockReset().mockResolvedValue({ studentId: "s-1", concepts: [] });
  api.recommendations.mockReset().mockResolvedValue([]);
  api.adaptations.mockReset().mockResolvedValue([]);
  api.progress.mockReset().mockResolvedValue({ lessons: [] });
  api.accommodations.mockReset().mockResolvedValue(null);
  api.forStudent.mockReset().mockResolvedValue(null);
});

describe("the background reads", () => {
  it("start as loading - not as empty", () => {
    api.learnerProfile.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useStudentProfile("s-1"));

    expect(result.current.reads?.learnerProfile).toBe("loading");
  });

  it("are ready once they answer", async () => {
    const { result } = renderHook(() => useStudentProfile("s-1"));

    await waitFor(() => expect(result.current.reads?.mastery).toBe("ready"));
    expect(result.current.reads?.learnerProfile).toBe("ready");
  });

  it("each say they failed, on their own", async () => {
    api.masteryByLevel.mockRejectedValue(new Error("network"));
    api.learnerProfile.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useStudentProfile("s-1"));

    await waitFor(() => expect(result.current.reads?.mastery).toBe("failed"));
    await waitFor(() => expect(result.current.reads?.learnerProfile).toBe("failed"));
    await waitFor(() => expect(result.current.reads?.recommendations).toBe("ready"));
  });

  it("names every section that failed", async () => {
    api.recommendations.mockRejectedValue(new Error("network"));
    api.adaptations.mockRejectedValue(new Error("network"));
    api.accommodations.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useStudentProfile("s-1"));

    await waitFor(() => expect(result.current.reads?.accommodations).toBe("failed"));
    expect(result.current.reads?.recommendations).toBe("failed");
    await waitFor(() => expect(result.current.reads?.adaptations).toBe("failed"));
  });
});

describe("the progress read", () => {
  it("is not made - nothing on the live profile renders it", async () => {
    const { result } = renderHook(() => useStudentProfile("s-1"));

    await waitFor(() => expect(result.current.reads?.mastery).toBe("ready"));
    expect(api.progress).not.toHaveBeenCalled();
  });
});

describe("a mastery row the engine could not name", () => {
  it("is left out rather than drawn as a row with no label", async () => {
    api.masteryByLevel.mockResolvedValue({
      studentId: "s-1",
      concepts: [
        { conceptId: "c-1", conceptName: "Fractions", levels: { application: "working" } },
        { conceptId: "c-2", conceptName: "", levels: { application: "reached" } },
      ],
    });
    const { result } = renderHook(() => useStudentProfile("s-1"));

    await waitFor(() => expect(result.current.reads?.mastery).toBe("ready"));
    expect(result.current.concepts.map((c) => c.name)).toEqual(["Fractions"]);
  });
});

/*
 * S21 (Teslim, live 27 Nov): the By Level read. A state per curriculum level,
 * reading beside them, and no probability anywhere - so there is nothing to
 * turn into a bar, and nothing to default.
 */
describe("the By Level mastery read", () => {
  it("reads S21's route, not the old bars' one", async () => {
    const { result } = renderHook(() => useStudentProfile("s-1"));

    await waitFor(() => expect(result.current.reads?.mastery).toBe("ready"));
    expect(api.masteryByLevel).toHaveBeenCalledWith("s-1");
    expect(api.mastery).not.toHaveBeenCalled();
  });

  it("keeps each level exactly as sent, and fills no absent level in as `not`", async () => {
    api.masteryByLevel.mockResolvedValue({
      studentId: "s-1",
      concepts: [
        {
          conceptId: "c-1",
          conceptName: "Fractions",
          levels: { knowing_and_understanding: "reached" },
          reading: "support",
        },
      ],
    });
    const { result } = renderHook(() => useStudentProfile("s-1"));

    await waitFor(() => expect(result.current.concepts).toHaveLength(1));
    expect(result.current.concepts[0]).toEqual({
      conceptId: "c-1",
      name: "Fractions",
      levels: { knowing_and_understanding: "reached" },
      reading: "support",
    });
  });

  it("keeps a concept met only in reading, with no levels (b0bf27d)", async () => {
    api.masteryByLevel.mockResolvedValue({
      studentId: "s-1",
      concepts: [{ conceptId: "c-1", conceptName: "Fractions", levels: {}, reading: "at" }],
    });
    const { result } = renderHook(() => useStudentProfile("s-1"));

    await waitFor(() => expect(result.current.concepts).toHaveLength(1));
    expect(result.current.concepts[0]).toMatchObject({ levels: {}, reading: "at" });
  });

  it("leaves reading null when it is omitted - nothing observed", async () => {
    api.masteryByLevel.mockResolvedValue({
      studentId: "s-1",
      concepts: [{ conceptId: "c-1", conceptName: "Fractions", levels: { application: "not" } }],
    });
    const { result } = renderHook(() => useStudentProfile("s-1"));

    await waitFor(() => expect(result.current.concepts).toHaveLength(1));
    expect(result.current.concepts[0].reading).toBeNull();
  });
});

/*
 * 403, 404 and 500 each their own state (Hub, 28 Nov). Only a FAILED read
 * offers a retry; a refusal of the role, or a child out of reach, never lands
 * however often it is asked.
 */
describe("a mastery read that does not answer", () => {
  it("is refused on a 403 - staff_role_required", async () => {
    api.masteryByLevel.mockRejectedValue(
      new ApiError(403, "Forbidden", { detail: { code: "staff_role_required" } }),
    );
    const { result } = renderHook(() => useStudentProfile("s-1"));

    await waitFor(() => expect(result.current.reads?.mastery).toBe("refused"));
    expect(result.current.concepts).toEqual([]);
  });

  it("is missing on a 404 - a child outside the viewer's reach", async () => {
    api.masteryByLevel.mockRejectedValue(new ApiError(404, "Not Found", { detail: "Student not found" }));
    const { result } = renderHook(() => useStudentProfile("s-1"));

    await waitFor(() => expect(result.current.reads?.mastery).toBe("missing"));
  });

  it("failed on a 500, which a retry might land", async () => {
    api.masteryByLevel.mockRejectedValue(new ApiError(500, "Server Error", {}));
    const { result } = renderHook(() => useStudentProfile("s-1"));

    await waitFor(() => expect(result.current.reads?.mastery).toBe("failed"));
  });
});

describe("a student this page cannot show", () => {
  it("is not-found for a malformed id, not a retry", async () => {
    const { ApiError } = await import("@/lib/api/client");
    api.profile.mockRejectedValue(new ApiError(422, "unprocessable"));
    const { result } = renderHook(() => useStudentProfile("not-a-uuid"));

    await waitFor(() => expect(result.current.missing).toBe(true));
    expect(result.current.failed).toBe(false);
  });

  it("is not-found for a child outside this teacher's classes", async () => {
    const { ApiError } = await import("@/lib/api/client");
    api.profile.mockRejectedValue(new ApiError(403, "forbidden"));
    const { result } = renderHook(() => useStudentProfile("s-other"));

    await waitFor(() => expect(result.current.missing).toBe(true));
  });

  it("is still a retry when the server broke", async () => {
    const { ApiError } = await import("@/lib/api/client");
    api.profile.mockRejectedValue(new ApiError(500, "server"));
    const { result } = renderHook(() => useStudentProfile("s-1"));

    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.missing).toBe(false);
  });
});

/**
 * T241. A suppressed adaptation is one Nevo considered and withheld. It is
 * not something that happened to the child, and it is not shown as one.
 */
describe("what Nevo adjusted", () => {
  it("leaves out what Nevo considered and withheld", async () => {
    api.adaptations.mockResolvedValue([
      { id: "a-1", suppressed: false, summary: "Read aloud" },
      { id: "a-2", suppressed: true, summary: "Held back" },
    ]);
    const { result } = renderHook(() => useStudentProfile("s-1"));

    await waitFor(() => expect(result.current.reads?.adaptations).toBe("ready"));
    expect(result.current.adaptations.map((a) => a.id)).toEqual(["a-1"]);
  });
});

/**
 * C20 (design, 12 Oct): adaptation history is Learning Support material - read
 * for a holder only, and refused to everyone else by the server since ab78139.
 */
describe("adaptation history and Learning Support", () => {
  // Lydia, 14 Oct, P1: "A class teacher reaches their own pupils' profile,
  // adaptation history and flags with no role." The server asks the role of
  // an admin only (require_learning_support_if_admin).
  it("is read for a teacher of the child who does not hold the role", async () => {
    holds.value = false;
    const { result } = renderHook(() => useStudentProfile("s-1"));

    await waitFor(() => expect(result.current.reads?.adaptations).toBe("ready"));
    expect(api.adaptations).toHaveBeenCalledWith("s-1");
    expect(result.current.learningSupport).toBe(false);
  });

  it("is read for a holder, and says so", async () => {
    const { result } = renderHook(() => useStudentProfile("s-1"));

    await waitFor(() => expect(result.current.reads?.adaptations).toBe("ready"));
    expect(api.adaptations).toHaveBeenCalledWith("s-1");
    expect(result.current.learningSupport).toBe(true);
  });
});

describe("a Learning Support refusal on the profile itself", () => {
  it("is a read that did not land, never a child who does not exist", async () => {
    // ab78139 asks every staff role for the role on this route, so a class
    // teacher without it is refused their own pupil - which read as missing
    // and sent them to a 404.
    api.profile.mockRejectedValue(
      new ApiError(403, "refused", {
        detail: { code: "learning_support_role_required", message: "..." },
      }),
    );
    const { result } = renderHook(() => useStudentProfile("s-1"));

    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.missing).toBe(false);
  });

  it("still reads any other refusal as a child this teacher cannot open", async () => {
    api.profile.mockRejectedValue(new ApiError(403, "Forbidden", { detail: "Not your student" }));
    const { result } = renderHook(() => useStudentProfile("s-1"));

    await waitFor(() => expect(result.current.missing).toBe(true));
  });
});
