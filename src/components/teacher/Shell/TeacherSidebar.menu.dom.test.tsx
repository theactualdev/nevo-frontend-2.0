import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

const { signedIn, user } = vi.hoisted(() => ({
  signedIn: { value: true },
  user: { value: null as Record<string, unknown> | null },
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/teacher/dashboard" }));
vi.mock("@/hooks/useHydrated", () => ({ useHydrated: () => true }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => signedIn.value }));
vi.mock("@/hooks/useCurrentUser", () => ({ useCurrentUser: () => user.value }));
vi.mock("@/hooks/useTeacherNotifications", () => ({
  useTeacherNotifications: () => ({
    notes: [],
    unreadCount: 0,
    failed: false,
    loading: false,
    refresh: vi.fn(),
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
 * THE ACCOUNT MENU ON A TABLET (C11). It was absolute inside the rail, and
 * the rail is `overflow-hidden` - so at 1024px, where the rail is 64px, the
 * menu was cut to a strip of icons and every label was lost. It now sits
 * beside the rail at the frame's coordinates, headed by who this is.
 *
 * jsdom matches no media query, so the rail opens collapsed - the tablet
 * variant - and the chevron expands it.
 */

const menu = () => screen.getByRole("menu", { name: "Account menu" });
const open = () => fireEvent.click(screen.getByRole("button", { name: /Account menu|Adaeze/ }));

beforeEach(() => {
  signedIn.value = true;
  user.value = {
    name: "Adaeze Okafor",
    initials: "AO",
    role: "teacher",
    school: "Lekki Grammar School",
  };
});

describe("where it opens", () => {
  it("beside a collapsed rail, out of reach of the rail's clipping", () => {
    render(<TeacherSidebar />);
    open();

    expect(menu()).toHaveClass("fixed", "left-[84px]", "bottom-[76px]", "w-[240px]");
    expect(menu()).not.toHaveClass("absolute");
  });

  it("beside an expanded rail", () => {
    render(<TeacherSidebar />);
    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    open();

    expect(menu()).toHaveClass("fixed", "left-[196px]", "bottom-[88px]", "w-[248px]");
  });
});

describe("its header", () => {
  it("names the teacher and their school, and marks nothing", () => {
    render(<TeacherSidebar />);
    open();

    expect(within(menu()).getByText("Adaeze Okafor")).toBeInTheDocument();
    expect(within(menu()).getByText("Lekki Grammar School")).toBeInTheDocument();
    expect(sampleRegions()).toEqual([]);
  });

  it("says only what is known - a school without a name", () => {
    user.value = { name: null, initials: null, role: "teacher", school: "Lekki Grammar School" };
    render(<TeacherSidebar />);
    open();

    expect(within(menu()).getByText("Lekki Grammar School")).toBeInTheDocument();
    expect(within(menu()).queryByText(MOCK_TEACHER.name)).not.toBeInTheDocument();
  });

  it("is not drawn at all when nothing is known, rather than drawn empty", () => {
    user.value = null;
    render(<TeacherSidebar />);
    open();

    expect(menu().firstElementChild).not.toHaveClass("border-b");
    expect(within(menu()).getAllByRole("menuitem")).toHaveLength(5);
  });

  it("names the walkthrough's persona to a visitor, marked as a sample", () => {
    signedIn.value = false;
    user.value = null;
    render(<TeacherSidebar />);
    open();

    expect(within(menu()).getByText(MOCK_TEACHER.name)).toBeInTheDocument();
    expect(within(menu()).getByText(MOCK_TEACHER.school)).toBeInTheDocument();
    expect(sampleRegions()).toContain("teacher:menu-identity");
  });
});
