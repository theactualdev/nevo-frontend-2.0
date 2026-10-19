import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { planProbe, readProbePlan } from "./probePlan";

/**
 * Whether Module 4 will run, settled before any of it is drawn - as Teslim's
 * 19 Oct no-question-bank exception and Olayinka's ruling the same day ("an
 * unavailable probe moves the child on, never to a dead end, and don't fill in
 * any placement on the device") need it.
 *
 * The half that can be wrong: a probe with nothing to ask read as one that
 * will run (a stretch for nothing), a failed read read as nothing to ask (a
 * broken backend passed off as an empty bank), and an item read twice.
 */

const { readiness, next, getToken } = vi.hoisted(() => ({
  readiness: vi.fn(),
  next: vi.fn(),
  getToken: vi.fn(),
}));
vi.mock("@/lib/api/probe", async (orig) => ({
  ...(await orig<typeof import("./probe")>()),
  probeApi: { readiness, next },
}));
vi.mock("@/lib/auth/session", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/session")>()),
  getToken,
}));

const MATHS = { subjectId: "sub-maths", name: "Mathematics", probeAvailable: true };
const ENGLISH = { subjectId: "sub-eng", name: "English", probeAvailable: true };
const SCIENCE = { subjectId: "sub-sci", name: "Science", probeAvailable: true };
const ART = { subjectId: "sub-art", name: "Art", probeAvailable: false };

function ready(subjects: (typeof MATHS)[], probeDone = false) {
  return {
    complete: probeDone,
    modules: [
      { id: "grid_span", completed: true },
      { id: "pattern_flanker", completed: true },
      { id: "sentence_dot", completed: true },
      { id: "domain_probe", completed: probeDone },
    ],
    subjects,
    nextModule: probeDone ? null : "domain_probe",
  };
}

const item = (subjectId: string, itemId: string) => ({
  subjectId,
  itemId,
  question: "Which animal lives in water?",
  options: [{ value: "opt-fish", label: "Fish" }],
  asked: 1,
  maxQuestions: 8,
});
const empty = (subjectId: string) => ({ finished: true, noItems: true, subjectId });
const finished = (subjectId: string) => ({
  finished: true,
  subjectId,
  entryPoint: 0.5,
  asked: 0,
});

beforeEach(() => {
  getToken.mockReturnValue("tok-child");
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("planProbe", () => {
  it("is held, and asks nothing, when the server already has Module 4", async () => {
    await expect(planProbe(ready([MATHS], true))).resolves.toEqual({ kind: "held" });
    expect(next).not.toHaveBeenCalled();
  });

  it("is unavailable, and asks nothing, when no subject has items", async () => {
    await expect(planProbe(ready([ART]))).resolves.toEqual({ kind: "unavailable" });
    await expect(planProbe(ready([]))).resolves.toEqual({ kind: "unavailable" });
    expect(next).not.toHaveBeenCalled();
  });

  it("is unavailable when every subject that should have items answers with none", async () => {
    next.mockImplementation(async (id: string) => empty(id));

    await expect(planProbe(ready([MATHS, ENGLISH, ART]))).resolves.toEqual({
      kind: "unavailable",
    });
    // Art said it has none, so it was not asked.
    expect(next.mock.calls).toEqual([["sub-maths"], ["sub-eng"]]);
  });

  it("is unavailable when a subject finishes before asking anything", async () => {
    // `next` saying "finished" records nothing on the server - only an answer
    // that finishes the probe does - so it is not a module the child sat.
    next.mockImplementation(async (id: string) => finished(id));

    await expect(planProbe(ready([MATHS]))).resolves.toEqual({ kind: "unavailable" });
  });

  it("keeps each first item, in the server's order, for only the subjects that have one", async () => {
    next.mockImplementation(async (id: string) =>
      id === "sub-eng" ? empty(id) : item(id, `first-${id}`),
    );

    const plan = await planProbe(ready([MATHS, ENGLISH, SCIENCE]));

    expect(plan).toEqual({
      kind: "ask",
      openings: [
        { subject: MATHS, item: item("sub-maths", "first-sub-maths") },
        { subject: SCIENCE, item: item("sub-sci", "first-sub-sci") },
      ],
    });
    expect(next).toHaveBeenCalledTimes(3);
  });

  it("asks with the subjects that answered, when another's read failed", async () => {
    next.mockImplementation(async (id: string) => {
      if (id === "sub-maths") throw new Error("offline");
      return item(id, "eng-1");
    });

    const plan = await planProbe(ready([MATHS, ENGLISH]));

    expect(plan).toEqual({
      kind: "ask",
      openings: [{ subject: ENGLISH, item: item("sub-eng", "eng-1") }],
    });
  });

  it("is failed, not unavailable, when nothing answered with an item and a read failed", async () => {
    next.mockImplementation(async (id: string) => {
      if (id === "sub-maths") throw new Error("offline");
      return empty(id);
    });
    await expect(planProbe(ready([MATHS, ENGLISH]))).resolves.toEqual({
      kind: "failed",
    });

    next.mockRejectedValue(new Error("offline"));
    await expect(planProbe(ready([MATHS]))).resolves.toEqual({ kind: "failed" });
  });
});

describe("readProbePlan", () => {
  it("reads readiness, then plans from it", async () => {
    readiness.mockResolvedValue(ready([MATHS]));
    next.mockResolvedValue(item("sub-maths", "m-1"));

    await expect(readProbePlan()).resolves.toEqual({
      kind: "ask",
      openings: [{ subject: MATHS, item: item("sub-maths", "m-1") }],
    });
  });

  it("is failed when readiness cannot be read", async () => {
    readiness.mockRejectedValue(new Error("offline"));

    await expect(readProbePlan()).resolves.toEqual({ kind: "failed" });
    expect(next).not.toHaveBeenCalled();
  });

  it("reads nothing at all with no session - the signed-out walkthrough", async () => {
    getToken.mockReturnValue(undefined);

    await expect(readProbePlan()).resolves.toEqual({ kind: "unavailable" });
    expect(readiness).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
