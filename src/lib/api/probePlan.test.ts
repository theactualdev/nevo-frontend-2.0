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
 *
 * And, since Teslim's answers of 21 Oct, the other way: an empty subject or a
 * finish before any question read as NO BANK. Only the server's `status:
 * "unavailable"` says that; anything else with nothing to ask reads readiness
 * once more and follows it, and is reported, not moved past, when it still
 * holds the probe owed.
 */

const { readiness, next, getToken, report } = vi.hoisted(() => ({
  readiness: vi.fn(),
  next: vi.fn(),
  getToken: vi.fn(),
  report: vi.fn(),
}));
vi.mock("@/lib/api/probe", async (orig) => ({
  ...(await orig<typeof import("./probe")>()),
  probeApi: { readiness, next },
}));
vi.mock("@/lib/auth/session", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/session")>()),
  getToken,
}));
vi.mock("@/lib/api/clientErrors", async (orig) => ({
  ...(await orig<typeof import("./clientErrors")>()),
  reportProbeNothingToAsk: report,
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

/**
 * Teslim's 19 Oct contract for no bank in any subject: Module 4 `completed:
 * true, status: "unavailable"`, and no suggested subject.
 */
function noBank() {
  return {
    ...ready([], true),
    modules: [
      { id: "grid_span", completed: true, status: "completed" as const },
      { id: "pattern_flanker", completed: true, status: "completed" as const },
      { id: "sentence_dot", completed: true, status: "completed" as const },
      { id: "domain_probe", completed: true, status: "unavailable" as const },
    ],
    probeSubjectId: null,
    probePolicy: "one_available_subject" as const,
  };
}

/** Module 4 held as owed - `status: "pending"` - with these subjects. */
function owed(subjects: (typeof MATHS)[], probeSubjectId: string | null = null) {
  const base = ready(subjects);
  return {
    ...base,
    modules: base.modules.map((m) =>
      m.id === "domain_probe" ? { ...m, status: "pending" as const } : m,
    ),
    probeSubjectId,
    probePolicy: "one_available_subject" as const,
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
  // Withheld from a student since d461b60: always null.
  entryPoint: null,
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

  it("is unavailable, not held, when the server holds the probe as unavailable", async () => {
    // Teslim's 19 Oct contract: no bank arrives as `completed: true, status:
    // "unavailable"`. Held, it ended as sat and kept a fourth quest map stop
    // for a module nobody was asked (design, 9 Oct: three for three).
    await expect(planProbe(noBank())).resolves.toEqual({ kind: "unavailable" });
    expect(next).not.toHaveBeenCalled();
    // The server has said it: nothing to read again.
    expect(readiness).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });

  it("is still held when the server holds the probe as completed", async () => {
    const done = ready([MATHS], true);
    const modules = done.modules.map((m) => ({ ...m, status: "completed" as const }));

    await expect(planProbe({ ...done, modules })).resolves.toEqual({ kind: "held" });
  });

  it("marks the server's suggested subject, and keeps the server's order", async () => {
    next.mockImplementation(async (id: string) => item(id, `first-${id}`));

    const plan = await planProbe({
      ...ready([ENGLISH, MATHS]),
      probeSubjectId: "sub-maths",
    });

    expect(plan).toEqual({
      kind: "ask",
      openings: [
        { subject: ENGLISH, item: item("sub-eng", "first-sub-eng"), suggested: false },
        { subject: MATHS, item: item("sub-maths", "first-sub-maths"), suggested: true },
      ],
    });
  });

  it("suggests none when the server suggests none", async () => {
    next.mockImplementation(async (id: string) => item(id, `first-${id}`));

    const plan = await planProbe({ ...ready([MATHS]), probeSubjectId: null });

    expect(plan).toEqual({
      kind: "ask",
      openings: [
        { subject: MATHS, item: item("sub-maths", "first-sub-maths"), suggested: false },
      ],
    });
  });

  it("keeps each first item, in the server's order, for only the subjects that have one", async () => {
    next.mockImplementation(async (id: string) =>
      id === "sub-eng" ? empty(id) : item(id, `first-${id}`),
    );

    const plan = await planProbe(ready([MATHS, ENGLISH, SCIENCE]));

    expect(plan).toEqual({
      kind: "ask",
      openings: [
        { subject: MATHS, item: item("sub-maths", "first-sub-maths"), suggested: false },
        { subject: SCIENCE, item: item("sub-sci", "first-sub-sci"), suggested: false },
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
      openings: [{ subject: ENGLISH, item: item("sub-eng", "eng-1"), suggested: false }],
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
    // Not known, so not "nothing to ask" either: no re-read, no report.
    expect(readiness).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });
});

/*
 * Teslim's answers, 21 Oct: "`ProbeFinished` means the server finished that
 * subject's run; it is not a no-bank signal. Read onboarding again", and
 * after `probeAvailable: true` then `ProbeEmpty`, "Refresh onboarding. If
 * another eligible subject has questions, use that subject; an empty subject
 * alone must not waive module 4." Olayinka's order on them: re-read once and
 * follow the server; only its `unavailable` is no bank; still available with
 * nothing to ask is flagged to backend, not moved past.
 */
describe("planProbe, when no subject gives a question", () => {
  it("reads readiness again after a finish before any question, and is held when it says done", async () => {
    next.mockImplementation(async (id: string) => finished(id));
    readiness.mockResolvedValue(ready([MATHS], true));

    await expect(planProbe(ready([MATHS]))).resolves.toEqual({ kind: "held" });
    // Read again once - the first readiness came in hand - and followed.
    expect(readiness).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
    expect(report).not.toHaveBeenCalled();
  });

  it("asks the other subject the re-read offers when the one marked available answers empty", async () => {
    next.mockImplementation(async (id: string) =>
      id === "sub-eng" ? item(id, "eng-1") : empty(id),
    );
    // Suggested Mathematics, which turned out empty; the re-read suggests
    // English, and that is the suggestion kept.
    readiness.mockResolvedValue(owed([MATHS, ENGLISH], "sub-eng"));

    const plan = await planProbe(owed([MATHS], "sub-maths"));

    expect(plan).toEqual({
      kind: "ask",
      openings: [{ subject: ENGLISH, item: item("sub-eng", "eng-1"), suggested: true }],
    });
    expect(readiness).toHaveBeenCalledTimes(1);
    // Mathematics once on each readiness, English on the re-read only.
    expect(next.mock.calls).toEqual([["sub-maths"], ["sub-maths"], ["sub-eng"]]);
    expect(report).not.toHaveBeenCalled();
  });

  it("is unavailable when nothing has a question and the re-read holds the probe as unavailable", async () => {
    next.mockImplementation(async (id: string) => empty(id));
    readiness.mockResolvedValue(noBank());

    await expect(planProbe(owed([MATHS, ENGLISH]))).resolves.toEqual({
      kind: "unavailable",
    });
    // The server said so on the re-read: that is what moved it, and nothing
    // was asked of it.
    expect(readiness).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(2);
    expect(report).not.toHaveBeenCalled();
  });

  it("is nothingToAsk, reported once, when the re-read still holds the probe owed with nothing to ask", async () => {
    next.mockImplementation(async (id: string) =>
      id === "sub-eng" ? finished(id) : empty(id),
    );
    readiness.mockResolvedValue(owed([MATHS, ENGLISH, ART]));

    // The first readiness sent no status; what is reported is the re-read's.
    await expect(planProbe(ready([MATHS, ART]))).resolves.toEqual({
      kind: "nothingToAsk",
    });
    // One re-read and no third: two answers that disagree are not a loop.
    expect(readiness).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith({
      subjectIds: ["sub-maths", "sub-eng"],
      status: "pending",
    });
  });

  it("reads readiness again when no subject is marked with items, and follows it", async () => {
    // Not unavailable by the server's status, so not no bank: the re-read
    // decides - here, a subject with items by then.
    next.mockImplementation(async (id: string) => item(id, `first-${id}`));
    readiness.mockResolvedValue(ready([ART, MATHS]));

    await expect(planProbe(ready([ART]))).resolves.toEqual({
      kind: "ask",
      openings: [
        { subject: MATHS, item: item("sub-maths", "first-sub-maths"), suggested: false },
      ],
    });
    expect(readiness).toHaveBeenCalledTimes(1);
    expect(next.mock.calls).toEqual([["sub-maths"]]);
  });

  it("is nothingToAsk, not unavailable, when no subject is marked with items on either read", async () => {
    readiness.mockResolvedValue(ready([]));

    await expect(planProbe(ready([ART]))).resolves.toEqual({ kind: "nothingToAsk" });
    expect(next).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledWith({ subjectIds: [], status: undefined });
  });

  it("is failed when the re-read cannot be read", async () => {
    next.mockImplementation(async (id: string) => empty(id));
    readiness.mockRejectedValue(new Error("offline"));

    await expect(planProbe(ready([MATHS]))).resolves.toEqual({ kind: "failed" });
    expect(report).not.toHaveBeenCalled();
  });

  it("is failed when a subject the re-read offers cannot be read and none gives a question", async () => {
    let calls = 0;
    next.mockImplementation(async (id: string) => {
      calls += 1;
      if (calls > 1 && id === "sub-maths") throw new Error("offline");
      return empty(id);
    });
    readiness.mockResolvedValue(ready([MATHS, ENGLISH]));

    await expect(planProbe(ready([MATHS]))).resolves.toEqual({ kind: "failed" });
    expect(report).not.toHaveBeenCalled();
  });
});

describe("readProbePlan", () => {
  it("reads readiness, then plans from it", async () => {
    readiness.mockResolvedValue(ready([MATHS]));
    next.mockResolvedValue(item("sub-maths", "m-1"));

    await expect(readProbePlan()).resolves.toEqual({
      kind: "ask",
      openings: [{ subject: MATHS, item: item("sub-maths", "m-1"), suggested: false }],
    });
  });

  it("is failed when readiness cannot be read", async () => {
    readiness.mockRejectedValue(new Error("offline"));

    await expect(readProbePlan()).resolves.toEqual({ kind: "failed" });
    expect(next).not.toHaveBeenCalled();
  });

  it("reads readiness twice at most: once, and once again when nothing has a question", async () => {
    readiness.mockResolvedValue(owed([MATHS]));
    next.mockImplementation(async (id: string) => empty(id));

    await expect(readProbePlan()).resolves.toEqual({ kind: "nothingToAsk" });
    expect(readiness).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenCalledTimes(1);
  });

  it("reads nothing at all with no session - the signed-out walkthrough", async () => {
    getToken.mockReturnValue(undefined);

    await expect(readProbePlan()).resolves.toEqual({ kind: "unavailable" });
    expect(readiness).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
