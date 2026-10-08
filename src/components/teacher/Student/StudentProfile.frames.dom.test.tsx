import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

import { StudentProfile } from "./StudentProfile";
import { getStudentProfile } from "@/lib/mocks/teacherStudents";
import { OBSERVATION_COPY } from "@/lib/constants/observations";

/**
 * The signed-out sample profile, against C08: its four noticed cards, the
 * count chip on finished lessons, and no eyebrow the frame does not draw.
 */
describe("the sample profile's What Nevo has noticed", () => {
  const amara = getStudentProfile("amara-okafor");

  it("draws C08's four cards, the fourth included", () => {
    render(<StudentProfile student={amara!} />);

    for (const p of ["completed_lessons", "tried_another_format", "steadier_pace", "revisited_content"] as const) {
      expect(screen.getAllByText(OBSERVATION_COPY[p].body("Amara")).length).toBeGreaterThan(0);
    }
  });

  it("puts the count beside finished lessons, as its own chip", () => {
    render(<StudentProfile student={amara!} />);

    expect(screen.getByText("12 lessons")).toBeInTheDocument();
  });

  it("draws no eyebrow over the sentence", () => {
    render(<StudentProfile student={amara!} />);

    expect(screen.queryByText(OBSERVATION_COPY.steadier_pace.title)).not.toBeInTheDocument();
  });
});

/**
 * C08 tablet: "actions wrap" - into a row of their own under the name. The
 * header stayed a row below 1280px, so on a tablet the actions squeezed in
 * beside the name, carrying the `mt-4` that was meant to put them under it.
 */
describe("the header at tablet width", () => {
  const amara = getStudentProfile("amara-okafor");

  it("stacks the actions under the name, and sets them beside it from 1280px", () => {
    render(<StudentProfile student={amara!} />);
    const header = screen
      .getByRole("heading", { level: 1, name: amara!.name })
      .closest("[class*='xl:justify-between']")!;

    expect(header).toHaveClass("flex-col", "items-start", "xl:flex-row");
    expect(header).toContainElement(screen.getByRole("link", { name: "Recommend a lesson" }));
  });
});
