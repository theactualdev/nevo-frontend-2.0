import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";

const { unfinishedChecks } = vi.hoisted(() => ({ unfinishedChecks: vi.fn() }));
vi.mock("@/lib/api/classes", async (actual) => {
  const real = await actual<typeof import("@/lib/api/classes")>();
  return { ...real, classesApi: { ...real.classesApi, unfinishedChecks } };
});

import { clearSession, setSession } from "@/lib/auth/session";
import { UnfinishedChecks } from "./UnfinishedChecks";

/**
 * SCRUM-231: who in the class has a check from today still to finish.
 *
 * What is pinned: the server's list as sent - a name and a lesson, the name
 * a way to the child's profile in this class; how far through each child got
 * is never shown (the ticket rules it out); nothing alarmed; an empty list, a
 * failed read and no session draw nothing; and the list is read again when
 * the tab comes back, so a child who finished drops off.
 */

const row = (n: number, over: Record<string, unknown> = {}) => ({
  studentId: `st-${n}`,
  studentName: `Child ${n}`,
  lessonId: `l-${n}`,
  lessonTitle: `Lesson ${n}`,
  checkPosition: 7,
  resumableUntil: "2026-11-06T23:59:00Z",
  ...over,
});

const comeBack = () =>
  act(() => {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: "t-1",
    role: "teacher",
  });
  unfinishedChecks.mockReset();
});

describe("the list of checks to finish today", () => {
  it("names each child and the lesson, linking to their profile in this class", async () => {
    unfinishedChecks.mockResolvedValue([row(1), row(2)]);
    render(<UnfinishedChecks classId="c-1" />);

    const link = await screen.findByRole("link", { name: "Child 1" });
    expect(link).toHaveAttribute("href", "/teacher/students/st-1?class=c-1");
    expect(screen.getByText("Lesson 1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Child 2" })).toBeInTheDocument();
    expect(unfinishedChecks).toHaveBeenCalledWith("c-1");
  });

  /* The ticket: "Not a count of how far through each child got." */
  it("never says how far through a child got", async () => {
    unfinishedChecks.mockResolvedValue([row(1, { checkPosition: 7 })]);
    const { container } = render(<UnfinishedChecks classId="c-1" />);

    await screen.findByRole("link", { name: "Child 1" });
    expect(container.textContent).not.toMatch(/7|question|of \d|%/i);
  });

  it("is not framed as a concern", async () => {
    unfinishedChecks.mockResolvedValue([row(1)]);
    const { container } = render(<UnfinishedChecks classId="c-1" />);

    await screen.findByRole("link", { name: "Child 1" });
    expect(container.textContent).not.toMatch(/concern|worry|failed|missed|behind|incomplete|attention/i);
  });
});

describe("when there is nothing to name", () => {
  it("draws nothing for an empty list", async () => {
    unfinishedChecks.mockResolvedValue([]);
    const { container } = render(<UnfinishedChecks classId="c-1" />);

    await waitFor(() => expect(unfinishedChecks).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("draws nothing when the read fails - never an all-clear", async () => {
    unfinishedChecks.mockRejectedValue(new Error("down"));
    const { container } = render(<UnfinishedChecks classId="c-1" />);

    await waitFor(() => expect(unfinishedChecks).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("asks nothing without a session", () => {
    clearSession();
    const { container } = render(<UnfinishedChecks classId="c-1" />);

    expect(unfinishedChecks).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });
});

describe("as children finish", () => {
  it("reads again when the tab comes back, and a child who finished drops off", async () => {
    unfinishedChecks.mockResolvedValueOnce([row(1), row(2)]);
    render(<UnfinishedChecks classId="c-1" />);
    await screen.findByRole("link", { name: "Child 2" });

    unfinishedChecks.mockResolvedValueOnce([row(1)]);
    comeBack();

    await waitFor(() => expect(screen.queryByRole("link", { name: "Child 2" })).toBeNull());
    expect(screen.getByRole("link", { name: "Child 1" })).toBeInTheDocument();
  });

  it("draws nothing after a re-read fails, rather than a list that may be out of date", async () => {
    unfinishedChecks.mockResolvedValueOnce([row(1)]);
    const { container } = render(<UnfinishedChecks classId="c-1" />);
    await screen.findByRole("link", { name: "Child 1" });

    unfinishedChecks.mockRejectedValueOnce(new Error("down"));
    comeBack();

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
