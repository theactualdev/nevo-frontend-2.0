import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { AdminClass } from "@/lib/api/classes";
import { AdaptationLogView } from "./AdaptationLogView";

/**
 * The class filter, and the four ways it could quietly lie.
 *
 * This filter was marked impossible for months on the claim that "no endpoint
 * lists classes" - while `classId` sat on the log endpoint as a declared query
 * parameter the whole time. Now that it is built, these pin the parts that are
 * easy to get wrong and invisible when they are:
 *
 * 1. `classId` is a UUID on the contract. Sending "" is a 422 that takes the
 *    whole log down, so no-class must OMIT the parameter, never blank it.
 * 2. The pagination here is a GROWING LIMIT, not offset paging. Changing the
 *    filter without resetting it asks for 20 rows of a 3-row class.
 * 3. A filtered count must say so. "12 adaptations in the last 7 days" while a
 *    class is selected reads as the school's figure and is out by a school.
 * 4. The class list has its own failure. A directory read that dies must not
 *    cost an admin the log they came for.
 */

const logSpy = vi.fn();
const classList = vi.fn();

vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return {
    ...actual,
    classesApi: { ...actual.classesApi, list: () => classList() },
  };
});

vi.mock("@/lib/api/schoolIntelligence", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/api/schoolIntelligence")>();
  return {
    ...actual,
    schoolIntelligenceApi: {
      ...actual.schoolIntelligenceApi,
      adaptationLog: (q: unknown) => logSpy(q),
      // Owns its own failure already; not under test here.
      complianceAudit: () => Promise.reject(new Error("not under test")),
    },
  };
});

const klass = (id: string, name: string): AdminClass => ({
  id,
  name,
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
});

const row = (id: string) => ({
  id,
  studentId: `s${id}`,
  studentFirstName: "Amara",
  lessonId: "l1",
  lessonTitle: "Fractions",
  timestamp: new Date().toISOString(),
  trigger: "Paused on the same step repeatedly.",
  adaptation: "Added a worked example.",
  eventType: "Scaffold added",
});

const lastCall = () => logSpy.mock.calls[logSpy.mock.calls.length - 1][0];

async function selectClass(container: HTMLElement, value: string) {
  const select = await waitFor(() => {
    const el = container.querySelector("select");
    if (!el) throw new Error("no select yet");
    return el;
  });
  fireEvent.change(select, { target: { value } });
}

beforeEach(() => {
  logSpy.mockReset();
  classList.mockReset();
  classList.mockResolvedValue([klass("c1", "JSS 2A"), klass("c2", "JSS 3B")]);
  logSpy.mockResolvedValue({ events: [row("1")], total: 1, limit: 5, offset: 0 });
});

