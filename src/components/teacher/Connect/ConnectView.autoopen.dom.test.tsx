import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { markThreadRead, openThread, unread } = vi.hoisted(() => ({
  markThreadRead: vi.fn(),
  openThread: vi.fn(),
  unread: { value: true },
}));

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("") }));
vi.mock("@/hooks/useStudentDirectory", () => ({
  useStudentDirectory: () => ({ students: [], loading: false, failed: false }),
}));
vi.mock("@/hooks/useTeacherClasses", () => ({
  useTeacherClasses: () => ({ options: [], live: true, loading: false, sample: false }),
}));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => true }));
vi.mock("@/components/shared/SystemMessages", () => ({
  useSystemMessages: () => ({ show: vi.fn(), resolve: vi.fn(), dismiss: vi.fn() }),
}));
vi.mock("@/hooks/useConnectThreads", () => ({
  useConnectThreads: () => ({
    threads: [
      {
        id: "t-1",
        studentName: "Amara Okafor",
        className: "Year 7 Blue",
        initials: "AO",
        preview: "Can you help me with question 3?",
        time: "2m",
        unread: unread.value,
        unreadCount: unread.value ? 1 : 0,
        recipientId: "s-1",
        recipientType: "student",
        loaded: true,
        messages: [],
      },
      {
        id: "t-2",
        studentName: "Tunde Bello",
        className: "Year 7 Blue",
        initials: "TB",
        preview: "Thanks",
        time: "1h",
        unread: true,
        unreadCount: 1,
        recipientId: "s-2",
        recipientType: "student",
        loaded: false,
        messages: [],
      },
    ],
    live: true,
    sample: false,
    loading: false,
    openThread,
    send: vi.fn(),
    markThreadRead,
  }),
}));

import { ConnectView } from "./ConnectView";

/**
 * T167. With nothing chosen, Connect opens the first thread by itself - and it
 * was neither marked as the open one in the list nor marked read, so its badge
 * and the bell stayed lit over a conversation on screen.
 */

beforeEach(() => {
  markThreadRead.mockReset();
  openThread.mockReset();
  unread.value = true;
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

const listed = (name: string) =>
  screen.getAllByRole("button").find((b) => b.textContent?.includes(name) && b.hasAttribute("aria-current"));

describe("the thread Connect opens by itself", () => {
  it("is marked as the open one in the list", () => {
    render(<ConnectView />);

    expect(listed("Amara Okafor")).toHaveAttribute("aria-current", "true");
    expect(listed("Tunde Bello")).toHaveAttribute("aria-current", "false");
  });

  it("is marked read, because it is on screen", () => {
    render(<ConnectView />);

    expect(markThreadRead).toHaveBeenCalledWith("t-1");
  });

  it("marks nothing else read", () => {
    render(<ConnectView />);

    expect(markThreadRead).not.toHaveBeenCalledWith("t-2");
  });

  it("asks nothing of a thread already read", () => {
    unread.value = false;
    render(<ConnectView />);

    expect(markThreadRead).not.toHaveBeenCalled();
  });
});
