import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { hydrated, useHasSession, useCurrentUser, notifications } = vi.hoisted(() => ({
  hydrated: { value: false },
  useHasSession: vi.fn(),
  useCurrentUser: vi.fn(),
  notifications: { unread: 2 },
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/teacher/dashboard" }));
vi.mock("@/hooks/useHydrated", () => ({ useHydrated: () => hydrated.value }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession }));
vi.mock("@/hooks/useCurrentUser", () => ({ useCurrentUser }));
vi.mock("@/hooks/useTeacherNotifications", () => ({
  useTeacherNotifications: () => ({
    notes: [],
    unreadCount: notifications.unread,
    failed: false,
    markAllRead: vi.fn(),
    markRead: vi.fn(),
    archive: vi.fn(),
    undoArchive: vi.fn(),
    lastArchived: null,
  }),
}));

import { TeacherSidebar } from "./TeacherSidebar";
import { MOCK_TEACHER } from "./teacherNav";
import { sampleRegions } from "@/lib/sampleData";

/**
 * THE RAIL BEFORE THE CLIENT CAN ANSWER.
 *
 * `useHasSession`'s server snapshot is false, so the server markup and the
 * first client frame of a genuinely signed-in teacher drew the fixture
 * persona and lit the unread dot off the fixture notifications. The admin
 * rail fixed the same thing on 16 Sep. Until hydration the rail claims
 * nothing; after it, a signed-out walkthrough's persona is marked.
 */

const dot = () => document.querySelector('[class*="bg-nevo-violet"][class*="rounded-full"][class*="size-2"]');

beforeEach(() => {
  hydrated.value = false;
  notifications.unread = 2;
  useHasSession.mockReturnValue(false);
  useCurrentUser.mockReturnValue(null);
});

describe("before hydration", () => {
  it("names nobody - not the fixture teacher", () => {
    render(<TeacherSidebar />);

    expect(screen.queryByText(MOCK_TEACHER.name)).not.toBeInTheDocument();
    expect(screen.queryByText(MOCK_TEACHER.initials)).not.toBeInTheDocument();
  });

  it("lights no unread dot off the fixture notifications", () => {
    render(<TeacherSidebar />);

    expect(screen.queryByText(/unread/i)).not.toBeInTheDocument();
    expect(dot()).toBeNull();
  });

  it("marks nothing, because it is showing nothing invented", () => {
    render(<TeacherSidebar />);

    expect(sampleRegions()).toEqual([]);
  });
});

describe("after hydration, signed out", () => {
  it("shows the walkthrough's persona, marked", () => {
    hydrated.value = true;
    render(<TeacherSidebar />);

    expect(screen.getByText(MOCK_TEACHER.initials)).toBeInTheDocument();
    expect(sampleRegions()).toEqual(["teacher:sidebar-identity"]);
  });
});

describe("after hydration, signed in", () => {
  it("shows the teacher and marks nothing", () => {
    hydrated.value = true;
    useHasSession.mockReturnValue(true);
    useCurrentUser.mockReturnValue({ name: "Ola Bello", initials: "OB", role: "teacher", subjects: [] });
    render(<TeacherSidebar />);

    expect(screen.getByText("OB")).toBeInTheDocument();
    expect(screen.queryByText(MOCK_TEACHER.initials)).not.toBeInTheDocument();
    expect(sampleRegions()).toEqual([]);
  });

  it("lights the dot for real unread notes - so the check above can fail", () => {
    hydrated.value = true;
    useHasSession.mockReturnValue(true);
    useCurrentUser.mockReturnValue({ name: "Ola Bello", initials: "OB", role: "teacher", subjects: [] });
    render(<TeacherSidebar />);

    expect(dot()).not.toBeNull();
  });
});

/**
 * AT DESKTOP WIDTH, where the name is drawn at all. The rail collapses below
 * 1280px and jsdom answers every media query "no", so without this nothing
 * above could see a fixture NAME - only the disc.
 */
describe("at full width", () => {
  beforeEach(() => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) =>
        ({
          matches: true,
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        }) as MediaQueryList,
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("names nobody before hydration", () => {
    render(<TeacherSidebar />);

    expect(screen.queryByText(MOCK_TEACHER.name)).not.toBeInTheDocument();
  });

  it("names the walkthrough teacher once it knows nobody is signed in", () => {
    hydrated.value = true;
    render(<TeacherSidebar />);

    expect(screen.getByText(MOCK_TEACHER.name)).toBeInTheDocument();
  });
});
