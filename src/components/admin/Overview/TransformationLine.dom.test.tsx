import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CohortTransformation } from "@/lib/api/analytics";
import { TransformationLine } from "./TransformationLine";

/**
 * D04's quiet line into School transformation (backlog 48), under the honest
 * names (Lydia, 7 Oct): one server figure, the server's own comparison, and
 * nothing the server did not send.
 */

const data = (over: Partial<CohortTransformation> = {}): CohortTransformation => ({
  scope: "school",
  scopeId: "sch-1",
  selfRegulation: { value: 78, previous: 75, trend: "up", learnerCount: 240 },
  calibration: { reason: "Not measurable", needed: "A self-assessment" },
  flexibility: null,
  efficiency: { value: 14, previous: 16, trend: "up", learnerCount: 240 },
  learnerCount: 240,
  reportingFloor: 5,
  suppressed: false,
  message: null,
  ...over,
});

const line = () => document.querySelector("[data-transformation-line]") as HTMLElement | null;

describe("the Overview's School transformation line", () => {
  it("names one figure honestly, with the server's comparison", () => {
    render(<TransformationLine read={{ kind: "ready", data: data() }} canOpen />);

    expect(line()).toHaveAttribute("href", "/admin/reports/transformation");
    expect(line()).toHaveTextContent(
      "School transformationLessons seen through 78%, better than the four weeks before (75%).",
    );
    // Never the construct D04 draws, and never a difference we worked out.
    expect(line()?.textContent).not.toMatch(/Self-Regulation|Index|this month|\+3|up 3/);
  });

  it("says the figure alone when there is nothing to compare it with", () => {
    render(
      <TransformationLine
        read={{
          kind: "ready",
          data: data({ selfRegulation: { value: 78, previous: null, trend: "unknown", learnerCount: 240 } }),
        }}
        canOpen
      />,
    );

    expect(line()).toHaveTextContent(/Lessons seen through 78%\.View/);
  });

  it("says behind when the server says behind", () => {
    render(
      <TransformationLine
        read={{
          kind: "ready",
          data: data({ selfRegulation: { value: 70, previous: 75, trend: "down", learnerCount: 240 } }),
        }}
        canOpen
      />,
    );

    expect(line()).toHaveTextContent("Lessons seen through 70%, behind the four weeks before (75%).");
  });

  it("gives the server's own reason below the reporting floor, never a zero", () => {
    render(
      <TransformationLine
        read={{
          kind: "ready",
          data: data({
            suppressed: true,
            selfRegulation: null,
            efficiency: null,
            message: "Fewer than 5 learners - figures are withheld.",
          }),
        }}
        canOpen
      />,
    );

    expect(line()).toHaveTextContent("Fewer than 5 learners - figures are withheld.");
    expect(line()?.textContent).not.toMatch(/\d+%/);
  });

  it("keeps the way in, and claims nothing, when the read failed", () => {
    render(<TransformationLine read={{ kind: "failed" }} canOpen />);

    expect(line()).toHaveAttribute("href", "/admin/reports/transformation");
    expect(line()?.textContent).not.toMatch(/Lessons seen through|%/);
  });

  it("is not there for an admin who cannot open Reports", () => {
    render(<TransformationLine read={{ kind: "ready", data: data() }} canOpen={false} />);
    expect(line()).toBeNull();
  });

  it("is not there when the server refused the figures, or before they are read", () => {
    const { rerender } = render(<TransformationLine read={{ kind: "denied" }} canOpen />);
    expect(line()).toBeNull();
    rerender(<TransformationLine read={{ kind: "loading" }} canOpen />);
    expect(line()).toBeNull();
  });

  it("uses D04's own words for the way in at each width", () => {
    render(<TransformationLine read={{ kind: "ready", data: data() }} canOpen />);

    expect(screen.getByText("View the metrics")).toHaveClass("hidden", "xl:inline");
    expect(screen.getByText("View")).toHaveClass("xl:hidden");
  });
});
