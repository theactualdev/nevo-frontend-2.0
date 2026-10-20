import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { DomainProbeModule, DomainProbeStep } from "./DomainProbeModule";
import { QuestSegments } from "./QuestMap";
import { ApiError } from "@/lib/api/client";
import type { ProbeOpenings } from "@/lib/api/probePlan";
import catalogue from "@/lib/api/signals.catalogue.json";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * Module 4, the domain probe (09d), as Lydia ruled 17 Oct (SCRUM-244):
 * "Module 4 IS the domain probe ... All four run before any lesson."
 *
 * The server serves one item at a time and marks what it serves; this screen
 * shows the item, sends the pick, and shows whatever comes back. It must never
 * say right or wrong, never count, and never show what the probe concluded.
 *
 * And whether it runs at all is found out FIRST, as Teslim's 19 Oct
 * no-question-bank exception and Olayinka's ruling the same day need ("an
 * unavailable probe moves the child on, never to a dead end"): with nothing
 * to ask it is not presented - no stretch, no quest map stop - and it does not
 * invent a completion the server never recorded.
 */

const { readiness, next, answer, myDashboard } = vi.hoisted(() => ({
  readiness: vi.fn(),
  next: vi.fn(),
  answer: vi.fn(),
  myDashboard: vi.fn(),
}));
vi.mock("@/lib/api/probe", async (orig) => ({
  ...(await orig<typeof import("@/lib/api/probe")>()),
  probeApi: { readiness, next, answer },
}));
vi.mock("@/lib/api/students", () => ({ studentsApi: { myDashboard } }));
vi.mock("./StretchInterstitial", () => ({
  StretchInterstitial: ({ onDone }: { onDone: () => void }) => (
    <button type="button" onClick={onDone}>
      take a breath
    </button>
  ),
}));

const MATHS = { subjectId: "sub-maths", name: "Mathematics", probeAvailable: true };
const ENGLISH = { subjectId: "sub-eng", name: "English", probeAvailable: true };
const ART = { subjectId: "sub-art", name: "Art", probeAvailable: false };

