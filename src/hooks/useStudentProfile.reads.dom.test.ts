import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const api = vi.hoisted(() => ({
  profile: vi.fn(),
  learnerProfile: vi.fn(),
  mastery: vi.fn(),
  recommendations: vi.fn(),
  adaptations: vi.fn(),
  progress: vi.fn(),
  accommodations: vi.fn(),
  forStudent: vi.fn(),
}));
vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return {
    ...actual,
    studentsApi: {
      ...actual.studentsApi,
      profile: api.profile,
      learnerProfile: api.learnerProfile,
      mastery: api.mastery,
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

/**
 * Each background read now says where it stands. They were all swallowed, so
 * "still loading" and "failed" both arrived as an empty default - and the
 * page read that as a child Nevo did not know yet.
 */

beforeEach(() => {
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
    api.mastery.mockRejectedValue(new Error("network"));
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
  it("is left out rather than drawn as a bar with no label", async () => {
    api.mastery.mockResolvedValue([
      { conceptId: "c-1", conceptName: "Fractions", masteryProbabilityConcept: 0.6, masteryProbabilityReading: 0.5, practiceCount: 3 },
      { conceptId: "c-2", conceptName: null, masteryProbabilityConcept: 0.4, masteryProbabilityReading: 0.3, practiceCount: 1 },
    ]);
    const { result } = renderHook(() => useStudentProfile("s-1"));

    await waitFor(() => expect(result.current.reads?.mastery).toBe("ready"));
    expect(result.current.concepts.map((c) => c.name)).toEqual(["Fractions"]);
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
