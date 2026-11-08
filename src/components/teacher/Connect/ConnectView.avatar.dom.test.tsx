import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

const { threads, useStudentDirectory, useTeacherClasses, useHasSession } = vi.hoisted(() => ({
  threads: { value: [] as unknown[] },
  useStudentDirectory: vi.fn(),
  useTeacherClasses: vi.fn(),
  useHasSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/hooks/useStudentDirectory", () => ({ useStudentDirectory }));
vi.mock("@/hooks/useTeacherClasses", () => ({ useTeacherClasses }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession }));
vi.mock("@/hooks/useConnectThreads", () => ({
  useConnectThreads: () => ({
    threads: threads.value,
    live: true,
    sample: false,
    loading: false,
    openThread: vi.fn(),
    send: vi.fn(),
    markThreadRead: vi.fn(),
  }),
}));

import { ConnectView } from "./ConnectView";
import { ComposeModal } from "./ComposeModal";
import { avatarLookOf } from "@/lib/profile/avatarLook";

/**
 * SCRUM-317 on Connect and compose: a child is shown by the avatar they chose,
 * with their name beside it - never their initials. A thread read from the
 * server names its child only by id, so the look is found on the teacher's own
 * class rosters; a child not found there gets no look at all.
 */

const STAR = avatarLookOf("star", "near_black");
const DIRECTORY = [
  { studentId: "s-1", name: "Amara Okafor", className: "Year 7 Blue", classId: "c-1", look: STAR },
];

const thread = (over: Record<string, unknown> = {}) => ({
  id: "t-1",
  studentName: "Amara Okafor",
  className: "Year 7 Blue",
  look: null,
  preview: "Can you help me with question 3?",
  time: "2m",
  unread: false,
  unreadCount: 0,
  recipientId: "s-1",
  recipientType: "student",
  loaded: true,
  messages: [],
  ...over,
});

const looksIn = (el: HTMLElement) =>
  [...el.querySelectorAll("[data-avatar-look]")].map((n) => n.getAttribute("data-avatar-look"));

beforeEach(() => {
  useHasSession.mockReturnValue(true);
  useStudentDirectory.mockReturnValue({ students: DIRECTORY, loading: false, failed: false });
  useTeacherClasses.mockReturnValue({ options: [], live: true, loading: false, sample: false });
});

describe("Connect's threads", () => {
  it("draw the child's own look, found by who the thread is with, and no initials", () => {
    threads.value = [thread()];
    const { container } = render(<ConnectView />);

    expect(looksIn(container)).toContain("star-near_black");
    expect(screen.queryByText("AO")).not.toBeInTheDocument();
  });

  it("draw no look for a child who isn't on the teacher's rosters", () => {
    threads.value = [thread({ recipientId: "s-elsewhere" })];
    const { container } = render(<ConnectView />);

    expect(looksIn(container)).toEqual([]);
    expect(screen.getAllByText("Amara Okafor").length).toBeGreaterThan(0);
  });
});

describe("compose's picker", () => {
  it("draws each child's own look beside their name", () => {
    const { container } = render(<ComposeModal onClose={vi.fn()} onSend={vi.fn()} />);

    const row = screen.getByRole("button", { name: /Amara Okafor/ });
    expect(looksIn(row)).toEqual(["star-near_black"]);
    expect(looksIn(container)).not.toContain(null);
    expect(within(row).queryByText("AO")).not.toBeInTheDocument();
  });

  it("keeps the child's look once picked", () => {
    const { container } = render(<ComposeModal onClose={vi.fn()} onSend={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Amara Okafor/ }));

    expect(looksIn(container)).toContain("star-near_black");
  });
});
