import { chooseOption, optionNames } from "@/test/nevoSelect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";
import type { CohortTransformation } from "@/lib/api/analytics";

const h = vi.hoisted(() => ({ classes: vi.fn(), figures: vi.fn() }));
vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return { ...actual, classesApi: { ...actual.classesApi, list: () => h.classes() } };
});
vi.mock("@/lib/api/analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/analytics")>();
  return {
    ...actual,
    analyticsApi: { ...actual.analyticsApi, getYearGroupTransformation: (g: string) => h.figures(g) },
  };
});

import { YearGroupFigures } from "./YearGroupFigures";

/**
 * D20's metric row by year group (backlog 47; Lydia L26; Teslim T17): the
 * honest names, the server's figures and comparison, and "Too few to report"
 * where a figure is withheld - never a blank or a zero.
 */

const ready = (over: Partial<CohortTransformation> = {}): CohortTransformation => ({
  scope: "year_group",
  scopeId: null,
  yearGroup: "jss2",
  selfRegulation: { value: 81, previous: 76, trend: "up", learnerCount: 62 },
  calibration: { reason: "Not measurable", needed: "A self-assessment" },
  flexibility: null,
  efficiency: { value: 13, previous: 15, trend: "up", learnerCount: 62 },
  learnerCount: 62,
  reportingFloor: 5,
  suppressed: false,
  message: null,
  withheldLabel: null,
  ...over,
});

beforeEach(() => {
  h.classes.mockReset().mockResolvedValue([
    { id: "c1", name: "JSS 2A", yearGroup: "jss2" },
    { id: "c2", name: "JSS 2B", yearGroup: "jss2" },
    { id: "c3", name: "JSS 1A", yearGroup: "jss1" },
    { id: "c4", name: "Club", yearGroup: null },
  ]);
  h.figures.mockReset().mockResolvedValue(ready());
});

describe("the year-group row", () => {
  it("offers each year group on the school's classes, once, in order", async () => {
    render(<YearGroupFigures />);
    const menu = await screen.findByRole("combobox", { name: "Year group" });

    expect(optionNames(menu)).toEqual(["JSS 1", "JSS 2"]);
    await waitFor(() => expect(h.figures).toHaveBeenCalledWith("jss1"));
  });

  it("shows the server's figures under the honest names, with its comparison", async () => {
    render(<YearGroupFigures />);

    expect(await screen.findByText("Lessons seen through")).toBeInTheDocument();
    expect(screen.getByText("Time to finish a lesson")).toBeInTheDocument();
    expect(screen.getByText("Better than the four weeks before (76%)")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Self-Regulation|Index|\+3/);
  });

  it("reads another year group when one is chosen", async () => {
    render(<YearGroupFigures />);
    const menu = await screen.findByRole("combobox", { name: "Year group" });
    await waitFor(() => expect(h.figures).toHaveBeenCalledWith("jss1"));

    await chooseOption(menu, "JSS 2");
    await waitFor(() => expect(h.figures).toHaveBeenLastCalledWith("jss2"));
  });

  it("says Too few to report where a figure is withheld, never a blank or a zero", async () => {
    h.figures.mockResolvedValue(
      ready({
        suppressed: true,
        selfRegulation: null,
        efficiency: null,
        learnerCount: 3,
        withheldLabel: "Too few to report",
        message: "There are fewer than 5 learners here, so Nevo does not show one.",
      }),
    );
    render(<YearGroupFigures />);

    const withheld = await screen.findAllByText("Too few to report");
    expect(withheld).toHaveLength(3);
    expect(screen.getByText("There are fewer than 5 learners here, so Nevo does not show one.")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\b0%|\b0 min/);
  });

  it("is not there when no class carries a year group", async () => {
    h.classes.mockResolvedValue([{ id: "c4", name: "Club", yearGroup: null }]);
    const { container } = render(<YearGroupFigures />);

    await waitFor(() => expect(h.classes).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(h.figures).not.toHaveBeenCalled();
  });

  it("says a failed read of the figures, and reads again", async () => {
    h.figures.mockRejectedValueOnce(new ApiError(500, "boom", {}));
    render(<YearGroupFigures />);

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Lessons seen through")).toBeInTheDocument();
  });

  it("says nothing to an admin the server refuses", async () => {
    h.figures.mockRejectedValue(new ApiError(403, "no", {}));
    const { container } = render(<YearGroupFigures />);

    await waitFor(() => expect(h.figures).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