describe("filtering the adaptation log by class", () => {
  it("omits classId entirely until a class is chosen, then sends the id", async () => {
    const { container } = render(<AdaptationLogView />);

    await waitFor(() => expect(logSpy).toHaveBeenCalled());
    // Not "", which the contract rejects as a malformed uuid.
    expect(lastCall().classId).toBeUndefined();

    await selectClass(container, "c1");
    await waitFor(() => expect(lastCall().classId).toBe("c1"));
  });

  it("goes back to the first page when the class changes", async () => {
    logSpy.mockResolvedValue({
      events: [row("1")],
      total: 40,
      limit: 5,
      offset: 0,
    });
    const { container } = render(<AdaptationLogView />);

    await waitFor(() => expect(logSpy).toHaveBeenCalled());
    fireEvent.click(await screenButton(container, "Load earlier adaptations"));
    // The next page by OFFSET, at the same page size - the limit never grows.
    await waitFor(() => expect(lastCall()).toMatchObject({ limit: 5, offset: 1 }));

    await selectClass(container, "c1");
    // A new filter starts again from the first page.
    await waitFor(() =>
      expect(lastCall()).toMatchObject({ classId: "c1", limit: 5, offset: 0 }),
    );
  });

  it("never asks for more than the contract's 100-row cap, however far back it goes", async () => {
    /*
     * "Load earlier" used to raise `limit` by five and refetch. The twentieth
     * press sent limit=105, the contract's cap is 100, the 422 replaced the
     * whole log with a failure card. Paging by offset keeps every request at
     * one page.
     */
    logSpy.mockResolvedValue({
      events: Array.from({ length: 5 }, (_, i) => row(`r${i}`)),
      total: 400,
      limit: 5,
      offset: 0,
    });
    const { container } = render(<AdaptationLogView />);
    await waitFor(() => expect(logSpy).toHaveBeenCalled());

    for (let i = 0; i < 22; i += 1) {
      const before = logSpy.mock.calls.length;
      fireEvent.click(await screenButton(container, "Load earlier adaptations"));
      await waitFor(() => expect(logSpy.mock.calls.length).toBe(before + 1));
    }
    for (const [params] of logSpy.mock.calls) {
      expect((params as { limit: number }).limit).toBeLessThanOrEqual(100);
    }
    expect(lastCall().offset).toBe(110);
  });

  it("keeps what is shown when one earlier page fails", async () => {
    logSpy.mockResolvedValueOnce({ events: [row("1")], total: 40, limit: 5, offset: 0 });
    logSpy.mockRejectedValueOnce(new Error("500"));
    const { container } = render(<AdaptationLogView />);
    await waitFor(() => expect(logSpy).toHaveBeenCalledTimes(1));

    fireEvent.click(await screenButton(container, "Load earlier adaptations"));
    await waitFor(() =>
      expect(container.textContent).toMatch(/couldn.t load the earlier ones/),
    );
    expect(container.textContent).toMatch(/Showing 1 of 40/);
  });

  it("keeps the date range when the class changes", async () => {
    const { container } = render(<AdaptationLogView />);
    await waitFor(() => expect(logSpy).toHaveBeenCalled());

    fireEvent.click(await screenButton(container, "This month"));
    await waitFor(() => expect(logSpy.mock.calls.length).toBeGreaterThan(1));

    await selectClass(container, "c1");
    await waitFor(() => expect(lastCall().classId).toBe("c1"));

    const days = (Date.now() - Date.parse(lastCall().dateFrom)) / 864e5;
    expect(days).toBeGreaterThan(20);
  });

  it("names the class in the count, so a filtered figure is never read as the school's", async () => {
    logSpy.mockResolvedValue({
      events: [row("1")],
      total: 12,
      limit: 5,
      offset: 0,
    });
    const { container } = render(<AdaptationLogView />);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/12 adaptations in the last 7 days/),
    );

    await selectClass(container, "c1");
    await waitFor(() =>
      expect(visibleText(container)).toMatch(
        /12 adaptations in JSS 2A in the last 7 days/,
      ),
    );
  });

  it("still shows the log when the class list cannot be read", async () => {
    classList.mockRejectedValue(new Error("500"));
    const { container } = render(<AdaptationLogView />);

    // The log is the thing the admin came for and it survives.
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/adaptation in the last 7 days/),
    );
    expect(visibleText(container)).toMatch(/Class list didn't load/);
    expect(visibleText(container)).not.toMatch(/We couldn't load the adaptation log/);
  });

  it("offers a way back out of an empty class rather than a dead end", async () => {
    logSpy.mockResolvedValue({ events: [], total: 0, limit: 5, offset: 0 });
    const { container } = render(<AdaptationLogView />);
    await waitFor(() => expect(logSpy).toHaveBeenCalled());

    await selectClass(container, "c1");
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Nothing to show for this class and range/),
    );

    fireEvent.click(await screenButton(container, "Show all classes"));
    await waitFor(() => expect(lastCall().classId).toBeUndefined());
  });
});

/** getAllByRole throws rather than returning empty, so query and wait instead. */
async function screenButton(container: HTMLElement, name: string) {
  return waitFor(() => {
    const hit = Array.from(container.querySelectorAll("button")).find(
      (b) => (b.textContent ?? "").replace(/’/g, "'").trim() === name,
    );
    if (!hit) throw new Error(`no button named ${name}`);
    return hit;
  });
}
