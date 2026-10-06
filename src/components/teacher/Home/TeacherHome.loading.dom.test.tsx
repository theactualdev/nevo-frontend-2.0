import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { useTeacherClasses, useTeacherFlags, useTeacherHome, useCurrentUser, useHasSession } =
  vi.hoisted(() => ({
    useTeacherClasses: vi.fn(),
    useTeacherFlags: vi.fn(),
    useTeacherHome: vi.fn(),
    useCurrentUser: vi.fn(),
    useHasSession: vi.fn(),
  }));

vi.mock("@/hooks/useTeacherClasses", () => ({ useTeacherClasses }));
vi.mock("@/hooks/useTeacherFlags", () => ({ useTeacherFlags }));
vi.mock("@/hooks/useTeacherHome", () => ({ useTeacherHome }));
vi.mock("@/hooks/useCurrentUser", () => ({ useCurrentUser }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession }));

import { TeacherHome } from "./TeacherHome";

/**
 * NOT KNOWING YET IS NOT KNOWING NOTHING.
 *
 * The flags take one to six seconds, and for all of it Home said "Nothing
 * needs you right now" - the calm card - over a morning that might have three
 * children in it. C03 draws a first-load state for exactly this window: a
 * heading bar and three card skeletons, no words.
 */

beforeEach(() => {
  useTeacherClasses.mockReturnValue({
    classes: [],
    liveClasses: [{ classId: "c-1", className: "Year 7 Blue", classCode: "AB12" }],
    options: [],
    live: true,
    loading: false,
    sample: false,
  });
  useTeacherHome.mockReturnValue({ pulse: [], activity: [], live: true, failed: false });
  useCurrentUser.mockReturnValue({ name: "Ola Bello" });
  useHasSession.mockReturnValue(true);
});

describe("while the flags are still on their way", () => {
  beforeEach(() => {
    useTeacherFlags.mockReturnValue({ flags: [], live: false, failed: false, loading: true });
  });

  it("does not say nothing needs the teacher", () => {
    render(<TeacherHome />);

    expect(screen.queryByText("Nothing needs you right now")).not.toBeInTheDocument();
  });

  it("draws the frame's first-load skeletons instead", () => {
    render(<TeacherHome />);

    expect(screen.getByLabelText("Loading what needs your attention")).toBeInTheDocument();
  });
});

describe("once the flags have answered", () => {
  it("is the calm card when there is genuinely nothing", () => {
    useTeacherFlags.mockReturnValue({ flags: [], live: true, failed: false, loading: false });
    render(<TeacherHome />);

    expect(screen.getByText("Nothing needs you right now")).toBeInTheDocument();
    expect(screen.queryByLabelText("Loading what needs your attention")).not.toBeInTheDocument();
  });
});

/**
 * THE COUNT IS SAID ONLY WHEN IT IS THE WHOLE COUNT. It was one page of 50,
 * acknowledged rows included, said as the total.
 */
describe("how many things are worth the teacher's eye", () => {
  const twoFlags = (complete: boolean) =>
    useTeacherFlags.mockReturnValue({
      flags: [
        { id: "f-1", studentId: "s-1", name: "Ada Obi", context: null, note: "Slower on written work.", generatedAt: "2026-10-05T08:00:00Z", isSudden: false },
        { id: "f-2", studentId: "s-2", name: "Tolu Ade", context: null, note: "Stopped partway.", generatedAt: "2026-10-05T08:00:00Z", isSudden: false },
      ],
      live: true,
      failed: false,
      loading: false,
      complete,
    });

  it("is said when every page was read", () => {
    twoFlags(true);
    render(<TeacherHome />);

    expect(screen.getByText(/2 things are worth your eye/)).toBeInTheDocument();
  });

  it("is not said when the pages ran out with more still coming", () => {
    twoFlags(false);
    render(<TeacherHome />);

    expect(screen.queryByText(/things are worth your eye/)).not.toBeInTheDocument();
  });
});
