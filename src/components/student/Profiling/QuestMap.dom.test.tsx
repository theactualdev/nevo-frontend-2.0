import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QuestMap, QuestSegments } from "./QuestMap";
import { ProfilingShell } from "./ProfilingShell";

/**
 * The quest map was four segments whatever the run held. Design, 9 Oct: "The
 * quest map shows the number of modules that child will actually do ... A
 * child who will do three sees three segments."
 */

const circles = () =>
  screen.getByRole("progressbar").lastElementChild!.children;

describe("QuestMap — one segment per module the run presents", () => {
  it("draws three when the run has three", () => {
    render(<QuestMap segments={3} filled={0} active={0} />);

    expect(circles()).toHaveLength(3);
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuemax",
      "3",
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-label",
      "Part 1 of 3",
    );
  });

  it("draws four only when the run has four", () => {
    render(<QuestMap segments={4} filled={1} active={1} />);

    expect(circles()).toHaveLength(4);
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-label",
      "Part 2 of 4",
    );
  });

  it("fills no more segments than the run has", () => {
    render(<QuestMap segments={3} filled={4} active={-1} />);

    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "3",
    );
  });
});

describe("ProfilingShell — the map takes the run's count", () => {
  it("draws the run's segments, from the run", () => {
    render(
      <QuestSegments.Provider value={3}>
        <ProfilingShell filled={1} active={1}>
          <p>screen</p>
        </ProfilingShell>
      </QuestSegments.Provider>,
    );

    expect(circles()).toHaveLength(3);
  });

  it("draws no map outside a run, rather than a count of its own", () => {
    render(
      <ProfilingShell filled={1} active={1}>
        <p>screen</p>
      </ProfilingShell>,
    );

    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});
