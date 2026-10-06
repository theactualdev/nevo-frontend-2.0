import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { useClassInsights } = vi.hoisted(() => ({ useClassInsights: vi.fn() }));
vi.mock("@/hooks/useClassInsights", () => ({ useClassInsights }));

const { LiveClassInsights } = await import("./LiveClassInsights");

/**
 * C09 Insights for a real class.
 *
 * The distinction these tests exist to protect used to be two states and is
 * now four: the engine says a class is `gathering` or `settled`, a failed
 * read is neither, and a narrative that failed on its own is neither again.
 *
 * `empty` IS GONE, and it was the defect. It meant "every read landed and
 * there was nothing in them", computed here from three array lengths - so a
 * class having a genuinely good week was told Nevo was still gathering
 * insights about it. The engine now says which, and the contract's own enum
 * description is that bug written down.
 *
 * Collapsing them is not a cosmetic slip. "Still gathering insights for Year 7
 * Maths" shown over three failed requests is an AFFIRMATIVE, FALSE CLAIM about
 * real children - it tells a teacher Nevo has looked and found nothing worth
 * raising, when in fact Nevo never looked. A teacher who would have acted on a
 * flag does not, and nothing on screen suggests they should ask again.
 *
 * The hook is mocked because `useLiveQuery` is tested directly elsewhere. What
 * is under test here is whether the component tells these three states apart.
 */

const CLASS = { classId: "c9", className: "Year 7 Maths" };

const state = (over: Partial<ReturnType<typeof useClassInsights>> = {}) => ({
  misconceptions: [],
  concepts: [],
  flags: [],
  loading: false,
  failed: false,
  state: null,
  summary: null,
  lookingAhead: null,
  gathering: false,
  settledWeek: false,
  narrativeFailed: false,
  sectionFailed: { misconceptions: false, mastery: false, flags: false },
  ...over,
});

beforeEach(() => {
  useClassInsights.mockReset();
});

