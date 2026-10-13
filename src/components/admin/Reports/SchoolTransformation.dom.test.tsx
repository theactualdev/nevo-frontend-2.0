import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { ApiError } from "@/lib/api/client";
import type { CohortTransformation } from "@/lib/api/analytics";
import { SchoolTransformationView } from "./SchoolTransformationView";

/**
 * D26, reduced with honest names - ruled by Lydia on 7 Oct: the names stay,
 * and nothing may state a quantity or claim the backend did not send.
 *
 * Backend computes a completion share, minutes per finished lesson and counts
 * of format changes - not the constructs D26's titles name. So the cards are
 * named for what they measure, Calibration (not measurable) is off the page,
 * nothing is computed, and below the reporting floor nothing is shown at all.
 */

const getSchool = vi.fn();
const getTransformation = vi.fn();
vi.mock("@/lib/api/school", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/school")>();
  return { ...actual, schoolApi: { ...actual.schoolApi, get: () => getSchool() } };
});
vi.mock("@/lib/api/analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/analytics")>();
  return {
    ...actual,
    analyticsApi: {
      ...actual.analyticsApi,
      getSchoolTransformation: (id: string) => getTransformation(id),
    },
  };
});

const METRICS: CohortTransformation = {
  scope: "school",
  scopeId: "sch1",
  selfRegulation: { value: 82.5, previous: 78, trend: "up", learnerCount: 240 },
  efficiency: { value: 12.4, previous: 14.1, trend: "up", learnerCount: 236 },
  flexibility: {
    dimensions: [
      { labels: ["Chose another format", "Took a suggestion", "Stayed as they were"], values: [41, 17, 9] },
    ],
    learnerCount: 240,
  },
  calibration: {
    available: false,
    reason: "Nevo records no confidence rating to set against accuracy.",
    needed: "A confidence prompt after each check.",
  },
  learnerCount: 240,
  reportingFloor: 5,
  suppressed: false,
  message: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  getSchool.mockResolvedValue({ id: "sch1", name: "Brightgate Academy" });
  getTransformation.mockResolvedValue(METRICS);
});

describe("the school's figures", () => {
  it("are named for what they measure, not for D26's constructs", async () => {
    const { container } = render(<SchoolTransformationView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Lessons seen through/));
    expect(getTransformation).toHaveBeenCalledWith("sch1");
    const text = visibleText(container);
    expect(text).toMatch(/Time to finish a lesson/);
    expect(text).toMatch(/Changing format/);
    for (const construct of [/Self-Regulation/i, /Efficiency/i, /Flexibility/i, /Calibration/i]) {
      expect(text).not.toMatch(construct);
    }
  });

  it("shows each number as served, with the server's better-or-behind and the earlier figure", async () => {
    const { container } = render(<SchoolTransformationView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/82\.5/));
    const text = visibleText(container);
    expect(text).toMatch(/Better than the four weeks before \(78%\)/);
    // Fewer minutes is "up" - said as better, never as "up from".
    expect(text).toMatch(/12\.4/);
    expect(text).toMatch(/Better than the four weeks before \(14\.1 min\)/);
    expect(text).not.toMatch(/\+\d|this month/);
    expect(text).toMatch(/Across 240 students/);
  });

  it("lists the format changes with the server's own labels", async () => {
    render(<SchoolTransformationView />);
    const list = await screen.findByRole("list", { name: "Changing format" });
    expect(visibleText(list)).toMatch(/Chose another format 41/);
    expect(visibleText(list)).toMatch(/Stayed as they were 9/);
  });

  it("leaves Calibration off the page - no number, no reason card", async () => {
    const { container } = render(<SchoolTransformationView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Lessons seen through/));
    expect(visibleText(container)).not.toMatch(/confidence/i);
  });

  it("leaves off any figure the server has none for", async () => {
    getTransformation.mockResolvedValue({ ...METRICS, efficiency: null });
    const { container } = render(<SchoolTransformationView />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Lessons seen through/));
    expect(visibleText(container)).not.toMatch(/Time to finish a lesson/);
  });
});

describe("when there is nothing to show", () => {
  it("shows the server's own sentence below the reporting floor, and no figures", async () => {
    getTransformation.mockResolvedValue({
      ...METRICS,
      selfRegulation: null,
      efficiency: null,
      flexibility: null,
      learnerCount: 3,
      suppressed: true,
      message: "There are fewer than 5 learners here, so an average would be about those children rather than about the group. Nevo does not show one.",
    });
    const { container } = render(<SchoolTransformationView />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/average would be about those children/),
    );
    expect(visibleText(container)).not.toMatch(/Lessons seen through|Across/);
  });

  it("says the picture is still gathering when the window is empty", async () => {
    getTransformation.mockResolvedValue({ ...METRICS, selfRegulation: null, efficiency: null, flexibility: null });
    const { container } = render(<SchoolTransformationView />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Still gathering your school.s picture/),
    );
  });

  it("offers a retry when a read fails, and says no access on a 403", async () => {
    getTransformation.mockRejectedValueOnce(new Error("down"));
    const first = render(<SchoolTransformationView />);
    await waitFor(() => expect(visibleText(first.container)).toMatch(/your school.s figures/));
    expect(screen.getByRole("button", { name: /Try again/ })).toBeInTheDocument();
    first.unmount();

    getTransformation.mockRejectedValueOnce(new ApiError(403, "forbidden"));
    const { container } = render(<SchoolTransformationView />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/don't have access to your school's figures/),
    );
  });
});

describe("inside Reports (Lydia, 7 Oct)", () => {
  it("is a view of Reports, marked current, beside cohort analytics", async () => {
    render(<SchoolTransformationView />);
    const views = await screen.findByRole("navigation", { name: "Reports" });
    expect(within(views).getByRole("link", { name: "School transformation" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(views).getByRole("link", { name: "Cohort analytics" })).toHaveAttribute(
      "href",
      "/admin/reports",
    );
  });
});
