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
import catalogue from "@/lib/api/signals.catalogue.json";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * Module 4, the domain probe (09d), as Lydia ruled 17 Oct (SCRUM-244):
 * "Module 4 IS the domain probe ... All four run before any lesson."
 *
 * The server serves one item at a time and marks what it serves; this screen
 * shows the item, sends the pick, and shows whatever comes back. It must never
 * say right or wrong, never count, and never show what the probe concluded.
 * And with nothing to ask it is not presented - it does not invent a
 * completion the server never recorded.
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
const FINISHED = { finished: true, subjectId: "sub-maths", entryPoint: 0.62, asked: 6 };
const EMPTY = { finished: true, noItems: true, subjectId: "sub-maths" };

const signIn = () =>
  setSession({
    token: "tok-child",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId: "student-1",
    role: "student",
  });

const onDone = vi.fn();
const track = vi.fn();

function renderModule(
  props: Partial<Parameters<typeof DomainProbeModule>[0]> = {},
) {
  return render(
    <QuestSegments.Provider value={4}>
      <DomainProbeModule
        band="p46"
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
});

afterEach(() => {
  cleanup();
  clearSession();
  vi.clearAllMocks();
});

describe("one item at a time, from the server", () => {
  it("asks the server's item for the first subject that has items", async () => {
    readiness.mockResolvedValue(ready([ART, MATHS, ENGLISH]));
    renderModule();

    expect(await screen.findByText("Which animal lives in water?")).toBeInTheDocument();
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith("sub-maths");
    for (const label of ["Fish", "Cat", "Bird"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
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

    await waitFor(() => expect(next).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("button", { name: "Cat" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
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
    // The finish carried `entryPoint: 0.62` and `asked: 6`.
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
});

describe("which subject (JSS and SS choose first, 09d)", () => {
  it("asks a JSS child to choose when more than one subject has items", async () => {
    readiness.mockResolvedValue(ready([MATHS, ART, ENGLISH]));
    renderModule({ band: "jss" });

    expect(
      await screen.findByText("Which subject would you like to start with?"),
    ).toBeInTheDocument();
    // Only the subjects with something to ask.
    expect(screen.getByRole("button", { name: "Mathematics" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "English" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Art" })).toBeNull();
    expect(next).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "English" }));

    expect(next).toHaveBeenCalledWith("sub-eng");
    expect(await screen.findByText("Which animal lives in water?")).toBeInTheDocument();
  });

  it("asks an SS child too", async () => {
    readiness.mockResolvedValue(ready([MATHS, ENGLISH]));
    renderModule({ band: "ss" });

    expect(
      await screen.findByText("Which subject would you like to start with?"),
    ).toBeInTheDocument();
  });

  it("does not offer a choice of one", async () => {
    readiness.mockResolvedValue(ready([MATHS, ART]));
    renderModule({ band: "jss" });

    expect(await screen.findByText("Which animal lives in water?")).toBeInTheDocument();
    expect(screen.queryByText(/which subject/i)).toBeNull();
    expect(next).toHaveBeenCalledWith("sub-maths");
  });

  it("asks a Primary child no choice, which the frame does not draw", async () => {
    readiness.mockResolvedValue(ready([MATHS, ENGLISH]));
    renderModule({ band: "p13" });

    expect(await screen.findByText("Which animal lives in water?")).toBeInTheDocument();
    expect(screen.queryByText(/which subject/i)).toBeNull();
    expect(next).toHaveBeenCalledWith("sub-maths");
  });

  it("takes the band from the roster for the child signed in", async () => {
    myDashboard.mockResolvedValue({
      student: { id: "student-1", ageBand: "junior_secondary" },
      assignments: [],
      recentProgress: [],
    });
    readiness.mockResolvedValue(ready([MATHS, ENGLISH]));
    render(
      <QuestSegments.Provider value={4}>
        <DomainProbeStep stretchFirst={false} onDone={onDone} />
      </QuestSegments.Provider>,
    );

    expect(
      await screen.findByText("Which subject would you like to start with?"),
    ).toBeInTheDocument();
  });
});

describe("with nothing to ask, it is not presented (rule 5)", () => {
  it("presents nothing when no subject has items, and claims nothing done", async () => {
    readiness.mockResolvedValue(ready([ART, { ...MATHS, probeAvailable: false }]));
    renderModule();

    await waitFor(() => expect(onDone).toHaveBeenCalledWith("absent"));
    expect(next).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });

  it("presents nothing when the subject answers with no items", async () => {
    next.mockResolvedValue(EMPTY);
    renderModule();

    await waitFor(() => expect(onDone).toHaveBeenCalledWith("absent"));
    expect(track).not.toHaveBeenCalled();
  });

  it("does not count a finish it was handed before asking anything", async () => {
    // `next` answering "finished" records nothing on the server (only an
    // answer that finishes the probe does), so neither does this.
    next.mockResolvedValue(FINISHED);
    renderModule();

    await waitFor(() => expect(onDone).toHaveBeenCalledWith("absent"));
    expect(track).not.toHaveBeenCalled();
  });

  it("presents nothing when readiness cannot be read", async () => {
    readiness.mockRejectedValue(new ApiError(0, "offline"));
    renderModule();

    await waitFor(() => expect(onDone).toHaveBeenCalledWith("absent"));
    expect(next).not.toHaveBeenCalled();
  });

  it("asks nothing of a child the server already has it for", async () => {
    readiness.mockResolvedValue(ready([MATHS], true));
    renderModule();

    await waitFor(() => expect(onDone).toHaveBeenCalledWith("sat"));
    expect(next).not.toHaveBeenCalled();
  });
});

describe("the signed-out walkthrough", () => {
  it("calls nothing at all", async () => {
    clearSession();
    renderModule();

    await waitFor(() => expect(onDone).toHaveBeenCalledWith("absent"));
    expect(readiness).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(answer).not.toHaveBeenCalled();
  });
});

describe("the stretch before it", () => {
  it("comes first when a module has just ended, and the first item after", async () => {
    renderModule({ stretchFirst: true });

    const stretch = await screen.findByRole("button", { name: "take a breath" });
    expect(next).not.toHaveBeenCalled();
    fireEvent.click(stretch);

    expect(next).toHaveBeenCalledWith("sub-maths");
    expect(await screen.findByText("Which animal lives in water?")).toBeInTheDocument();
  });

  it("is not shown when there is nothing to ask", async () => {
    readiness.mockResolvedValue(ready([ART]));
    renderModule({ stretchFirst: true });

    await waitFor(() => expect(onDone).toHaveBeenCalledWith("absent"));
    expect(screen.queryByRole("button", { name: "take a breath" })).toBeNull();
  });
});
