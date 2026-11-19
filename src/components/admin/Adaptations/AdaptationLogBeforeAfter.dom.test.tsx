import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AdaptationLogView } from "./AdaptationLogView";

/**
 * D21's EXPANDED ROW: Before / After / the signal behind it (backlog 49).
 *
 * The live contract has carried `before` and `after` on every row - nullable,
 * in the server's own words - while the client type dropped them and a
 * TODO(api) said they had no source.
 */

const logSpy = vi.fn();

vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return { ...actual, classesApi: { ...actual.classesApi, list: () => Promise.resolve([]) } };
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

const row = (over: Record<string, unknown> = {}) => ({
  id: "e1",
  studentId: "s1",
  studentFirstName: "Amara",
  lessonId: "l1",
  lessonTitle: "Fractions",
  timestamp: new Date().toISOString(),
  trigger: "Comprehension declining",
  adaptation: "Text -> Audio",
  eventType: "modality_suggestion_accepted",
  before: "Text",
  after: "Audio",
  ...over,
});

const openRow = async () => {
  render(<AdaptationLogView />);
  fireEvent.click(await screen.findByRole("button", { expanded: false, name: /Fractions/ }));
};

beforeEach(() => {
  logSpy.mockReset();
});

describe("an adaptation, opened", () => {
  it("shows what the lesson was before and after, in the server's words", async () => {
    logSpy.mockResolvedValue({ events: [row()], total: 1, limit: 5, offset: 0 });
    await openRow();

    const pair = document.querySelector("[data-before-after]") as HTMLElement;
    expect(pair).not.toBeNull();
    expect(pair).toHaveTextContent(/^Before\s*Text\s*After\s*Audio$/);
    // Above the signal, as D21 draws it.
    const signal = screen.getByText("Signal behind it");
    expect(pair.compareDocumentPosition(signal) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Comprehension declining")).toBeInTheDocument();
  });

  it("shows the pacing pair as the server words it", async () => {
    logSpy.mockResolvedValue({
      events: [row({ eventType: "slower_trigger", before: "Standard pace", after: "Slower pace" })],
      total: 1,
      limit: 5,
      offset: 0,
    });
    await openRow();

    expect(screen.getByText("Standard pace")).toBeInTheDocument();
    expect(screen.getByText("Slower pace")).toBeInTheDocument();
  });

  // Absence is an instruction: no pair where the server has none.
  it("draws no pair when the server sends none", async () => {
    logSpy.mockResolvedValue({
      events: [row({ before: null, after: null })],
      total: 1,
      limit: 5,
      offset: 0,
    });
    await openRow();

    expect(document.querySelector("[data-before-after]")).toBeNull();
    expect(screen.queryByText("Before")).not.toBeInTheDocument();
    expect(screen.getByText("Signal behind it")).toBeInTheDocument();
  });

  it("draws no half a pair", async () => {
    logSpy.mockResolvedValue({
      events: [row({ before: "Text", after: null })],
      total: 1,
      limit: 5,
      offset: 0,
    });
    await openRow();

    expect(document.querySelector("[data-before-after]")).toBeNull();
  });

  it("copes with an older server that sends neither field", async () => {
    const { before: _b, after: _a, ...older } = row();
    void _b;
    void _a;
    logSpy.mockResolvedValue({ events: [older], total: 1, limit: 5, offset: 0 });
    await openRow();

    expect(document.querySelector("[data-before-after]")).toBeNull();
  });
});
