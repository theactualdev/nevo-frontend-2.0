import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NotificationBell } from "./NotificationBell";

/**
 * THE ONE SURFACE THE SAMPLE SWEEP COULD NOT SEE.
 *
 * The bell carried no mark, and `StudentShell` mounts it OUTSIDE both
 * `MaybeSample` wrappers - they cover the identity block and the avatar only.
 * So when this bell was inventing "Ms Okafor sent you a message", the
 * end-to-end run whose entire job is to catch a console degrading to fixtures
 * had nothing to assert against. The leak was found by reading the file.
 *
 * THE MARK FOLLOWS THE BRANCH, NOT THE ROWS, and that is the decision worth
 * defending. `SAMPLE_NOTIFICATIONS` is empty today, so a mark that followed
 * the rows would mark nothing - and the failure this exists to catch is
 * precisely the one that leaves no rows behind: a SIGNED-IN child falling into
 * the signed-out branch and being told "Nothing new right now", which is a
 * claim about their feed that nobody checked. That is what the missing
 * `useHydrated` guard did on every student page until 18 Sep.
 */

const ctx = vi.hoisted(() => ({
  value: {
    notifications: [] as unknown[],
    unreadCount: 0,
    failed: false,
    refresh: vi.fn(),
    markRead: vi.fn(),
    showingSamples: false,
  },
}));
vi.mock("@/hooks", () => ({ useNotifications: () => ctx.value }));

const SAMPLE_ATTR = "data-nevo-sample";

const openPanel = () => {
  render(<NotificationBell />);
  fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
};

const marks = () =>
  document.querySelectorAll(`[${SAMPLE_ATTR}="student:notifications"]`);

beforeEach(() => {
  ctx.value = {
    notifications: [],
    unreadCount: 0,
    failed: false,
    refresh: vi.fn(),
    markRead: vi.fn(),
    showingSamples: false,
  };
});

afterEach(() => {
  cleanup();
});

describe("what the end-to-end sweep can see", () => {
  it("marks the panel when the bell is showing the designed demo", () => {
    // With rows, so this one holds whether the mark follows the branch or the
    // content - it proves the mark exists, and the next test proves which.
    ctx.value.showingSamples = true;
    ctx.value.notifications = [
      { id: "n-1", title: "A new lesson is ready", ago: "2h" },
    ];

    openPanel();

    expect(marks()).toHaveLength(1);
  });

  it("marks it even though the demo has no rows to show", () => {
    /*
     * The case the whole decision turns on. An empty sample branch renders
     * "Nothing new right now" - a claim about a child's feed - and a mark that
     * waited for rows would let exactly that through.
     */
    ctx.value.showingSamples = true;
    ctx.value.notifications = [];

    openPanel();

    expect(marks()).toHaveLength(1);
    expect(document.body.textContent).toMatch(/Nothing new right now/i);
  });

  it("marks nothing for a child reading their own feed", () => {
    // The assertion the E2E actually makes: no sample region anywhere once
    // signed in.
    ctx.value.showingSamples = false;
    ctx.value.notifications = [
      { id: "n-1", title: "A new lesson is ready", ago: "2h" },
    ];

    openPanel();

    expect(marks()).toHaveLength(0);
  });

  it("marks nothing while the client is still working out who is here", () => {
    // A deliberate blank, not a fixture. Marking it would put the attribute on
    // every page for everyone for a frame, which makes the mark mean nothing.
    ctx.value.showingSamples = false;

    openPanel();

    expect(marks()).toHaveLength(0);
  });

  it("marks nothing at all while the panel is shut", () => {
    // The mark belongs to what is on screen. A closed bell shows no
    // notifications, sample or otherwise.
    ctx.value.showingSamples = true;

    render(<NotificationBell />);

    expect(marks()).toHaveLength(0);
  });
});

/**
 * Board 28 draws each row with a mark: a book for "A new lesson is ready for
 * you", a speech bubble for a teacher's message. The rows had a dot and no
 * mark, so a child could not tell a lesson from a message at a glance.
 */
describe("each row's mark", () => {
  const BOOK = "M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z";
  const BUBBLE = "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.5A8 8 0 1 1 21 12z";

  const rowFor = (title: string) =>
    screen.getByText(title).closest("a, button, div[class*='rounded']")!;

  it("is the frame's book for a lesson and its bubble for a message", () => {
    ctx.value.notifications = [
      { id: "n-1", kind: "lesson", title: "A new lesson is ready for you", ago: "2h", read: true },
      { id: "n-2", kind: "message", title: "Ms Bello replied", ago: "1d", read: true },
    ];

    openPanel();

    expect(rowFor("A new lesson is ready for you").innerHTML).toContain(BOOK);
    expect(rowFor("Ms Bello replied").innerHTML).toContain(BUBBLE);
  });

  it("is the bell's own for a kind the frame does not draw", () => {
    ctx.value.notifications = [
      { id: "n-3", kind: "other", title: "Your PIN was reset", ago: "now", read: true },
    ];

    openPanel();

    const row = rowFor("Your PIN was reset");
    expect(row.innerHTML).not.toContain(BOOK);
    expect(row.innerHTML).not.toContain(BUBBLE);
    expect(row.querySelector("[data-kind='other'] svg")).not.toBeNull();
  });

  it("carries the unread dot only while the row is unread", () => {
    ctx.value.notifications = [
      { id: "n-1", kind: "lesson", title: "Unread one", ago: "2h", read: false },
      { id: "n-2", kind: "lesson", title: "Read one", ago: "1d", read: true },
    ];

    openPanel();

    expect(rowFor("Unread one").querySelector("[aria-label='Unread']")).not.toBeNull();
    expect(rowFor("Read one").querySelector("[aria-label='Unread']")).toBeNull();
  });
});
