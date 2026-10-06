import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { send, show, useStudentDirectory, useTeacherClasses, useHasSession } = vi.hoisted(() => ({
  send: vi.fn(),
  show: vi.fn(),
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
    threads: [
      {
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
      },
    ],
    live: true,
    sample: false,
    loading: false,
    openThread: vi.fn(),
    send,
    markThreadRead: vi.fn(),
  }),
}));
vi.mock("@/components/shared/SystemMessages", () => ({
  useSystemMessages: () => ({ show, resolve: vi.fn(), dismiss: vi.fn() }),
}));

import { ConnectView } from "./ConnectView";

/**
 * Sending a reply, and what the teacher is told.
 *
 * Frame 43 made C14's NevoToast the one shared bar. This screen's own toast
 * cleared a failure after three seconds and drew it with a tick, where SM-03
 * says a failure stays until it is dismissed. And the reply box was emptied
 * before the send, so "Try again" left nothing to try again with.
 */

const box = () => screen.getByPlaceholderText("Write a message…");
const type = (text: string) => fireEvent.change(box(), { target: { value: text } });
const press = () => fireEvent.click(screen.getByRole("button", { name: "Send" }));

beforeEach(() => {
  send.mockReset();
  show.mockReset();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  useHasSession.mockReturnValue(true);
  useStudentDirectory.mockReturnValue({ students: [], loading: false, failed: false });
  useTeacherClasses.mockReturnValue({ options: [], live: true, loading: false, sample: false });
});

describe("a reply that went", () => {
  it("is confirmed in the shared bar", async () => {
    send.mockResolvedValue("t-1");
    render(<ConnectView />);
    type("Yes - look at the second step again.");
    press();

    await waitFor(() =>
      expect(show).toHaveBeenCalledWith({ kind: "confirm", message: "Message sent" }),
    );
    expect(box()).toHaveValue("");
  });
});

describe("a reply that did not go", () => {
  it("is a failure, which stays until dismissed", async () => {
    send.mockResolvedValue(null);
    render(<ConnectView />);
    type("Yes - look at the second step again.");
    press();

    await waitFor(() =>
      expect(show).toHaveBeenCalledWith({ kind: "failed", message: "That didn’t send. Try again" }),
    );
  });

  it("puts the words back in the box, so there is something to try again with", async () => {
    send.mockResolvedValue(null);
    render(<ConnectView />);
    type("Yes - look at the second step again.");
    press();

    await waitFor(() => expect(box()).toHaveValue("Yes - look at the second step again."));
  });

  it("keeps whatever the teacher started typing since", async () => {
    let fail: (v: null) => void = () => {};
    send.mockReturnValue(new Promise((r) => (fail = r)));
    render(<ConnectView />);
    type("First thought.");
    press();
    type("Second thought.");
    fail(null);

    await waitFor(() => expect(show).toHaveBeenCalled());
    expect(box()).toHaveValue("Second thought.");
  });

  it("draws no toast of its own", async () => {
    send.mockResolvedValue(null);
    render(<ConnectView />);
    type("Hello.");
    press();

    await waitFor(() => expect(show).toHaveBeenCalled());
    expect(screen.queryByText("That didn’t send. Try again")).not.toBeInTheDocument();
  });
});

/** Whether the browser would ask before leaving: the event was cancelled. */
const leavingAsks = () => {
  const e = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
};

describe("a reply not yet sent", () => {
  it("makes the browser ask before leaving", () => {
    render(<ConnectView />);
    expect(leavingAsks()).toBe(false);

    type("Half a reply");
    expect(leavingAsks()).toBe(true);
  });
});
