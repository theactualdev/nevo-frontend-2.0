import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { TeacherClasses } from "@/hooks/useTeacherClasses";

const { useTeacherClasses } = vi.hoisted(() => ({ useTeacherClasses: vi.fn() }));

vi.mock("@/hooks/useTeacherClasses", () => ({ useTeacherClasses }));
// The live half reads five intelligence endpoints; none of that is under test
// here, and letting it mount would drown the assertions in its own states.
vi.mock("./LiveClassInsights", () => ({
  LiveClassInsights: ({ className }: { className: string }) => (
    <div>{`LIVE INSIGHTS FOR ${className}`}</div>
  ),
}));
// A div rather than an `<img>`: the wrapper is not under test, and an img
// stub trips `@next/next/no-img-element` for no benefit.
vi.mock("@/components/shared/IllustrationWrapper", () => ({
  IllustrationWrapper: ({ alt }: { alt: string }) => (
    <div role="img" aria-label={alt} />
  ),
}));

import { InsightsView } from "./InsightsView";
import { useAskNevoClass } from "@/components/teacher/Shell/askNevoScope";
import { TEACHER_CLASSES } from "@/lib/mocks/teacherClasses";
import { visibleText } from "@/test/visibleText";

/**
 * Insights, and the fixture leak it shipped with.
 *
 * THE DEFECT. This screen decided on `live` alone:
 *
 *     const data = classId && !live ? getClassInsights(classId) : null;
 *
 * `live` is false for the whole in-flight window AND after a failure, so a
 * signed-in teacher got the fixture three - JSS 2A, JSS 2B, SSS 1 - in the
 * selector, and on tapping one, invented misconceptions, mastery bars and
 * recommendations presented as their week. On the screen whose entire purpose
 * is deciding what to do next.
 *
 * WHY NO TEST CAUGHT IT, AND WHY THE E2E COULD NOT. Every other fixture render
 * in this product carries `data-nevo-sample`, and the signed-in end-to-end spec
 * asserts there are none once a teacher is in. Insights carried no mark, so the
 * one assertion designed to catch exactly this could not see it. The mark is
 * therefore as load-bearing as the guard, and both are asserted below.
 *
 * It is the sibling of the `ClassesList` header bug fixed the same day and
 * missed here, because that hunt grepped `!live &&` and this one is a ternary.
 */

const state = (over: Partial<TeacherClasses> = {}): TeacherClasses => ({
  classes: TEACHER_CLASSES,
  liveClasses: [],
  options: TEACHER_CLASSES.map((c) => ({
    id: c.id,
    name: c.name,
    joinCode: c.joinCode,
  })),
  live: false,
  loading: false,
  sample: false,
  ...over,
});

const FIXTURE_CLASS = TEACHER_CLASSES[0].name;

beforeEach(() => {
  useTeacherClasses.mockReset();
});

describe("the class selector", () => {
  it("offers no classes at all while the read is in flight", () => {
    // The fixture three are not a placeholder - they are three other schools'
    // class names offered to a teacher as though they were hers.
    useTeacherClasses.mockReturnValue(state({ loading: true }));

    render(<InsightsView />);

    expect(screen.getByText("Insights")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: FIXTURE_CLASS })).not.toBeInTheDocument();
  });

  it("still offers the designed classes to a signed-out visitor", () => {
    // Signed out, `useLiveQuery` reports `loading: false` immediately, so the
    // walkthrough is untouched by the guard above.
    useTeacherClasses.mockReturnValue(state());

    render(<InsightsView />);

    expect(screen.getByRole("button", { name: FIXTURE_CLASS })).toBeInTheDocument();
  });

  it("offers the teacher's own classes once the read lands", () => {
    useTeacherClasses.mockReturnValue(
      state({
        classes: [],
        options: [{ id: "c-1", name: "E2E Probe Class", joinCode: "ABC123" }],
        live: true,
      }),
    );

    render(<InsightsView />);

    expect(screen.getByRole("button", { name: "E2E Probe Class" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: FIXTURE_CLASS })).not.toBeInTheDocument();
  });
});

describe("when the class read has failed", () => {
  it("says the insights are samples, not the teacher's week", () => {
    useTeacherClasses.mockReturnValue(state({ sample: true }));

    // `visibleText` rather than `getByText`: the notice carries `&rsquo;` and
    // `&ndash;`, which React splits into separate text nodes, so a plain
    // matcher misses a sentence that is plainly on screen.
    const { container } = render(<InsightsView />);

    expect(visibleText(container)).toMatch(
      /these are sample classes and sample insights/i,
    );
  });

  it("marks the invented insights so the signed-in e2e can see them", () => {
    // `SampleRegion` renders `display: contents`, so this changes nothing on
    // screen and everything for the one assertion that guards against it.
    useTeacherClasses.mockReturnValue(state({ sample: true }));

    const { container } = render(<InsightsView />);
    fireEvent.click(screen.getByRole("button", { name: FIXTURE_CLASS }));

    expect(container.querySelector("[data-nevo-sample]")).not.toBeNull();
  });
});

