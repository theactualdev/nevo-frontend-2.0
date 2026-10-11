import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { OfflineNotice, strandedOffline } from "./OfflineScreen";
import { offlineArt, resetOfflineArt } from "./offlineArt";
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
    // Portalled out of the shell, so it carries the student scope itself.
    expect(dialog).toHaveAttribute("data-nevo-console", "student");
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

describe("the full screen's pictures", () => {
  /*
   * They were network images, requested the moment the screen appeared -
   * which is the moment there was no network. The brand mark and the
   * illustration both came up broken for the one child the screen is for.
   * Now they are fetched while online and kept, and drawn from what was kept.
   */
  beforeEach(() => resetOfflineArt());
  afterEach(() => resetOfflineArt());

  it("are fetched while online and drawn offline from the copies kept", async () => {
    const fetched: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      fetched.push(String(input));
      return {
        ok: true,
        blob: async () => new Blob(["png"], { type: "image/png" }),
      } as Response;
    });
    let n = 0;
    Object.assign(URL, { createObjectURL: () => `blob:kept-${n++}` });

    signIn("child-a");
    const { rerender } = render(<OfflineNotice online />);
    await waitFor(() => expect(fetched).toHaveLength(2));
    // The real files: the combined mark, and the illustration as the screen
    // has always been served it.
    expect(fetched[0]).toBe("/brand/nevo-logo-combined.png");
    expect(fetched[1]).toContain(encodeURIComponent("/illustrations/offline.png"));

    await waitFor(() => {
      expect(offlineArt().mark).not.toBeNull();
      expect(offlineArt().illustration).not.toBeNull();
    });

    rerender(<OfflineNotice online={false} />);
    const dialog = await screen.findByRole("dialog");
    const srcs = Array.from(dialog.querySelectorAll("img")).map((img) =>
      img.getAttribute("src"),
    );
    expect(srcs).toHaveLength(2);
    for (const src of srcs) expect(src).toMatch(/^blob:kept-/);
  });

  it("fall back to the files themselves when nothing could be kept", async () => {
    signIn("child-a");
    render(<OfflineNotice online={false} />);
    const dialog = await screen.findByRole("dialog");

    expect(dialog.querySelector('img[alt="Nevo"]')).toHaveAttribute(
      "src",
      "/brand/nevo-logo-combined.png",
    );
  });
});

describe("strandedOffline", () => {
  it("is only ever about a signed-in child", () => {
    expect(strandedOffline(null)).toBe(false);
    expect(strandedOffline(undefined)).toBe(false);
  });
});
