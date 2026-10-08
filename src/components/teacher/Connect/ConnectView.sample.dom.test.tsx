import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

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

/**
 * T236. A sample conversation has nobody to send to, and neither does a
 * compose row with no student id. Both used to be one quiet no-op away from
 * a "Message sent".
 */
describe("writing to someone who is not there", () => {
  it("offers no composer on a sample conversation, and says why", () => {
    threadsState({ live: false, sample: true });
    render(<ConnectView />);

    expect(screen.getByText(/This is a sample conversation/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Write a message…")).not.toBeInTheDocument();
  });

  it("will not send from a compose row with no student behind it", async () => {
    const send = vi.fn();
    threadsState({ send });
    useStudentDirectory.mockReturnValue({
      students: [{ name: "Ada Obi", className: "JSS 2A", initials: "AO" }],
      loading: false,
      failed: false,
    });
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    render(<ConnectView />);
    fireEvent.click(screen.getAllByRole("button", { name: /new message/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: /Ada Obi/ }));
    fireEvent.change(screen.getAllByPlaceholderText("Write your message…").at(-1)!, {
      target: { value: "Hello" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText(/couldn.t send that just now/)).toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
  });
});
