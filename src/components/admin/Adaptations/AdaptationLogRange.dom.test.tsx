import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { AdminClass } from "@/lib/api/classes";
import type { SchoolTerm } from "@/lib/api/school";
import { AdaptationLogView } from "./AdaptationLogView";
import { startOfDay, toYmd } from "./logWindow";

/**
 * D21's "When": This week, This half-term, Custom range… - and "Clear
 * filters" for the whole bar. It offered rolling 7/30/120 days with the 120
 * called "This term", never sent `dateTo`, and nothing reset the range.
 */

const logSpy = vi.fn();
const schoolGet = vi.fn();

vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  const klass: AdminClass = {
    id: "c1",
    name: "JSS 2A",
    code: null,
    yearGroup: "jss2",
    source: null,
    subjects: [],
    studentCount: 4,
    section: null,
    academicSession: null,
    capacity: null,
    teacherCount: 0,
    teachers: [],
    archivedAt: null,
  };
  return { ...actual, classesApi: { ...actual.classesApi, list: async () => [klass] } };
});
vi.mock("@/lib/api/schoolIntelligence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/schoolIntelligence")>();
  return {
    ...actual,
    schoolIntelligenceApi: {
      ...actual.schoolIntelligenceApi,
      adaptationLog: (q: unknown) => logSpy(q),
      complianceAudit: () => Promise.reject(new Error("not under test")),
    },
  };
});
vi.mock("@/lib/api/school", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/school")>();
  return { ...actual, schoolApi: { ...actual.schoolApi, get: () => schoolGet() } };
});

type Query = { dateFrom: string; dateTo?: string; classId?: string; eventType?: string[] };
const lastCall = (): Query => logSpy.mock.calls[logSpy.mock.calls.length - 1][0];

const daysAgo = (n: number) => toYmd(new Date(Date.now() - n * 864e5));
const school = (terms: SchoolTerm[]) => ({ name: "Brightgate", academicConfig: { terms } });
/** A term around today, five days into its second half. */
const TERM: SchoolTerm = {
  id: "t1",
  name: "First term",
  start: daysAgo(40),
  end: daysAgo(-40),
  halfTermStart: daysAgo(10),
  halfTermEnd: daysAgo(5),
};

const button = (name: string | RegExp) => screen.findByRole("button", { name });

beforeEach(() => {
  vi.clearAllMocks();
  logSpy.mockResolvedValue({ events: [], total: 3, limit: 5, offset: 0 });
  schoolGet.mockResolvedValue(school([TERM]));
});

describe("the When filter", () => {
  it("offers the frame's three ranges, and no rolling 'This term'", async () => {
    render(<AdaptationLogView />);
    await button("This week");
    await button("This half-term");
    await button("Custom range…");
    expect(screen.queryByRole("button", { name: "This term" })).toBeNull();
    expect(screen.queryByRole("button", { name: "This month" })).toBeNull();
  });

  it("asks for the school's own half-term, from its term dates", async () => {
    const { container } = render(<AdaptationLogView />);
    fireEvent.click(await button("This half-term"));
    await waitFor(() =>
      expect(lastCall().dateFrom).toBe(startOfDay(TERM.halfTermEnd!)!.toISOString()),
    );
    expect(lastCall().dateTo).toBeUndefined();
    await waitFor(() => expect(visibleText(container)).toMatch(/3 adaptations this half-term/));
  });

  it("says the half-term is not set, and asks for nothing, rather than guessing one", async () => {
    schoolGet.mockResolvedValue(school([{ ...TERM, halfTermStart: undefined, halfTermEnd: undefined }]));
    logSpy.mockResolvedValue({ events: [], total: 9, limit: 5, offset: 0 });
    const { container } = render(<AdaptationLogView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/9 adaptations in the last 7 days/));
    const calls = logSpy.mock.calls.length;

    fireEvent.click(await button("This half-term"));
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Your half-term dates aren.t set/),
    );
    expect(logSpy.mock.calls.length).toBe(calls);
    // The week's figure is not left standing under the half-term's name.
    expect(visibleText(container)).not.toMatch(/9 adaptations/);
    expect(screen.getByRole("link", { name: /term dates in Settings/ }).getAttribute("href")).toBe(
      "/admin/settings#settings-school",
    );
  });

  it("sends a custom range's start and end, and holds a backwards one", async () => {
    const { container } = render(<AdaptationLogView />);
    fireEvent.click(await button("Custom range…"));
    const [from, to] = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="date"]'));

    fireEvent.change(from, { target: { value: daysAgo(20) } });
    fireEvent.change(to, { target: { value: daysAgo(10) } });
    await waitFor(() => expect(lastCall().dateFrom).toBe(startOfDay(daysAgo(20))!.toISOString()));
    expect(new Date(lastCall().dateTo!).getDate()).toBe(startOfDay(daysAgo(10))!.getDate());
    await waitFor(() => expect(visibleText(container)).toMatch(/3 adaptations between/));

    const calls = logSpy.mock.calls.length;
    fireEvent.change(from, { target: { value: daysAgo(2) } });
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/The start date is after the end date/),
    );
    expect(logSpy.mock.calls.length).toBe(calls);
  });
});

describe("Clear filters", () => {
  it("is absent until something is filtered, then resets type, class and range together", async () => {
    render(<AdaptationLogView />);
    await button("This week");
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();

    fireEvent.click(await button("This half-term"));
    fireEvent.click(await button("Suggested a break"));
    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "c1" } });
    await waitFor(() => expect(lastCall().classId).toBe("c1"));
    expect(lastCall().eventType).toHaveLength(1);

    fireEvent.click(await button("Clear filters"));
    await waitFor(() => expect(lastCall().classId).toBeUndefined());
    expect(lastCall().eventType).toBeUndefined();
    expect(Math.round((Date.now() - Date.parse(lastCall().dateFrom)) / 864e5)).toBe(7);
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
  });
});
