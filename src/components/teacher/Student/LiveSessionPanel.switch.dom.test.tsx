import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { session } = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return { ...actual, studentsApi: { ...actual.studentsApi, session } };
});

import { LiveSessionPanel } from "./LiveSessionPanel";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * T131 and T132, through the real read rather than a mocked hook - the stale
 * answer lived in the read, so a mock of it could not show the bug.
 */

const answer = (sessionId: string, narrative: string) => ({
  sessionId,
  lessonId: "l-1",
  lessonTitle: `Lesson for ${sessionId}`,
  occurredAt: "2026-07-09T09:00:00Z",
  sittings: 1,
  narrative,
  sections: [],
});

const panel = (sessionId: string | null, onClose = vi.fn()) => (
  <LiveSessionPanel
    studentId="st-1"
    sessionId={sessionId}
    studentName="Amara Okafor"
    onClose={onClose}
    onRecommend={vi.fn()}
    onMessage={vi.fn()}
  />
);

beforeEach(() => {
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: "t-1",
    role: "teacher" as never,
  });
  session.mockReset();
});
afterEach(() => clearSession());

describe("opening a second session (T131)", () => {
  it("does not show the first one's account under it", async () => {
    session
      .mockResolvedValueOnce(answer("sess-1", "Worked through it steadily."))
      .mockReturnValueOnce(new Promise(() => {}));
    const { rerender } = render(panel("sess-1"));
    await screen.findByText("Worked through it steadily.");

    rerender(panel("sess-2"));

    expect(screen.queryByText("Worked through it steadily.")).not.toBeInTheDocument();
  });

  it("does not keep the first one's failure up over the second", async () => {
    session
      .mockRejectedValueOnce(new Error("network"))
      .mockReturnValueOnce(new Promise(() => {}));
    const { rerender } = render(panel("sess-1"));
    await screen.findByText(/couldn’t load that session/);

    rerender(panel("sess-2"));

    expect(screen.queryByText(/couldn’t load that session/)).not.toBeInTheDocument();
  });

  it("shows the second once it lands", async () => {
    session
      .mockResolvedValueOnce(answer("sess-1", "Worked through it steadily."))
      .mockResolvedValueOnce(answer("sess-2", "Came back the next day."));
    const { rerender } = render(panel("sess-1"));
    await screen.findByText("Worked through it steadily.");

    rerender(panel("sess-2"));

    expect(await screen.findByText("Came back the next day.")).toBeInTheDocument();
  });
});

describe("waiting for a session (T132)", () => {
  beforeEach(() => {
    session.mockReturnValue(new Promise(() => {}));
  });

  it("can be closed with its own button", () => {
    const onClose = vi.fn();
    render(panel("sess-1", onClose));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("can be closed with Escape", () => {
    const onClose = vi.fn();
    render(panel("sess-1", onClose));
    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("can be closed from the backdrop, but not from inside the card", () => {
    const onClose = vi.fn();
    render(panel("sess-1", onClose));
    const button = screen.getByRole("button", { name: "Close" });
    const card = button.parentElement as HTMLElement;

    fireEvent.click(card);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(card.parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stops listening for Escape once the session is on screen", async () => {
    session.mockReset().mockResolvedValue(answer("sess-1", "Worked through it steadily."));
    const onClose = vi.fn();
    render(panel("sess-1", onClose));
    await screen.findByText("Worked through it steadily.");
    onClose.mockClear();

    fireEvent.keyDown(window, { key: "Escape" });

    // The panel's own Escape closes it once - not twice.
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
