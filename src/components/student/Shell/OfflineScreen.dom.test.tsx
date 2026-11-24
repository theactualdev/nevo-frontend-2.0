import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OfflineNotice, strandedOffline } from "./OfflineScreen";
import { offlineArt, resetOfflineArt } from "./offlineArt";
import { clearSession, setSession } from "@/lib/auth/session";
import { saveLesson } from "@/lib/offline/savedLessons";
import { FRESH_DOWNLOAD } from "@/lib/offline/testDownload";
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
    saveLesson("child-a", lesson("leaf"), FRESH_DOWNLOAD);
    render(<OfflineNotice online={false} />);

    expect(await screen.findByText(/No internet connection/)).toBeInTheDocument();
    expect(fullScreen()).toBeNull();
  });

  /*
   * Safety v2 (Teslim 18 Nov): a copy past its expiry, or kept before safety
   * v2, does not open offline - so it is nothing to do, and the child is told
   * the truth rather than handed a banner over a lesson that will not open.
   */
  it("the full screen, for a child whose only downloads can no longer open", async () => {
    signIn("child-a");
    saveLesson("child-a", lesson("leaf"), {
      ...FRESH_DOWNLOAD,
      expiresAt: "2020-01-01T00:00:00Z",
    });
    saveLesson("child-a", lesson("stem"));
    render(<OfflineNotice online={false} />);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("the banner, for a child with progress held on this device", async () => {
    signIn("child-a");
    holdProgress("leaf", { sessionId: "s-1", status: "in_progress", segment: 2 });
    render(<OfflineNotice online={false} />);

    expect(await screen.findByText(/No internet connection/)).toBeInTheDocument();
    expect(fullScreen()).toBeNull();
  });

  it("does not count another child's downloads on a shared tablet", async () => {
    saveLesson("child-b", lesson("leaf"), FRESH_DOWNLOAD);
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
    // One button, the frame's Try again (L5) - not its See saved lessons.
    expect(
      screen.getAllByRole("button").map((b) => b.textContent),
    ).toEqual(["Try again"]);
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

/**
 * L5 (Lydia, 19 Nov): "Add Try again. In the connectivity conditions these
 * children are actually in, the connection commonly returns within seconds."
 * It asks the network, not the browser, which already answered.
 */
describe("the full screen's Try again", () => {
  const online = vi.fn();
  beforeEach(() => {
    online.mockReset();
    window.addEventListener("online", online);
  });
  afterEach(() => {
    window.removeEventListener("online", online);
    vi.unstubAllGlobals();
  });

  it("takes the screen away once the network answers, whatever the browser says", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    signIn("child-a");
    render(<OfflineNotice online={false} />);

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));

    await waitFor(() => expect(online).toHaveBeenCalledTimes(1));
    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toMatch(/^\/og-card\.png\?reach=/);
    expect(init).toMatchObject({ method: "HEAD", cache: "no-store" });
  });

  it("changes nothing and says nothing when there is still no network", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    signIn("child-a");
    render(<OfflineNotice online={false} />);
    const before = (await screen.findByRole("dialog")).textContent;

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Try again" })).not.toBeDisabled(),
    );
    expect(online).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog").textContent).toBe(before);
  });

  /*
   * On-screen QA, 24 Nov: the dialog's default put focus on its first control,
   * so the console's focus ring went round Try again the moment the screen
   * came up - the frame's borderless ghost, drawn outlined, by nothing the
   * child did. The screen takes focus; Try again is a Tab away.
   */
  it("arrives with the screen focused, not Try again", async () => {
    signIn("child-a");
    render(<OfflineNotice online={false} />);
    const dialog = await screen.findByRole("dialog");

    await waitFor(() => expect(document.activeElement).toBe(dialog));
    expect(screen.getByRole("button", { name: "Try again" })).not.toHaveFocus();
  });

  it("asks once while it waits", async () => {
    let answer: (r: Response) => void = () => {};
    const fetch = vi.fn(() => new Promise<Response>((r) => (answer = r)));
    vi.stubGlobal("fetch", fetch);
    signIn("child-a");
    render(<OfflineNotice online={false} />);
    const button = await screen.findByRole("button", { name: "Try again" });

    fireEvent.click(button);
    fireEvent.click(button);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    answer(new Response(null, { status: 204 }));
    await waitFor(() => expect(online).toHaveBeenCalledTimes(1));
  });
});
