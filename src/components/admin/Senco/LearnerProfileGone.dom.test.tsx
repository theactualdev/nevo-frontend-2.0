import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";

/**
 * Check 21 (Hub, 28 Nov): a read that answers after a learner's profile has
 * gone sets nothing. The first read and the four section reads it starts set
 * state on a screen that had already gone - the one read on this screen the
 * admin sweep's `useStillHere` did not reach.
 *
 * Each test holds a read open, unmounts, then answers it. Nothing that rides
 * on the answer may be asked for, and a late failure must not even be LOOKED
 * AT (a proxy records every property read on it).
 */

const h = vi.hoisted(() => ({
  get: vi.fn(),
  accommodations: vi.fn(),
  mastery: vi.fn(),
  masteryByLevel: vi.fn(),
  adaptations: vi.fn(),
  evidence: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/senco/s1",
}));
vi.mock("@/lib/api/safety", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/safety")>();
  return { ...actual, safetyApi: { ...actual.safetyApi, events: async () => [] } };
});
vi.mock("@/lib/api/accommodationHistory", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/accommodationHistory")>();
  return {
    ...actual,
    accommodationHistoryApi: {
      ...actual.accommodationHistoryApi,
      forStudent: async (studentId: string) => ({ studentId, changes: [], adaptationsPerWeek: [] }),
    },
  };
});
vi.mock("@/lib/api/learningSupport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/learningSupport")>();
  return {
    ...actual,
    learningSupportApi: {
      ...actual.learningSupportApi,
      holders: async () => ({ holders: [], viewerHoldsIt: true }),
    },
  };
});
vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return {
    ...actual,
    studentsApi: {
      ...actual.studentsApi,
      get: () => h.get(),
      accommodations: () => h.accommodations(),
      mastery: () => h.mastery(),
      // D08b reads S21's By Level route now; mocked, so no test makes a real request.
      masteryByLevel: () => h.masteryByLevel(),
      adaptations: () => h.adaptations(),
    },
    conversationEvidenceApi: { forStudent: () => h.evidence() },
  };
});
vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return {
    ...actual,
    // No class, so the roster read below the fan-out never starts.
    classesApi: { ...actual.classesApi, list: async () => [], classStudents: async () => [] },
  };
});

import { LearnerProfileView } from "./LearnerProfileView";

const AMARA = {
  id: "s1",
  firstName: "Amara",
  lastName: "Okafor",
  loginIdentifier: "NV-1",
  email: null,
  status: "active",
  ageBand: "11-14",
  classIds: [],
  firstUse: false,
  consent: { status: "confirmed", actorId: null, actorName: null, timestamp: null, channel: null },
};

/** A read held open until the test answers it. */
function later<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** `value`, recording every property read on it into `reads`. */
function watched<T extends object>(value: T, reads: string[]): T {
  return new Proxy(value, {
    get(target, prop, receiver) {
      reads.push(String(prop));
      return Reflect.get(target, prop, receiver);
    },
  });
}

/** Long enough for every callback a late answer would run to have run. */
const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });

beforeEach(() => {
  h.get.mockReset().mockResolvedValue(AMARA);
  h.accommodations.mockReset().mockResolvedValue(null);
  h.mastery.mockReset().mockResolvedValue([]);
  h.masteryByLevel.mockReset().mockResolvedValue({ studentId: "s1", concepts: [] });
  h.adaptations.mockReset().mockResolvedValue([]);
  h.evidence.mockReset().mockResolvedValue({
    studentId: "s1",
    periodDays: 14,
    interactionCount: 0,
    categories: {},
    privacy: "withheld_below_minimum",
    minimumInteractions: 3,
  });
});

describe("a learner's profile, once it has gone", () => {
  it("starts none of its section reads when the learner answers late", async () => {
    const learner = later<typeof AMARA>();
    h.get.mockReturnValue(learner.promise);
    const view = render(<LearnerProfileView studentId="s1" />);
    await settle();
    view.unmount();

    learner.resolve(AMARA);
    await settle();
    expect(h.accommodations).not.toHaveBeenCalled();
    expect(h.mastery).not.toHaveBeenCalled();
    expect(h.masteryByLevel).not.toHaveBeenCalled();
    expect(h.adaptations).not.toHaveBeenCalled();
    expect(h.evidence).not.toHaveBeenCalled();
  });

  it("does not look at a learner read that fails late", async () => {
    const learner = later<never>();
    h.get.mockReturnValue(learner.promise);
    const view = render(<LearnerProfileView studentId="s1" />);
    await settle();
    view.unmount();

    const reads: string[] = [];
    learner.reject(watched(new ApiError(500, "Server Error", {}), reads));
    await settle();
    expect(reads).toEqual([]);
  });

  it("does not look at a section read, or help-seeking, that fails late", async () => {
    const accommodations = later<never>();
    const evidence = later<never>();
    h.accommodations.mockReturnValue(accommodations.promise);
    h.evidence.mockReturnValue(evidence.promise);
    const view = render(<LearnerProfileView studentId="s1" />);
    await settle();
    expect(h.accommodations).toHaveBeenCalled();
    expect(h.evidence).toHaveBeenCalled();
    view.unmount();

    const reads: string[] = [];
    accommodations.reject(
      watched(new ApiError(403, "Forbidden", { detail: { code: "learning_support_role_required" } }), reads),
    );
    evidence.reject(watched(new ApiError(500, "Server Error", {}), reads));
    await settle();
    expect(reads).toEqual([]);
  });
});
