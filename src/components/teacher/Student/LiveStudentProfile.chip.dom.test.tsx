import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { useStudentFlags, useStudentSessions, useStudentSession } = vi.hoisted(() => ({
  useStudentFlags: vi.fn(),
  useStudentSessions: vi.fn(),
  useStudentSession: vi.fn(),
}));
vi.mock("@/hooks/useStudentFlags", () => ({ useStudentFlags }));
vi.mock("@/hooks/useStudentSessions", () => ({
  useStudentSessions,
  useStudentSession,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { LiveStudentProfile } from "./LiveStudentProfile";
import type { StudentProfileState } from "@/hooks/useStudentProfile";

/**
 * C08's ONE CHIP (design, 12 Oct). A profile shows a single chip beside the
 * name, in strict precedence - Sudden change, then Flagged, then Worth a
 * glance - and never Can't sign in. The live profile had no chip at all; the
 * sample had a violet fill.
 */

const STATE: StudentProfileState = {
  profile: {
    student: { id: "s-42", firstName: "Amara", lastName: "Okafor", ageBand: "11 to 12" },
    profile: null,
    openFlagCount: 0,
  },
  concepts: [],
  helpSeeking: "Asked Nevo for help a few times this week.",
  recommendations: [],
  adaptations: [],
  sessions: [],
  accommodations: null,
  observed: true,
  loading: false,
  missing: false,
  failed: false,
};

const open = (isSudden: boolean, id = `f-${isSudden}`) => ({
  id,
  note: "Sessions have been getting shorter.",
  generatedAt: "2026-10-10T09:00:00Z",
  isSudden,
});

const nameRow = () =>
  screen.getByRole("heading", { level: 1, name: "Amara Okafor" }).parentElement!;

beforeEach(() => {
  useStudentSessions.mockReturnValue({ sessions: [], total: 0, loading: false, failed: false });
  useStudentSession.mockReturnValue({ detail: null, loading: false, failed: false });
});

describe("the profile chip", () => {
  it("is worth a glance, beside the name, when Nevo noticed something", () => {
    useStudentFlags.mockReturnValue({ noticed: [open(false)], failed: false, loading: false });
    render(<LiveStudentProfile studentId="s-42" state={STATE} />);

    const chip = screen.getByText("Worth a glance");
    expect(nameRow()).toContainElement(chip);
    expect(chip.className).toMatch(/border-nevo-violet/);
  });

  it("is the sudden change alone when there is one, whatever else is open", () => {
    useStudentFlags.mockReturnValue({
      noticed: [open(false, "a"), open(true, "b")],
      failed: false,
      loading: false,
    });
    render(<LiveStudentProfile studentId="s-42" state={STATE} />);

    expect(nameRow()).toContainElement(screen.getByText("Sudden change"));
    expect(screen.queryByText("Worth a glance")).not.toBeInTheDocument();
  });

  it("is absent when nothing is open, or the read failed", () => {
    useStudentFlags.mockReturnValue({ noticed: [], failed: true, loading: false });
    render(<LiveStudentProfile studentId="s-42" state={STATE} />);

    expect(screen.queryByText("Worth a glance")).not.toBeInTheDocument();
    expect(screen.queryByText("Sudden change")).not.toBeInTheDocument();
  });
});
