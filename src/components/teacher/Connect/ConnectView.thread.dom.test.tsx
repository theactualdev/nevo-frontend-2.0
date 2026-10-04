import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { threads, openThread, useStudentDirectory, useTeacherClasses, useHasSession } =
  vi.hoisted(() => ({
    threads: { value: [] as unknown[] },
    openThread: vi.fn(),
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
    openThread,
    send: vi.fn(),
    markThreadRead: vi.fn(),
  }),
}));

import { ConnectView } from "./ConnectView";

/**
 * A CONVERSATION WHOSE BODY HAS NOT ARRIVED, OR WILL NOT.
 *
 * Both rendered as an empty conversation under a live composer - inviting a
 * reply to messages the teacher could not see.
 */

const thread = (over: Record<string, unknown> = {}) => ({
  id: "t-1",
  studentName: "Amara Okafor",
  className: "Year 7 Blue",
  initials: "AO",
  preview: "Can you help me with question 3?",
  time: "2m",
  unread: false,
  unreadCount: 0,
  recipientId: "s-1",
  recipientType: "student",
  loaded: true,
  messages: [{ id: "m-1", body: "Can you help me with question 3?", mine: false, time: "2m" }],
  ...over,
});

beforeEach(() => {
  openThread.mockReset();
  useHasSession.mockReturnValue(true);
  useStudentDirectory.mockReturnValue({ students: [], loading: false, failed: false });
  useTeacherClasses.mockReturnValue({ options: [], live: true, loading: false, sample: false });
});

describe("a thread still being read", () => {
  it("holds the space rather than showing an empty conversation", () => {
    threads.value = [thread({ loaded: false, messages: undefined })];
    render(<ConnectView />);

    expect(screen.getByLabelText("Loading this conversation")).toBeInTheDocument();
  });
});

describe("a thread whose body could not be read", () => {
  beforeEach(() => {
    threads.value = [thread({ loaded: false, loadFailed: true, messages: undefined })];
  });

  it("says so", () => {
    render(<ConnectView />);

    expect(screen.getByText(/couldn.t load this conversation just now/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Loading this conversation")).not.toBeInTheDocument();
  });

  it("asks for it again from Try again", () => {
    render(<ConnectView />);
    openThread.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(openThread).toHaveBeenCalledWith("t-1");
  });
});

describe("a thread that has arrived", () => {
  it("shows its messages and nothing about loading", () => {
    threads.value = [thread()];
    render(<ConnectView />);

    expect(screen.queryByLabelText("Loading this conversation")).not.toBeInTheDocument();
    expect(screen.queryByText(/couldn.t load this conversation/)).not.toBeInTheDocument();
  });
});
