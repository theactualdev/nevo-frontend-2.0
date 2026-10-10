import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { OfflineNotice, strandedOffline } from "./OfflineScreen";
import { clearSession, setSession } from "@/lib/auth/session";
import { saveLesson } from "@/lib/offline/savedLessons";
import { holdProgress } from "@/lib/lessons/pendingProgress";
import type { LessonDetailResponse } from "@/lib/api/lessons";

/**
 * D50, 1 Oct: "The banner is the default. The full screen appears only when
 * the child cannot continue at all, meaning nothing is downloaded and nothing
 * is in progress."
 *
 * The full screen had been removed outright the same morning, for the right
 * reason - it took every tab away from every child on a 3G blip. What these
 * pin is the narrow case it comes back for, and that the frame's words that
 * cannot be true in that case ("your downloaded lessons are still here", "See
 * saved lessons") do not come back with it.
 */

const signIn = (userId: string) =>
  setSession({
    token: `tok-${userId}`,
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId,
    role: "student",
  });

const lesson = (id: string) =>
  ({ id, title: "How a leaf makes food" }) as unknown as LessonDetailResponse;

const fullScreen = () => screen.queryByRole("dialog");
const banner = () => screen.queryByText("No internet connection");

beforeEach(() => {
  window.localStorage.clear();
  clearSession();
});

afterEach(() => {
  cleanup();
  clearSession();
  window.localStorage.clear();
});

describe("which a child gets when the connection drops", () => {
  it("the full screen, for a child with nothing downloaded and nothing in progress", async () => {
    signIn("child-a");
    render(<OfflineNotice online={false} />);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("You're offline")).toBeInTheDocument();
    expect(banner()).toBeNull();
  });

  it("the banner, for a child with a lesson downloaded", async () => {
    signIn("child-a");
    saveLesson("child-a", lesson("leaf"));
    render(<OfflineNotice online={false} />);

    expect(await screen.findByText(/No internet connection/)).toBeInTheDocument();
    expect(fullScreen()).toBeNull();
  });

  it("the banner, for a child with progress held on this device", async () => {
    signIn("child-a");
    holdProgress("leaf", { sessionId: "s-1", status: "in_progress", segment: 2 });
    render(<OfflineNotice online={false} />);

    expect(await screen.findByText(/No internet connection/)).toBeInTheDocument();
    expect(fullScreen()).toBeNull();
  });

  it("does not count another child's downloads on a shared tablet", async () => {
    saveLesson("child-b", lesson("leaf"));
    signIn("child-a");
    render(<OfflineNotice online={false} />);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("the banner, signed out, where there is no child to strand", async () => {
    render(<OfflineNotice online={false} />);

    expect(await screen.findByText(/No internet connection/)).toBeInTheDocument();
    expect(fullScreen()).toBeNull();
  });

  it("nothing at all while online", () => {
    signIn("child-a");
    render(<OfflineNotice online />);

    expect(fullScreen()).toBeNull();
    expect(banner()).toBeNull();
  });
});

describe("the full screen", () => {
  it("says what is true, and none of the frame's lines that cannot be", async () => {
    signIn("child-a");
    render(<OfflineNotice online={false} />);
    const dialog = await screen.findByRole("dialog");

    expect(dialog).toHaveTextContent("No internet connection right now.");
    // D136 (8 Oct): no save it cannot confirm. Nothing held for a position
    // is not the same as everything having landed.
    expect(dialog.textContent).not.toMatch(/progress is saved/i);
    // Nothing is downloaded, by definition of when this shows.
    expect(dialog.textContent).not.toMatch(/downloaded|saved lessons/i);
    // And no button that can only re-ask what the browser already answered.
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("goes over the tab, leaving what was half-written underneath", async () => {
    signIn("child-a");
    render(
      <>
        <textarea defaultValue="Dear Ms Okafor, I wanted to ask" />
        <OfflineNotice online={false} />
      </>,
    );
    await screen.findByRole("dialog");

    expect(document.querySelector("textarea")?.value).toBe(
      "Dear Ms Okafor, I wanted to ask",
    );
  });
});

describe("strandedOffline", () => {
  it("is only ever about a signed-in child", () => {
    expect(strandedOffline(null)).toBe(false);
    expect(strandedOffline(undefined)).toBe(false);
  });
});
