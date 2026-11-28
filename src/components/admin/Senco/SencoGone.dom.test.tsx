import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { AdminClass } from "@/lib/api/classes";

/**
 * Check 21 (Hub, 28 Nov): a read that answers after the SENCo screen has gone
 * sets nothing. The admin sweep guarded 67 reads with `useStillHere`; these
 * four - Active support, adaptations this week, teachers' concerns and the
 * first read - were left, and set state on a screen that had already gone.
 *
 * Each test holds one read open, unmounts, then answers it. The answer must
 * not even be LOOKED AT (a proxy records every property read, bar the `then`
 * a promise checks on anything it resolves with), and nothing that rides on
 * it may be asked for.
 */

const h = vi.hoisted(() => ({
  allFlags: vi.fn(),
  listActive: vi.fn(),
  window: vi.fn(),
  allOpen: vi.fn(),
  teachers: vi.fn(),
  classStudents: vi.fn(),
}));

vi.mock("@/lib/api/intelligence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/intelligence")>();
  return { ...actual, intelligenceApi: { ...actual.intelligenceApi, allFlags: () => h.allFlags() } };
});
vi.mock("@/lib/api/escalations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/escalations")>();
  return { ...actual, escalationsApi: { ...actual.escalationsApi, allOpen: () => h.allOpen() } };
});
vi.mock("@/lib/api/teachers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/teachers")>();
  return { ...actual, teachersApi: { ...actual.teachersApi, list: () => h.teachers() } };
});
const klass: AdminClass = {
  id: "c1",
  name: "JSS 2A",
  code: null,
  yearGroup: "jss2",
  source: null,
  subjects: [],
  studentCount: 1,
  section: null,
  academicSession: null,
  capacity: null,
  teacherCount: 0,
  teachers: [],
  archivedAt: null,
};
vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return {
    ...actual,
    classesApi: {
      ...actual.classesApi,
      list: async () => [klass],
      classStudents: (id: string) => h.classStudents(id),
    },
  };
});
vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return {
    ...actual,
    studentsApi: { ...actual.studentsApi, list: async () => [] },
    accommodationsApi: { listActive: () => h.listActive() },
  };
});
vi.mock("@/lib/adaptationWindow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/adaptationWindow")>();
  return { ...actual, collectAdaptationWindow: () => h.window() };
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
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { SencoView } from "./SencoView";

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

/** What was read off an answer, bar the `then` every promise checks for. */
const lookedAt = (reads: string[]) => reads.filter((p) => p !== "then");

/** Long enough for every callback a late answer would run to have run. */
const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });

beforeEach(() => {
  h.allFlags.mockReset().mockResolvedValue({ flags: [], complete: true });
  h.listActive.mockReset().mockResolvedValue([]);
  h.window.mockReset().mockResolvedValue({ perLearner: {}, complete: true });
  h.allOpen.mockReset().mockResolvedValue({ open: [], complete: true });
  h.teachers.mockReset().mockResolvedValue([]);
  h.classStudents.mockReset().mockResolvedValue([]);
});

describe("SencoView, once it has gone", () => {
  it("asks for no class roster when the first read answers late", async () => {
    const first = later<{ flags: never[]; complete: boolean }>();
    h.allFlags.mockReturnValue(first.promise);
    const view = render(<SencoView />);
    await settle();
    view.unmount();

    first.resolve({ flags: [], complete: true });
    await settle();
    expect(h.classStudents).not.toHaveBeenCalled();
  });

  it("does not look at a first read that fails late", async () => {
    const first = later<never>();
    h.allFlags.mockReturnValue(first.promise);
    const view = render(<SencoView />);
    await settle();
    view.unmount();

    const reads: string[] = [];
    first.reject(watched(new ApiError(500, "Server Error", {}), reads));
    await settle();
    expect(lookedAt(reads)).toEqual([]);
  });

  it("does not look at a class roster that answers late", async () => {
    const roster = later<never[]>();
    h.classStudents.mockReturnValue(roster.promise);
    const view = render(<SencoView />);
    await settle();
    expect(h.classStudents).toHaveBeenCalledWith("c1");
    view.unmount();

    const reads: string[] = [];
    roster.resolve(watched([], reads));
    await settle();
    expect(lookedAt(reads)).toEqual([]);
  });

  it("does not look at Active support when it answers late - or is refused late", async () => {
    const support = later<never[]>();
    h.listActive.mockReturnValue(support.promise);
    const view = render(<SencoView />);
    await settle();
    view.unmount();

    const reads: string[] = [];
    support.resolve(watched([], reads));
    await settle();
    expect(lookedAt(reads)).toEqual([]);

    const refused = later<never>();
    h.listActive.mockReturnValue(refused.promise);
    const again = render(<SencoView />);
    await settle();
    again.unmount();

    const errReads: string[] = [];
    refused.reject(watched(new ApiError(403, "Forbidden", {}), errReads));
    await settle();
    expect(lookedAt(errReads)).toEqual([]);
  });

  it("does not look at the week's adaptations when they answer late", async () => {
    const week = later<{ perLearner: Record<string, number>; complete: boolean }>();
    h.window.mockReturnValue(week.promise);
    const view = render(<SencoView />);
    await settle();
    view.unmount();

    const reads: string[] = [];
    week.resolve(watched({ perLearner: { s1: 1 }, complete: true }, reads));
    await settle();
    expect(lookedAt(reads)).toEqual([]);
  });

  it("does not look at teachers' concerns, or who raised them, when they answer late", async () => {
    const concerns = later<{ open: never[]; complete: boolean }>();
    const teachers = later<never[]>();
    h.allOpen.mockReturnValue(concerns.promise);
    h.teachers.mockReturnValue(teachers.promise);
    const view = render(<SencoView />);
    await settle();
    view.unmount();

    const reads: string[] = [];
    concerns.resolve(watched({ open: [], complete: true }, reads));
    teachers.resolve(watched([], reads));
    await settle();
    expect(lookedAt(reads)).toEqual([]);
  });
});
