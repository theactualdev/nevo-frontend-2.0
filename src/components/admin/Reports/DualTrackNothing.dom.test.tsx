import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DualTrackBars, type DualTrackRow } from "./charts";

/**
 * D20's cohort analytics, concept by concept: a figure the server didn't send
 * is NOTHING TO DRAW. A null track was clamped to "0%" with an empty bar, and
 * a missing one printed "NaN%" - both an untrue state (the hub, 25 Nov, from
 * the mastery inventory). No bar and no figure instead; the table's dash.
 * The model behind the figures is on hold; this only stops inventing them.
 */

const ROWS: DualTrackRow[] = [
  { key: "c1", label: "Fractions", concept: 0.62, reading: null, meta: "24 learners" },
  { key: "c2", label: "Ratios", concept: undefined, reading: 0.4 },
  { key: "c3", label: "Algebra", concept: Number.NaN, reading: null },
];

const bars = (label: string) =>
  (screen.getByText(label).parentElement?.nextElementSibling as HTMLElement).children;

describe("a concept with a track the server didn't send", () => {
  it("draws no bar and no figure for it - never 0% or NaN%", () => {
    const { container } = render(<DualTrackBars rows={ROWS} />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/NaN|\b0%/);
    expect(text).toMatch(/62%/);
    expect(text).toMatch(/40%/);
    // Fractions has its understanding bar only; Ratios its reading bar only.
    expect(bars("Fractions")).toHaveLength(1);
    expect(bars("Ratios")).toHaveLength(1);
    // Algebra has neither: its name, and nothing drawn beneath it.
    expect(bars("Algebra")).toHaveLength(0);
  });

  it("shows the table's dash for it, never a figure", () => {
    const { container } = render(<DualTrackBars rows={ROWS} />);
    fireEvent.click(screen.getByRole("button", { name: "Show table" }));
    const cells = (label: string) =>
      [...(screen.getByText(label).closest("tr") as HTMLElement).querySelectorAll("td")].map((td) => td.textContent);
    expect(cells("Fractions")).toEqual(["Fractions", "24 learners", "62%", "—"]);
    expect(cells("Ratios")).toEqual(["Ratios", "—", "—", "40%"]);
    expect(cells("Algebra")).toEqual(["Algebra", "—", "—", "—"]);
    expect(container.textContent ?? "").not.toMatch(/NaN|\b0%/);
  });
});