/** The server's readiness for a child with the first three done. */
function ready(
  subjects: (typeof MATHS)[],
  probeDone = false,
): Record<string, unknown> {
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

/*
 * Items as the deployed contract sends them, `asked` and `maxQuestions`
 * included - and none of their words or options carry a digit, so a number
 * on screen can only have come from those.
 */
const Q1 = {
  subjectId: "sub-maths",
  itemId: "item-1",
  question: "Which animal lives in water?",
  options: [
    { value: "opt-fish", label: "Fish" },
    { value: "opt-cat", label: "Cat" },
    { value: "opt-bird", label: "Bird" },
  ],
  asked: 3,
  maxQuestions: 8,
};
const Q2 = {
  subjectId: "sub-maths",
  itemId: "item-2",
  question: "Which of these is a plant?",
  options: [
    { value: "opt-fern", label: "Fern" },
    { value: "opt-rock", label: "Rock" },
  ],
  asked: 4,
  maxQuestions: 8,
};
const QE = {
  subjectId: "sub-eng",
  itemId: "item-e",
  question: "Which word names a colour?",
  options: [
    { value: "opt-red", label: "Red" },
    { value: "opt-run", label: "Run" },
  ],
  asked: 1,
  maxQuestions: 8,
};
// `entryPoint` is withheld from a student since d461b60: always null.
const FINISHED = { finished: true, subjectId: "sub-maths", entryPoint: null, asked: 6 };
const EMPTY = { finished: true, noItems: true, subjectId: "sub-maths" };

/** What the plan hands the module: a subject and the first item it read. */
const MATHS_FIRST: ProbeOpenings = [{ subject: MATHS, item: Q1, suggested: false }];
const BOTH: ProbeOpenings = [
  { subject: MATHS, item: Q1, suggested: false },
  { subject: ENGLISH, item: QE, suggested: false },
];
/** Both, with the second the server's suggested subject (`probeSubjectId`). */
const ENGLISH_SUGGESTED: ProbeOpenings = [
  { subject: MATHS, item: Q1, suggested: false },
  { subject: ENGLISH, item: QE, suggested: true },
];

const signIn = () =>
  setSession({
    token: "tok-child",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId: "student-1",
    role: "student",
  });

const onDone = vi.fn();
const track = vi.fn();

/** The module, handed what to ask. */
function renderModule(
  props: Partial<Parameters<typeof DomainProbeModule>[0]> = {},
) {
  return render(
    <QuestSegments.Provider value={4}>
      <DomainProbeModule
        band="p46"
        openings={MATHS_FIRST}
        stretchFirst={false}
        onDone={onDone}
        track={track}
        {...props}
      />
    </QuestSegments.Provider>,
  );
}

/** The step, which finds out for itself what there is to ask. */
function renderStep(
  props: Partial<Parameters<typeof DomainProbeStep>[0]> = {},
) {
  return render(
    <QuestSegments.Provider value={4}>
      <DomainProbeStep
        stretchFirst={false}
        onDone={onDone}
        track={track}
        {...props}
      />
    </QuestSegments.Provider>,
  );
}

/** A promise the test settles when it chooses to. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  signIn();
  readiness.mockResolvedValue(ready([MATHS]));
  next.mockResolvedValue(Q1);
  myDashboard.mockResolvedValue({
    student: { id: "student-1", ageBand: "upper_primary" },
    assignments: [],
    recentProgress: [],
  });
});

afterEach(() => {
  cleanup();
  clearSession();
  vi.clearAllMocks();
});

describe("one item at a time, from the server", () => {
  it("shows the first item as the plan read it, and asks for it no second time", async () => {
    renderModule();

    expect(screen.getByText("Which animal lives in water?")).toBeInTheDocument();
    for (const label of ["Fish", "Cat", "Bird"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    await act(async () => {});
    expect(next).not.toHaveBeenCalled();
  });

  it("names each option on the button itself, as its own text", async () => {
    /*
     * 20 Oct production run: wrapped in a span, the label read as loose text
     * beside an unnamed button. jsdom names a button from its contents
     * either way, so the text is asserted where it lives.
     */
    renderModule();
    await act(async () => {});

    for (const label of ["Fish", "Cat", "Bird"]) {
      const option = screen.getByRole("button", { name: label });
      expect(option.children).toHaveLength(0);
      expect(
        Array.from(option.childNodes).some(
          (n) => n.nodeType === Node.TEXT_NODE && n.textContent === label,
        ),
      ).toBe(true);
      expect(option).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("sends the option's value, fills the pick, and shows the next item it is given", async () => {
    const pending = deferred<typeof Q2>();
    answer.mockReturnValue(pending.promise);
    renderModule();

    fireEvent.click(await screen.findByRole("button", { name: "Cat" }));

    expect(answer).toHaveBeenCalledWith("sub-maths", {
      itemId: "item-1",
      chosenOption: "opt-cat",
    });
    // The frame: "a selected option fills navy", and nothing else moves.
    const cat = screen.getByRole("button", { name: "Cat" });
    expect(cat).toHaveAttribute("aria-pressed", "true");
    expect(cat.className).toContain("bg-nevo-navy");
    // One answer per item: the rest wait for the next one.
    expect(screen.getByRole("button", { name: "Fish" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Fish" }));
    expect(answer).toHaveBeenCalledTimes(1);

    await act(async () => pending.resolve(Q2));

    expect(screen.getByText("Which of these is a plant?")).toBeInTheDocument();
    expect(screen.queryByText("Which animal lives in water?")).toBeNull();
    expect(screen.getByRole("button", { name: "Fern" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("sends one answer for two taps that land before the screen updates", async () => {
    answer.mockReturnValue(new Promise(() => {}));
    renderModule();
    const cat = await screen.findByRole("button", { name: "Cat" });
    const fish = screen.getByRole("button", { name: "Fish" });

    act(() => {
      cat.click();
      fish.click();
    });

    expect(answer).toHaveBeenCalledTimes(1);
  });

  it("ends when the server says it has finished, and only then", async () => {
    answer.mockResolvedValueOnce(Q2).mockResolvedValueOnce(FINISHED);
    renderModule();

    fireEvent.click(await screen.findByRole("button", { name: "Fish" }));
    fireEvent.click(await screen.findByRole("button", { name: "Fern" }));
    expect(onDone).not.toHaveBeenCalled();

    await waitFor(() => expect(onDone).toHaveBeenCalledWith("sat"));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("asks again what the item is when an answer does not land", async () => {
    // A stale item (409 `probe_item_stale`) or a dropped network: the server
    // says which item it is on, and the child answers that.
    answer.mockRejectedValueOnce(
      new ApiError(409, "x", { detail: { code: "probe_item_stale" } }),
    );
    renderModule();

    fireEvent.click(await screen.findByRole("button", { name: "Cat" }));

    await waitFor(() => expect(next).toHaveBeenCalledWith("sub-maths"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Cat" })).toHaveAttribute(
        "aria-pressed",
        "false",
      ),
    );
    // Once: the re-ask. The first item came with the plan.
    expect(next).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe("nothing a child reads says how they did (rules 2, 3 and 9)", () => {
  it("shows no right or wrong, no count and no placement at any step", async () => {
    answer.mockResolvedValueOnce(Q2).mockResolvedValueOnce(FINISHED);
    renderModule();
    const text = () => document.body.textContent ?? "";
    const verdict = /correct|wrong|right|score|well done|great|percent|%/i;

    await screen.findByText("Which animal lives in water?");
    // `asked: 3` and `maxQuestions: 8` came with it: no "3 of 8", no "3", no "8".
    expect(text()).not.toMatch(/\d/);
    expect(text()).not.toMatch(verdict);

    fireEvent.click(screen.getByRole("button", { name: "Fish" }));
    await screen.findByText("Which of these is a plant?");
    expect(text()).not.toMatch(/\d/);
    expect(text()).not.toMatch(verdict);

    fireEvent.click(screen.getByRole("button", { name: "Rock" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    // The finish carried `asked: 6`.
    expect(text()).not.toMatch(/\d/);
    expect(text()).not.toMatch(verdict);
  });

  it("marks the quest map's fourth stop: three done, the fourth active", async () => {
    renderModule();
    await screen.findByText("Which animal lives in water?");

    const map = screen.getByRole("progressbar");
    expect(map).toHaveAttribute("aria-valuemax", "4");
    expect(map).toHaveAttribute("aria-valuenow", "3");
  });
});

describe("its markers on the profiling stream", () => {
  it("marks the start and the end with exactly the catalogue's key", async () => {
    answer.mockResolvedValue(FINISHED);
    renderModule();

    fireEvent.click(await screen.findByRole("button", { name: "Bird" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("sat"));

    expect(track.mock.calls).toEqual([
      ["baseline_module_start", { moduleId: "domain_probe" }],
      ["baseline_module_complete", { moduleId: "domain_probe" }],
    ]);
    for (const [type, payload] of track.mock.calls) {
      const declared = catalogue.find((e) => e.eventType === type)?.payload;
      expect(Object.keys(payload).sort()).toEqual([...(declared ?? [])].sort());
    }
  });

  it("marks the start when the first question shows, not at the stretch", async () => {
    renderModule({ stretchFirst: true });

    fireEvent.click(screen.getByRole("button", { name: "take a breath" }));
    await screen.findByText("Which animal lives in water?");

    expect(track.mock.calls).toEqual([
      ["baseline_module_start", { moduleId: "domain_probe" }],
    ]);
  });
});

describe("which subject (JSS and SS choose first, 09d)", () => {
  it("asks a JSS child to choose when more than one subject has an item, and shows the one it read", async () => {
    renderModule({ band: "jss", openings: BOTH });

    expect(
      screen.getByText("Which subject would you like to start with?"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "English" }));

    expect(await screen.findByText("Which word names a colour?")).toBeInTheDocument();
    expect(next).not.toHaveBeenCalled();
  });

  it("asks an SS child too", () => {
    renderModule({ band: "ss", openings: BOTH });

    expect(
      screen.getByText("Which subject would you like to start with?"),
    ).toBeInTheDocument();
  });

  it("does not offer a choice of one", () => {
    renderModule({ band: "jss" });

    expect(screen.getByText("Which animal lives in water?")).toBeInTheDocument();
    expect(screen.queryByText(/which subject/i)).toBeNull();
  });

  it("runs the server's suggested subject for a Primary child, not the first listed", () => {
    // Teslim, 19 Oct: "use probeSubjectId as the server's suggested first
    // subject". Never this device's pick.
    renderModule({ band: "p46", openings: ENGLISH_SUGGESTED });

    expect(screen.getByText("Which word names a colour?")).toBeInTheDocument();
    expect(screen.queryByText("Which animal lives in water?")).toBeNull();
    expect(screen.queryByText(/which subject/i)).toBeNull();
  });

  it("runs the first the server lists when it suggests none this device can ask", () => {
    renderModule({ band: "p13", openings: BOTH });

    expect(screen.getByText("Which animal lives in water?")).toBeInTheDocument();
  });

  it("leaves a JSS child's grid in the server's order, suggestion or not", () => {
    // Whether the suggestion is listed first or preselected is design's call
    // (09d draws neither); until then the grid is as it was.
    renderModule({ band: "jss", openings: ENGLISH_SUGGESTED });

    const names = screen
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(names).toEqual(["Mathematics", "English"]);
  });

  it("asks a Primary child no choice, which the frame does not draw", () => {
    renderModule({ band: "p13", openings: BOTH });

    expect(screen.getByText("Which animal lives in water?")).toBeInTheDocument();
    expect(screen.queryByText(/which subject/i)).toBeNull();
  });

  it("offers only the subjects that answered with an item", async () => {
    // Art has none by readiness; Mathematics says so when asked. A child who
    // chose either would have been chosen into a dead end.
    myDashboard.mockResolvedValue({
      student: { id: "student-1", ageBand: "junior_secondary" },
      assignments: [],
      recentProgress: [],
    });
    readiness.mockResolvedValue(ready([MATHS, ART, ENGLISH]));
    next.mockImplementation(async (id: string) =>
      id === "sub-eng" ? QE : EMPTY,
    );
    renderStep();

    // One left, so no grid of one: straight to its item, as read.
    expect(await screen.findByText("Which word names a colour?")).toBeInTheDocument();
    expect(screen.queryByText(/which subject/i)).toBeNull();
    expect(next.mock.calls).toEqual([["sub-maths"], ["sub-eng"]]);
  });

  it("runs the subject the server suggests, read from readiness", async () => {
    readiness.mockResolvedValue({
      ...ready([MATHS, ENGLISH]),
      probeSubjectId: "sub-eng",
      probePolicy: "one_available_subject",
    });
    next.mockImplementation(async (id: string) => (id === "sub-eng" ? QE : Q1));
    renderStep();

    expect(await screen.findByText("Which word names a colour?")).toBeInTheDocument();
    expect(screen.queryByText("Which animal lives in water?")).toBeNull();
  });

  it("takes the band from the roster for the child signed in", async () => {
    myDashboard.mockResolvedValue({
      student: { id: "student-1", ageBand: "junior_secondary" },
      assignments: [],
      recentProgress: [],
    });
    readiness.mockResolvedValue(ready([MATHS, ENGLISH]));
    next.mockImplementation(async (id: string) => (id === "sub-eng" ? QE : Q1));
    renderStep();

    expect(
      await screen.findByText("Which subject would you like to start with?"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mathematics" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "English" })).toBeInTheDocument();
  });
});

describe("whether it runs is found out first (Olayinka, 19 Oct)", () => {
  it("reads the first item before the stretch, and shows that item after it", async () => {
    renderStep({ stretchFirst: true });

    const stretch = await screen.findByRole("button", { name: "take a breath" });
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith("sub-maths");
    fireEvent.click(stretch);

    expect(await screen.findByText("Which animal lives in water?")).toBeInTheDocument();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("draws no quest map while it finds out", async () => {
    const reading = deferred<Record<string, unknown>>();
    const first = deferred<typeof Q1>();
    readiness.mockReturnValue(reading.promise);
    next.mockReturnValue(first.promise);
    renderStep();

    await waitFor(() => expect(readiness).toHaveBeenCalled());
    expect(screen.queryByRole("progressbar")).toBeNull();
    await act(async () => reading.resolve(ready([MATHS])));
    expect(next).toHaveBeenCalled();
    expect(screen.queryByRole("progressbar")).toBeNull();

    await act(async () => first.resolve(Q1));
    expect(await screen.findByText("Which animal lives in water?")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "4");
  });

  it("starts from what the caller already read, reading nothing itself", async () => {
    renderStep({ openings: [{ subject: ENGLISH, item: QE, suggested: false }] });

    expect(await screen.findByText("Which word names a colour?")).toBeInTheDocument();
    expect(readiness).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});

describe("with nothing to ask, it is not presented (rule 5)", () => {
  it("presents nothing when no subject has items, and claims nothing done", async () => {
    readiness.mockResolvedValue(ready([ART, { ...MATHS, probeAvailable: false }]));
    renderStep({ stretchFirst: true });

    await waitFor(() => expect(onDone).toHaveBeenCalledWith("absent"));
    expect(next).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "take a breath" })).toBeNull();
  });

  it("goes on without the stretch when the subject answers with no items", async () => {
    next.mockResolvedValue(EMPTY);
    renderStep({ stretchFirst: true });

    await waitFor(() => expect(onDone).toHaveBeenCalledWith("absent"));
    expect(screen.queryByRole("button", { name: "take a breath" })).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(track).not.toHaveBeenCalled();
  });

  it("does not count a finish it was handed before asking anything", async () => {
    // `next` answering "finished" records nothing on the server (only an
    // answer that finishes the probe does), so neither does this.
    next.mockResolvedValue(FINISHED);
    renderStep({ stretchFirst: true });

    await waitFor(() => expect(onDone).toHaveBeenCalledWith("absent"));
    expect(screen.queryByRole("button", { name: "take a breath" })).toBeNull();
    expect(track).not.toHaveBeenCalled();
  });

  it("ends as absent, not sat, when the server holds the probe as unavailable", async () => {
    // Teslim's 19 Oct contract: no bank is `completed: true, status:
    // "unavailable"`. Nothing was asked, so the run around it maps three.
    readiness.mockResolvedValue({
      complete: false,
      modules: [
        { id: "grid_span", completed: true, status: "completed" },
        { id: "pattern_flanker", completed: true, status: "completed" },
        { id: "sentence_dot", completed: true, status: "completed" },
        { id: "domain_probe", completed: true, status: "unavailable" },
      ],
      subjects: [],
      nextModule: null,
      probeSubjectId: null,
      probePolicy: "one_available_subject",
    });
    renderStep({ stretchFirst: true });

    await waitFor(() => expect(onDone).toHaveBeenCalledWith("absent"));
    expect(onDone).not.toHaveBeenCalledWith("sat");
    expect(next).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "take a breath" })).toBeNull();
  });

  it("asks nothing of a child the server already has it for", async () => {
    readiness.mockResolvedValue(ready([MATHS], true));
    renderStep({ stretchFirst: true });

    await waitFor(() => expect(onDone).toHaveBeenCalledWith("sat"));
    expect(next).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "take a breath" })).toBeNull();
  });
});

describe("a read that fails is not 'nothing to ask'", () => {
  it("says it failed when readiness cannot be read", async () => {
    readiness.mockRejectedValue(new ApiError(0, "offline"));
    renderStep({ stretchFirst: true });

    await waitFor(() => expect(onDone).toHaveBeenCalledWith("failed"));
    expect(next).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "take a breath" })).toBeNull();
  });

  it("says it failed when the first item cannot be read", async () => {
    next.mockRejectedValue(new ApiError(0, "offline"));
    renderStep({ stretchFirst: true });

    await waitFor(() => expect(onDone).toHaveBeenCalledWith("failed"));
    expect(screen.queryByRole("button", { name: "take a breath" })).toBeNull();
    expect(track).not.toHaveBeenCalled();
  });
});

describe("the signed-out walkthrough", () => {
  it("calls nothing at all", async () => {
    clearSession();
    renderStep();

    await waitFor(() => expect(onDone).toHaveBeenCalledWith("absent"));
    expect(readiness).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(answer).not.toHaveBeenCalled();
  });
});

describe("the stretch before it", () => {
  it("comes first when a module has just ended, and the first item after", () => {
    renderModule({ stretchFirst: true });

    expect(screen.queryByText("Which animal lives in water?")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "take a breath" }));

    expect(screen.getByText("Which animal lives in water?")).toBeInTheDocument();
    expect(next).not.toHaveBeenCalled();
  });

  it("comes before the choice, for a child who chooses", () => {
    renderModule({ stretchFirst: true, band: "jss", openings: BOTH });

    expect(screen.queryByText(/which subject/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "take a breath" }));

    expect(
      screen.getByText("Which subject would you like to start with?"),
    ).toBeInTheDocument();
  });
});
