import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { LessonSegment } from "@/lib/api/lessons";
import { ApiError } from "@/lib/api/client";

const lessons = vi.hoisted(() => ({ detail: vi.fn() }));
const media = vi.hoisted(() => ({
  list: vi.fn(),
  withdraw: vi.fn(),
  withdrawLive: vi.fn(),
  restore: vi.fn(),
  approve: vi.fn(),
  retry: vi.fn(),
}));
vi.mock("@/lib/api/lessons", () => ({ lessonsApi: lessons }));
vi.mock("@/lib/api/media", () => ({ mediaApi: media }));
vi.mock("@/hooks/useHydrated", () => ({ useHydrated: () => true }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/components/shared/IllustrationWrapper", () => ({
  IllustrationWrapper: ({ alt }: { alt: string }) => <div role="img" aria-label={alt} />,
}));

import { LessonMediaRoute } from "./LessonMedia";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * C06c Lesson Media (design 82c213b): pull one live picture or recording from a
 * lesson children are using, with no dialog; the section says what is now
 * true, an undo stays beside it while the teacher is here, and nothing is
 * regenerated (Teslim e03e0ae).
 */

const picture = { imageUrl: "https://cdn.test/p.png", previewUrl: null, width: 400, height: 300, caption: "A leaf taking in light", storagePath: "p.png" };
const narration = { audioUrl: "https://cdn.test/n.mp3", storagePath: "n.mp3", durationMs: 38000 };

const seg = (n: number, over: Partial<LessonSegment> = {}): LessonSegment =>
  ({
    id: `s-${n}`,
    sequenceOrder: n,
    title: ["What a leaf does", "Inside the leaf", "How light becomes food"][n - 1],
    visualVariant: null,
    audioVariant: null,
    ...over,
  }) as unknown as LessonSegment;

const lesson = (segments: LessonSegment[]) => ({
  id: "l-1",
  title: "Photosynthesis in Leaves",
  classes: [{ id: "c-1", name: "JSS 2A" }],
  segments,
});

const LIVE = [
  seg(1, { visualVariant: picture, audioVariant: narration } as never),
  seg(2, { visualVariant: picture } as never),
  seg(3),
];

beforeEach(() => {
  for (const fn of [...Object.values(lessons), ...Object.values(media)]) fn.mockReset();
  clearSession();
  window.localStorage.clear();
  setSession({ token: "tok", expiresAt: new Date(Date.now() + 3600_000).toISOString(), userId: "t-1", role: "teacher" });
  lessons.detail.mockResolvedValue(lesson(LIVE));
  media.list.mockResolvedValue({
    lessonId: "l-1",
    summary: {},
    items: [{ id: "m-1", segmentId: "s-1", kind: "image", status: "approved" }],
  });
  media.withdraw.mockResolvedValue({ id: "m-1", canUndo: true });
  media.withdrawLive.mockResolvedValue({ id: "m-9", canUndo: true });
  media.restore.mockResolvedValue({ id: "m-1" });
});

const open = async () => {
  render(<LessonMediaRoute lessonId="l-1" />);
  await screen.findByRole("heading", { name: "Photosynthesis in Leaves" });
};

describe("a live lesson's pictures and narration", () => {
  it("says where the lesson is live and what is in it", async () => {
    await open();

    expect(screen.getByText("Live with JSS 2A · 3 sections · pictures and narration")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Lesson Detail/ })).toHaveAttribute("href", "/teacher/lessons/l-1");
  });

  it("lists the sections with media, saying what a child gets now", async () => {
    await open();

    const first = screen.getByRole("region", { name: "What a leaf does" });
    expect(within(first).getByText("Children get 1 picture, narration and text.")).toBeInTheDocument();
    expect(within(first).getByText("0:38")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Inside the leaf" })).toBeInTheDocument();
    // A section that never had media has nothing to say here.
    expect(screen.queryByRole("region", { name: "How light becomes food" })).not.toBeInTheDocument();
  });
});

describe("pulling one", () => {
  it("withdraws a picture by its media item, with no dialog, and says what is now true", async () => {
    lessons.detail
      .mockResolvedValueOnce(lesson(LIVE))
      .mockResolvedValue(lesson([seg(1, { audioVariant: narration } as never), LIVE[1], LIVE[2]]));
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Remove the picture from What a leaf does" }));

    await waitFor(() => expect(media.withdraw).toHaveBeenCalledWith("l-1", "m-1"));
    const first = screen.getByRole("region", { name: "What a leaf does" });
    expect(await within(first).findByText("That picture is gone from this lesson. Children won’t see it again.")).toBeInTheDocument();
    expect(within(first).getByText("Children get narration and text.")).toBeInTheDocument();
    expect(within(first).getByRole("button", { name: "Undo" })).toBeInTheDocument();
    expect(media.retry).not.toHaveBeenCalled();
  });

  it("withdraws live media that predates the media list by its section and kind", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Remove the narration from What a leaf does" }));

    await waitFor(() => expect(media.withdrawLive).toHaveBeenCalledWith("l-1", "s-1", "audio"));
  });

  it("says a section is text only once its last item is gone", async () => {
    lessons.detail.mockResolvedValueOnce(lesson(LIVE)).mockResolvedValue(lesson([LIVE[0], seg(2), LIVE[2]]));
    media.withdrawLive.mockResolvedValue({ id: "m-2", canUndo: true });
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Remove the picture from Inside the leaf" }));

    const second = screen.getByRole("region", { name: "Inside the leaf" });
    expect(await within(second).findByText(/This section is text only now\./)).toBeInTheDocument();
    expect(within(second).getByText("Children read this section as text only.")).toBeInTheDocument();
  });

  it("puts it back with Undo, using the stored item", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Remove the picture from What a leaf does" }));
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));

    await waitFor(() => expect(media.restore).toHaveBeenCalledWith("l-1", "m-1"));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument());
  });

  it("says so when the undo window has closed, rather than pretending", async () => {
    media.restore.mockRejectedValue(new ApiError(409, "x", { detail: { code: "media_withdrawal_undo_expired", message: "It can no longer be put back." } }));
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Remove the picture from What a leaf does" }));
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));

    expect(await screen.findByText("It can no longer be put back.")).toBeInTheDocument();
  });

  it("leaves the lesson as it was when the withdrawal is refused", async () => {
    media.withdraw.mockRejectedValue(new ApiError(409, "x", { detail: { code: "media_not_live", message: "That picture isn't live." } }));
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Remove the picture from What a leaf does" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That picture isn't live.");
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });
});
