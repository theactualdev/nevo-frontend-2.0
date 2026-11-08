import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const h = vi.hoisted(() => ({
  classes: vi.fn(),
  flags: vi.fn(),
  home: vi.fn(),
}));
vi.mock("@/hooks/useTeacherClasses", () => ({ useTeacherClasses: h.classes }));
vi.mock("@/hooks/useTeacherFlags", () => ({ useTeacherFlags: h.flags }));
vi.mock("@/hooks/useTeacherHome", () => ({ useTeacherHome: h.home }));
vi.mock("@/hooks/useCurrentUser", () => ({ useCurrentUser: () => ({ name: "Ms. Adeyemi" }) }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => true }));

import { TeacherHome } from "./TeacherHome";

/**
 * OPENED IS NOT CLOSED (4 Nov sweep; Lydia, 4 Nov: "the product asserting a
 * state that is not true … is worse than any missing feature"). A card the
 * teacher has opened leaves their Home, but the flag is still open - so Home
 * may not then say everyone is moving along.
 */

const flag = (id: string, seenByMe: boolean, acknowledged = false) => ({
  id,
  studentId: `s-${id}`,
  name: "Amara Okafor",
  context: "JSS 2A",
  note: "Taking longer on written segments.",
  generatedAt: "2026-11-01T08:00:00Z",
  isSudden: false,
  seenByMe,
  acknowledged,
});

const flagsRead = (flags: ReturnType<typeof flag>[]) => ({
  flags,
  live: true,
  failed: false,
  loading: false,
  complete: true,
});

beforeEach(() => {
  h.classes.mockReturnValue({
    classes: [],
    liveClasses: [{ classId: "c-1", className: "JSS 2A", classCode: null }],
    options: [],
    live: true,
    loading: false,
    sample: false,
  });
  h.home.mockReturnValue({ pulse: [], activity: [], live: true, failed: false, loading: false });
});

describe("Home, with flags the teacher has opened", () => {
  it("says they've opened everything, not that nothing needs them", () => {
    h.flags.mockReturnValue(flagsRead([flag("1", true), flag("2", true)]));
    render(<TeacherHome />);

    expect(
      screen.getByRole("heading", { name: "You’ve opened everything waiting for you" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Nothing needs you right now")).toBeNull();
    expect(screen.queryByText(/moving along at their own pace/)).toBeNull();
  });

  it("drops 'everything else is running smoothly' while opened flags are still open", () => {
    h.flags.mockReturnValue(flagsRead([flag("1", false), flag("2", true)]));
    render(<TeacherHome />);

    expect(screen.getByText("1 thing is worth your eye before first period.")).toBeInTheDocument();
    expect(screen.queryByText(/running smoothly/)).toBeNull();
    expect(screen.queryByText(/Everything else is steady/)).toBeNull();
  });

  it("keeps the calm card, as drawn, when nothing is open at all", () => {
    h.flags.mockReturnValue(flagsRead([]));
    render(<TeacherHome />);

    expect(screen.getByRole("heading", { name: "Nothing needs you right now" })).toBeInTheDocument();
  });

  it("keeps the frame's whole line when every open flag is still unopened", () => {
    h.flags.mockReturnValue(flagsRead([flag("1", false)]));
    render(<TeacherHome />);

    expect(
      screen.getByText(
        "1 thing is worth your eye before first period. Everything else is running smoothly.",
      ),
    ).toBeInTheDocument();
  });
});

/**
 * The flags read now CARRIES a flag learning support has seen, because the
 * roster keeps its marker (Lydia, copy pass, 7 Nov). Home still leaves it out,
 * exactly as it did when the read dropped it.
 */
describe("Home, with a flag learning support has seen", () => {
  it("leaves it out of the cards and the count", () => {
    h.flags.mockReturnValue(flagsRead([flag("1", false), flag("2", false, true)]));
    render(<TeacherHome />);

    expect(
      screen.getByText(
        "1 thing is worth your eye before first period. Everything else is running smoothly.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps the calm card when it's the only one", () => {
    h.flags.mockReturnValue(flagsRead([flag("1", false, true)]));
    render(<TeacherHome />);

    expect(screen.getByRole("heading", { name: "Nothing needs you right now" })).toBeInTheDocument();
    expect(screen.queryByText(/opened everything/)).toBeNull();
  });
});
