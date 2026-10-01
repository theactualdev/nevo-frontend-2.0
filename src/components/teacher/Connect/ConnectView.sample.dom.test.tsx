import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { threads, useStudentDirectory, useTeacherClasses, useHasSession } =
  vi.hoisted(() => ({
    threads: { value: {} as Record<string, unknown> },
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
  useConnectThreads: () => threads.value,
}));

import { ConnectView } from "./ConnectView";
import { sampleRegions } from "@/lib/sampleData";

/**
 * Invented children and what they wrote, on a signed-in teacher's Connect
 * screen when the messages read failed - said in an italic line, and marked
 * nowhere, so the end-to-end check had nothing to count.
 */

const THREAD = {
  id: "t-1",
  studentName: "Amara Okafor",
  className: "JSS 2A",
  initials: "AO",
  preview: "Can you help me with question 3?",
  time: "2m",
  unread: false,
  unreadCount: 0,
  recipientId: null,
  messages: [],
};

const threadsState = (over: Record<string, unknown> = {}) => {
  threads.value = {
    threads: [THREAD],
    live: true,
    sample: false,
    loading: false,
    openThread: vi.fn(),
    send: vi.fn(),
    markThreadRead: vi.fn(),
    ...over,
  };
};

beforeEach(() => {
  useHasSession.mockReturnValue(true);
  useStudentDirectory.mockReturnValue({ students: [], loading: false, failed: false });
  useTeacherClasses.mockReturnValue({ options: [], live: true, loading: false, sample: false });
});

describe("the conversations", () => {
  it("are marked as samples when the messages read failed", () => {
    threadsState({ live: false, sample: true });
    render(<ConnectView />);

    expect(screen.getAllByText("Amara Okafor").length).toBeGreaterThan(0);
    expect(sampleRegions()).toEqual(["teacher:connect"]);
  });

  it("carry no mark when they are the teacher's own", () => {
    threadsState();
    render(<ConnectView />);

    expect(screen.getAllByText("Amara Okafor").length).toBeGreaterThan(0);
    expect(sampleRegions()).toEqual([]);
  });
});
