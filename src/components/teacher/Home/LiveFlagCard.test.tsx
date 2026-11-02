import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LiveFlagCard } from "./LiveFlagCard";
import type { TeacherFlag } from "@/hooks/useTeacherFlags";

// `vi.mock` is hoisted above ordinary consts, so the spy has to be hoisted
// with it or the factory closes over an uninitialised binding.
const { acknowledgeFlag, markFlagSeen } = vi.hoisted(() => ({
  acknowledgeFlag: vi.fn(async () => ({})),
  markFlagSeen: vi.fn(async () => ({})),
}));

vi.mock("@/lib/api/intelligence", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/api/intelligence")>();
  return {
    ...actual,
    intelligenceApi: { ...actual.intelligenceApi, acknowledgeFlag, markFlagSeen },
  };
});

/**
 * The live "Worth your attention" card.
 *
 * THE TAP IS NOT AN ACKNOWLEDGEMENT (Lydia, 13 Oct). A class teacher's tap
 * means "I have read this"; learning support's acknowledgement means "we have
 * seen this and are on it", and only a holder makes it. The tap opens the
 * profile and sends nothing, so that it sends nothing is the thing worth
 * pinning.
 *
 * Time is frozen. `noticedWhen` reads the clock, and a test that did not fix
 * it would pass all afternoon and fail at midnight.
 */

const FIXED_NOW = new Date("2026-09-06T12:00:00Z");
const agoMinutes = (m: number) =>
  new Date(FIXED_NOW.getTime() - m * 60_000).toISOString();

const flag = (over: Partial<TeacherFlag> = {}): TeacherFlag => ({
  id: "flag-1",
  studentId: "student-9",
  name: "Amara Kalu",
  context: "Year 7 Maths",
  note: "Three lessons in a row have taken twice as long as usual.",
  generatedAt: agoMinutes(30),
  isSudden: false,
  ...over,
});

beforeEach(() => {
  acknowledgeFlag.mockClear();
  markFlagSeen.mockClear();
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("LiveFlagCard", () => {
  it("names the child, their class, and what Nevo noticed", () => {
    render(<LiveFlagCard flag={flag()} />);
    expect(screen.getByText("Amara Kalu")).toBeInTheDocument();
    expect(screen.getByText(/Year 7 Maths/)).toBeInTheDocument();
    expect(
      screen.getByText(
        "Three lessons in a row have taken twice as long as usual.",
      ),
    ).toBeInTheDocument();
  });

  it("opens the profile and does not acknowledge the flag", () => {
    // Learning support's acknowledgement is its own act. A teacher's tap
    // recording it would put "learning support saw this" on a flag nobody
    // from learning support has seen.
    render(<LiveFlagCard flag={flag()} />);
    fireEvent.click(screen.getByRole("link", { name: /Open Amara Kalu/ }));

    expect(acknowledgeFlag).not.toHaveBeenCalled();
    // It is the teacher's own read instead (SCRUM-252).
    expect(markFlagSeen).toHaveBeenCalledWith("flag-1");
    expect(
      screen.getByRole("link", { name: /Open Amara Kalu/ }),
    ).toHaveAttribute("href", "/teacher/students/student-9");
  });

  it("says something true when the directory could not name the child", () => {
    // `name` is null when the student directory did not resolve. "One of your
    // students" is honest; rendering an empty heading would read as a bug, and
    // inventing a name would be worse.
    render(<LiveFlagCard flag={flag({ name: null })} />);
    expect(screen.getByText("One of your students")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Open this student’s profile/ }),
    ).toBeInTheDocument();
  });

  it("omits the class rather than leaving a stray separator", () => {
    // The line joins [context, "noticed ..."] - a null context must not leave
    // a leading " · " hanging in front of the timestamp.
    render(<LiveFlagCard flag={flag({ context: null })} />);
    const when = screen.getByText(/noticed/).textContent ?? "";
    expect(when.startsWith("noticed")).toBe(true);
    expect(when).not.toContain("·");
  });

  it("keeps 'Send them a message' a separate action from opening the profile", () => {
    // The card is one big stretched link, so this second action has to sit
    // above it - otherwise a teacher aiming for the message opens the profile.
    render(<LiveFlagCard flag={flag()} />);
    expect(
      screen.getByRole("link", { name: /Send them a message/ }),
    ).toBeInTheDocument();
  });

  it("names the child in the link", () => {
    /*
     * THIS TEST ASSERTED THE DEFECT until 18 Sep: it pinned the href as a
     * bare "/teacher/connect", which is what made the action open the thread
     * list with no compose at all. Connect derives whether to open compose
     * from this query, so without it the button did nothing a teacher could
     * see - and the test made that look deliberate.
     */
    render(<LiveFlagCard flag={flag()} />);
    expect(
      screen.getByRole("link", { name: /Send them a message/ }),
    ).toHaveAttribute("href", "/teacher/connect?student=student-9");
  });

  it("marks a sudden change apart from a standing pattern", () => {
    const { container: sudden } = render(
      <LiveFlagCard flag={flag({ isSudden: true })} />,
    );
    expect(sudden.querySelectorAll("svg").length).toBeGreaterThan(0);

    const { container: pattern } = render(
      <LiveFlagCard flag={flag({ isSudden: false })} />,
    );
    expect(pattern.querySelectorAll("svg")).toHaveLength(0);
  });
});

describe("LiveFlagCard - when it was noticed", () => {
  // Cleans first: a test that checks two ages in one `it` would otherwise
  // leave both cards mounted and the query would find two matches.
  const noticed = (minutesAgo: number) => {
    cleanup();
    render(<LiveFlagCard flag={flag({ generatedAt: agoMinutes(minutesAgo) })} />);
    return screen.getByText(/noticed/).textContent ?? "";
  };

  it("reads as just now inside the hour", () => {
    expect(noticed(30)).toContain("just now");
  });

  it("counts hours, singular and plural", () => {
    expect(noticed(60)).toContain("1 hour ago");
    expect(noticed(60 * 5)).toContain("5 hours ago");
  });

  it("says yesterday rather than 24 hours", () => {
    expect(noticed(60 * 30)).toContain("yesterday");
  });

  it("counts days up to a week", () => {
    expect(noticed(60 * 24 * 3)).toContain("3 days ago");
  });

  it("falls back to a date once a week has passed", () => {
    // Beyond a week "N days ago" stops being useful to a teacher.
    expect(noticed(60 * 24 * 20)).toMatch(/August/);
  });
});

/**
 * SCRUM-252: the tap is this teacher's read. It clears the card from their own
 * Home (`POST …/seen`), and from nobody else's.
 */
describe("LiveFlagCard - the teacher's own read", () => {
  it("records the read when they open a message from it", () => {
    render(<LiveFlagCard flag={flag()} />);
    fireEvent.click(screen.getByRole("link", { name: /Send them a message/ }));

    expect(markFlagSeen).toHaveBeenCalledWith("flag-1");
    expect(acknowledgeFlag).not.toHaveBeenCalled();
  });

  it("holds nothing up when the read does not land", () => {
    markFlagSeen.mockRejectedValueOnce(new Error("offline"));
    render(<LiveFlagCard flag={flag()} />);

    expect(() =>
      fireEvent.click(screen.getByRole("link", { name: /Open Amara Kalu/ })),
    ).not.toThrow();
  });
});
