import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { useTeacherClasses } = vi.hoisted(() => ({
  useTeacherClasses: vi.fn(),
}));

vi.mock("@/hooks/useTeacherClasses", () => ({ useTeacherClasses }));

const { HomeClasses } = await import("./HomeClasses");

/**
 * Home's class trio, and the clearest example in the console of the failure
 * mode this codebase cares most about: FAILURE MUST NEVER RENDER AS ABSENCE -
 * and, worse here, must never render as SOMEONE ELSE'S DATA.
 *
 * The defect this pins down already shipped. `useTeacherClasses` returns
 * fixtures when `data === null`, which covers "not back yet" AND "never
 * coming", and this component read neither flag - so for the whole in-flight
 * window, which the backend's own 1.0-5.6s latency makes seconds long on
 * every single load, a signed-in teacher was shown JSS 2A, JSS 2B and SSS 1
 * Sciences with invented headcounts. Classes that were not theirs, presented
 * as theirs.
 *
 * The hook is mocked rather than the network. `useLiveQuery` is tested
 * directly elsewhere; what matters HERE is that the component reads the flags
 * the hook publishes, which is exactly what it failed to do.
 */

const state = (over: Partial<ReturnType<typeof useTeacherClasses>> = {}) => ({
  classes: [],
  liveClasses: [],
  options: [],
  live: false,
  sample: false,
  loading: false,
  failed: false,
  ...over,
});

beforeEach(() => {
  useTeacherClasses.mockReset();
});

describe("HomeClasses - while the read is in flight", () => {
  it("holds the space with skeletons rather than anyone's classes", () => {
    useTeacherClasses.mockReturnValue(state({ loading: true }));
    const { container } = render(<HomeClasses />);

    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(3);
    // The specific regression: fixture class names must not appear.
    expect(screen.queryByText("JSS 2A")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("prefers the skeleton even when fixture classes are in hand", () => {
    // `loading` must win over having something renderable. Otherwise the
    // fixtures fill the window again and the fix is undone.
    useTeacherClasses.mockReturnValue(
      state({
        loading: true,
        classes: [
          {
            id: "c1",
            name: "JSS 2A",
            subjects: "Maths",
            summary: "3 need a look",
            summaryTone: "glance",
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ] as any,
      }),
    );
    render(<HomeClasses />);
    expect(screen.queryByText("JSS 2A")).not.toBeInTheDocument();
  });
});

describe("HomeClasses - when the read failed", () => {
  it("says so, and shows no classes at all", () => {
    useTeacherClasses.mockReturnValue(state({ sample: true }));
    render(<HomeClasses />);

    expect(
      screen.getByRole("heading", { name: "We couldn’t load your classes just now" }),
    ).toBeInTheDocument();
    // Not "you have no classes", and emphatically not somebody else's.
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("offers a way to try again (SCRUM-200)", () => {
    useTeacherClasses.mockReturnValue(state({ sample: true }));
    render(<HomeClasses />);

    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("reassures rather than alarming", () => {
    // A teacher whose classes vanish needs to know they still exist.
    useTeacherClasses.mockReturnValue(state({ sample: true }));
    render(<HomeClasses />);
    expect(
      screen.getByText(/haven’t gone anywhere/i),
    ).toBeInTheDocument();
  });
});

describe("HomeClasses - with the teacher's real assignments", () => {
  const assignment = {
    assignmentId: "a1",
    classId: "c9",
    className: "Year 7 Maths",
    classCode: "MAP4KZ",
  };

  it("renders each assignment, linked to that class", () => {
    useTeacherClasses.mockReturnValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      state({ live: true, liveClasses: [assignment] as any }),
    );
    render(<HomeClasses />);

    expect(screen.getByText("Year 7 Maths")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/teacher/classes/c9",
    );
  });

  // Design's reference (30 Sep): "There is no class code and no QR code
  // anywhere." The server still sends one; nothing prints it.
  it("never shows a class code, even when the server sends one", () => {
    useTeacherClasses.mockReturnValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      state({ live: true, liveClasses: [assignment] as any }),
    );
    render(<HomeClasses />);

    expect(screen.queryByText(/MAP4KZ|Class code/)).not.toBeInTheDocument();
    expect(screen.getByText("Assigned to you")).toBeInTheDocument();
  });

  it("says the class is assigned rather than inventing a code", () => {
    useTeacherClasses.mockReturnValue(
      state({
        live: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        liveClasses: [{ ...assignment, classCode: null }] as any,
      }),
    );
    render(<HomeClasses />);
    expect(screen.getByText("Assigned to you")).toBeInTheDocument();
  });

  it("renders an assignment with no fixture behind it as a quiet card", () => {
    // Per the component's own rule: never dropped, never dressed up.
    useTeacherClasses.mockReturnValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      state({ live: true, liveClasses: [assignment] as any }),
    );
    render(<HomeClasses />);
    expect(screen.getByText("Synced from your school")).toBeInTheDocument();
  });

  it("shows nothing rather than fixtures when a teacher genuinely has no classes", () => {
    // Live, succeeded, empty. A real state, and distinct from both loading
    // and failure - it must not be papered over with sample classes.
    useTeacherClasses.mockReturnValue(state({ live: true }));
    render(<HomeClasses />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText("JSS 2A")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/couldn’t reach your school/i),
    ).not.toBeInTheDocument();
  });
});