describe("a real class", () => {
  it("renders the live insights and none of the fixture prose", () => {
    useTeacherClasses.mockReturnValue(
      state({
        classes: [],
        options: [{ id: "c-1", name: "E2E Probe Class", joinCode: "ABC123" }],
        live: true,
      }),
    );

    const { container } = render(<InsightsView />);
    fireEvent.click(screen.getByRole("button", { name: "E2E Probe Class" }));

    expect(screen.getByText("LIVE INSIGHTS FOR E2E Probe Class")).toBeInTheDocument();
    expect(container.querySelector("[data-nevo-sample]")).toBeNull();
  });
});

/**
 * MARKED WHERE THE WRONG CHOICE IS MADE. The fixture three were marked only
 * after one was picked; the landing - where a teacher chooses - carried no
 * `data-nevo-sample` at all.
 */
describe("the class pills on the landing", () => {
  const regions = () =>
    Array.from(document.querySelectorAll("[data-nevo-sample]")).map((e) =>
      e.getAttribute("data-nevo-sample"),
    );

  it("are marked when they are the fixture three", () => {
    useTeacherClasses.mockReturnValue(state({ sample: true }));
    render(<InsightsView />);

    expect(screen.getByRole("button", { name: FIXTURE_CLASS })).toBeInTheDocument();
    expect(regions()).toEqual(["teacher:insights-classes"]);
  });

  it("carry no mark while the read is still in flight, when there are none to mark", () => {
    useTeacherClasses.mockReturnValue(state({ loading: true }));
    render(<InsightsView />);

    expect(screen.queryByRole("button", { name: FIXTURE_CLASS })).not.toBeInTheDocument();
    expect(regions()).toEqual([]);
  });

  it("carry no mark when they are the teacher's own", () => {
    useTeacherClasses.mockReturnValue(
      state({ live: true, options: [{ id: "c-1", name: "Year 7 Blue", joinCode: null }] as never }),
    );
    render(<InsightsView />);

    expect(screen.getByRole("button", { name: "Year 7 Blue" })).toBeInTheDocument();
    expect(regions()).toEqual([]);
  });
});

/**
 * "PICK ONE OF YOUR CLASSES ABOVE" with no classes above - while the list
 * loads, and for a teacher who has none.
 */
describe("the landing with no classes to pick", () => {
  it("claims nothing while the class list loads", () => {
    useTeacherClasses.mockReturnValue(state({ loading: true }));
    render(<InsightsView />);

    expect(screen.queryByText("Select a class to see insights")).not.toBeInTheDocument();
    expect(screen.queryByText(/Pick one of your classes/)).not.toBeInTheDocument();
  });

  it("says the classes list's own sentence to a teacher with none", () => {
    useTeacherClasses.mockReturnValue(state({ live: true, options: [], classes: [] }));
    render(<InsightsView />);

    expect(screen.getByText("Your classes will appear here once assigned")).toBeInTheDocument();
    expect(screen.queryByText("Select a class to see insights")).not.toBeInTheDocument();
  });

  it("still asks a teacher with classes to pick one", () => {
    useTeacherClasses.mockReturnValue(
      state({ live: true, options: [{ id: "c-1", name: "Year 7 Blue", joinCode: null }] as never }),
    );
    render(<InsightsView />);

    expect(screen.getByText("Select a class to see insights")).toBeInTheDocument();
  });
});

/** T182: the class picked here is the class Ask Nevo is asked about. */
describe("telling Ask Nevo which class this is", () => {
  function Probe() {
    return <span data-testid="scope">{useAskNevoClass() ?? "none"}</span>;
  }

  it("names the class a teacher picks, and forgets it when the page goes", () => {
    useTeacherClasses.mockReturnValue(
      state({ live: true, options: [{ id: "c-1", name: "Year 7 Blue", joinCode: null }] as never }),
    );
    const { unmount } = render(
      <>
        <InsightsView />
        <Probe />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Year 7 Blue" }));
    expect(screen.getByTestId("scope")).toHaveTextContent("c-1");

    unmount();
    render(<Probe />);
    expect(screen.getByTestId("scope")).toHaveTextContent("none");
  });
});
