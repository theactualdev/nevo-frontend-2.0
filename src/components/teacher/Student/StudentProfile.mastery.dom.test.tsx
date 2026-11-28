import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

import { StudentProfile } from "./StudentProfile";
import { getStudentProfile } from "@/lib/mocks/teacherStudents";

/**
 * The signed-out sample profile switches with the live one (Hub, 28 Nov), so
 * the walkthrough never shows a model the product no longer draws: C08's own
 * sample rows on the By Level design, the live lead line, and no flag.
 */
describe("the sample profile's Concept mastery, by level", () => {
  const amara = getStudentProfile("amara-okafor");

  it("draws C08's sample rows in the frame's words - RWN/at, RRW/support, WNN/at, RWW/at", () => {
    const { container } = render(<StudentProfile student={amara!} />);
    const text = visibleText(container);

    expect(text).toMatch(
      /Solving linear equations\s*Knowing and understanding\s*Reached\s*Application\s*Working at it\s*Analysis and evaluation\s*Not arrived yet\s*Reading level\s*At level/,
    );
    expect(text).toMatch(
      /Simplifying expressions\s*Knowing and understanding\s*Reached\s*Application\s*Reached\s*Analysis and evaluation\s*Working at it\s*Reading level\s*Support needed/,
    );
    expect(text).toMatch(
      /Algebraic fractions\s*Knowing and understanding\s*Working at it\s*Application\s*Not arrived yet\s*Analysis and evaluation\s*Not arrived yet\s*Reading level\s*At level/,
    );
    expect(text).toMatch(
      /Comprehension: prose texts\s*Knowing and understanding\s*Reached\s*Application\s*Working at it\s*Analysis and evaluation\s*Working at it\s*Reading level\s*At level/,
    );
  });

  it("draws no bar and no percentage", () => {
    const { container } = render(<StudentProfile student={amara!} />);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(visibleText(container)).not.toMatch(/\d+%/);
  });

  it("carries the live lead line, never the frame's line about two tracks", () => {
    const { container } = render(<StudentProfile student={amara!} />);
    expect(visibleText(container)).toMatch(
      /How well each idea has landed, and how much the reading itself is shaping that\./,
    );
    expect(visibleText(container)).not.toMatch(/Two tracks|part company|reading load/);
  });
});