describe("LiveClassInsights - telling the three states apart", () => {
  it("holds the space while the reads are in flight", () => {
    useClassInsights.mockReturnValue(state({ loading: true }));
    const { container } = render(<LiveClassInsights {...CLASS} />);

    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(3);
    expect(screen.queryByText(/Still gathering/)).not.toBeInTheDocument();
    expect(screen.queryByText(/couldn’t load/i)).not.toBeInTheDocument();
  });

  it("says the read failed, and says it is not about the class", () => {
    useClassInsights.mockReturnValue(state({ failed: true }));
    render(<LiveClassInsights {...CLASS} />);

    expect(
      screen.getByText(/We couldn’t load insights just now/i),
    ).toBeInTheDocument();
    // The sentence names the class only to EXCLUDE it as the cause.
    expect(
      screen.getByText(/This isn't about Year 7 Maths/),
    ).toBeInTheDocument();
  });

  it("NEVER says it is still gathering when the reads failed", () => {
    // The regression that matters. This claim over a failure tells a teacher
    // Nevo looked and found nothing, when Nevo never looked at all.
    useClassInsights.mockReturnValue(state({ failed: true }));
    render(<LiveClassInsights {...CLASS} />);

    expect(screen.queryByText(/Still gathering/)).not.toBeInTheDocument();
  });

  it("says it is still gathering only when the ENGINE says so", () => {
    // This used to be keyed on three empty arrays. The engine owns the
    // threshold now, and the console renders what it is given.
    useClassInsights.mockReturnValue(state({ gathering: true }));
    render(<LiveClassInsights {...CLASS} />);

    expect(
      screen.getByText(/Still gathering insights for Year 7 Maths/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/couldn’t load/i)).not.toBeInTheDocument();
  });

  it("A SETTLED WEEK IS NOT A NEW CLASS, and no longer reads as one", () => {
    /*
     * THE DEFECT, in one test. A class with nothing flagged, no
     * misconception above the floor and no mastery rows yet is either a
     * class having a good week or a class Nevo has not seen. The console
     * could not tell, and told every one of them the same thing.
     */
    useClassInsights.mockReturnValue(
      state({
        settledWeek: true,
        summary: "A calm week. Everyone is moving through the material.",
      }),
    );
    render(<LiveClassInsights {...CLASS} />);

    expect(screen.queryByText(/Still gathering/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/A calm week. Everyone is moving through the material./),
    ).toBeInTheDocument();
    expect(screen.getByText(/A settled week/)).toBeInTheDocument();
  });

  it("shows the engine's written week, in its own words", () => {
    // The summary and the looking-ahead line were fixture-only on every
    // screen that draws them: the endpoint shipped on 15 Sep and nothing
    // called it until today.
    useClassInsights.mockReturnValue(
      state({
        summary: "Eight students slowed on the same step this week.",
        lookingAhead: "Common denominators are coming up on Thursday.",
      }),
    );
    render(<LiveClassInsights {...CLASS} />);

    expect(
      screen.getByText(/Eight students slowed on the same step/),
    ).toBeInTheDocument();
    expect(screen.getByText("Looking ahead")).toBeInTheDocument();
    expect(
      screen.getByText(/Common denominators are coming up/),
    ).toBeInTheDocument();
  });

  it("says the summary is missing rather than letting a blank screen speak", () => {
    // The narrative failed on its own and the three sections are empty. An
    // empty screen would read as a quiet class, which is the claim this
    // whole file exists to stop making.
    useClassInsights.mockReturnValue(state({ narrativeFailed: true }));
    render(<LiveClassInsights {...CLASS} />);

    expect(screen.getByText(/couldn’t load this week’s summary/i)).toBeInTheDocument();
    expect(screen.queryByText(/Still gathering/)).not.toBeInTheDocument();
  });

  it("says nothing about a missing summary when the sections have content", () => {
    useClassInsights.mockReturnValue(
      state({
        narrativeFailed: true,
        flags: [
          { id: "f1", name: "Amara", note: "Stopped halfway", isSudden: false },
        ],
      }),
    );
    render(<LiveClassInsights {...CLASS} />);

    expect(screen.queryByText(/couldn’t load this week’s summary/i)).not.toBeInTheDocument();
  });

  it("prefers the failure message when everything failed", () => {
    // `failed` is checked first by design: an empty result set produced BY a
    // failure is a failure, and claiming otherwise is the false claim again.
    useClassInsights.mockReturnValue(state({ failed: true, gathering: true }));
    render(<LiveClassInsights {...CLASS} />);

    expect(
      screen.getByText(/We couldn’t load insights just now/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Still gathering/)).not.toBeInTheDocument();
  });
});

describe("LiveClassInsights - with something to say", () => {
  it("draws the class mastery panel from real concepts", () => {
    useClassInsights.mockReturnValue(
      state({
        concepts: [
          {
            conceptId: "k1",
            name: "Equivalent fractions",
            understanding: 64,
            reading: 52,
            studentCount: 18,
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ] as any,
      }),
    );
    render(<LiveClassInsights {...CLASS} />);

    expect(screen.getByText("Equivalent fractions")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", {
        name: "Equivalent fractions - understanding",
      }),
    ).toHaveAttribute("aria-valuenow", "64");
  });

  it("does not claim a state it was not given", () => {
    // Something to show means neither banner is drawn - the sparse card is
    // for a class with nothing in ANY section, not for a partial one.
    useClassInsights.mockReturnValue(
      state({
        concepts: [
          {
            conceptId: "k1",
            name: "Equivalent fractions",
            understanding: 64,
            reading: 52,
            studentCount: 18,
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ] as any,
      }),
    );
    render(<LiveClassInsights {...CLASS} />);

    expect(screen.queryByText(/Still gathering/)).not.toBeInTheDocument();
    expect(screen.queryByText(/couldn’t load/i)).not.toBeInTheDocument();
  });
});

/**
 * A SECTION THAT FAILED ON ITS OWN. Only a failure of all three lists was
 * said; one failed flags or mastery read just dropped its section - and the
 * week could still be called settled, "Nothing here needs you", over a flags
 * read that never arrived.
 */
describe("one list that failed while the others landed", () => {
  const failedOnly = (section: "flags" | "mastery") =>
    state({
      summary: "A steady week.",
      settledWeek: true,
      sectionFailed: { misconceptions: false, mastery: section === "mastery", flags: section === "flags" },
    });

  it("keeps the flags section and says it could not be read", () => {
    useClassInsights.mockReturnValue(failedOnly("flags"));
    render(<LiveClassInsights {...CLASS} />);

    expect(screen.getByText("Worth a look")).toBeInTheDocument();
    expect(screen.getByText(/couldn.t load this just now. Nothing has changed for Year 7 Maths/)).toBeInTheDocument();
  });

  it("keeps the mastery section and says it could not be read", () => {
    useClassInsights.mockReturnValue(failedOnly("mastery"));
    render(<LiveClassInsights {...CLASS} />);

    expect(screen.getByText("How the class is doing")).toBeInTheDocument();
    expect(screen.getByText(/couldn.t load this just now/)).toBeInTheDocument();
  });

  it("does not call the week settled over a read that never arrived", () => {
    useClassInsights.mockReturnValue(failedOnly("flags"));
    render(<LiveClassInsights {...CLASS} />);

    expect(screen.queryByText(/Nothing here needs you/)).not.toBeInTheDocument();
  });

  it("still calls a settled week settled when everything landed", () => {
    useClassInsights.mockReturnValue(state({ summary: "A steady week.", settledWeek: true }));
    render(<LiveClassInsights {...CLASS} />);

    expect(screen.getByText(/Nothing here needs you/)).toBeInTheDocument();
    expect(screen.queryByText(/couldn.t load this just now/)).not.toBeInTheDocument();
  });
});

describe("a flag card in Worth a look", () => {
  it("opens the student it is about", () => {
    useClassInsights.mockReturnValue(
      state({
        flags: [{ id: "f-1", studentId: "s-7", name: "Ada Obi", note: "Slower on written work.", isSudden: false }],
      }),
    );
    render(<LiveClassInsights {...CLASS} />);

    expect(screen.getByRole("link", { name: /Ada Obi/ })).toHaveAttribute("href", "/teacher/students/s-7");
  });
});
