import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { SavedLessons } from "./SavedLessons";
import { clearSession, setSession } from "@/lib/auth/session";
import { saveLesson, savedLesson } from "@/lib/offline/savedLessons";
import { useLessonExit } from "@/components/student/Lesson/LessonExit";

/**
 * Downloads for a signed-in child, the smaller offline version: save while
 * connected, open here without a connection, and every way out of a lesson
 * opened here comes back here rather than navigating somewhere that cannot
 * load offline.
 */

const { detail, lessons } = vi.hoisted(() => ({
  detail: vi.fn(),
  lessons: vi.fn(),
}));
vi.mock("@/lib/api/lessons", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  lessonsApi: { detail },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/student/downloads",
}));
vi.mock("@/hooks/useStudentLessons", () => ({ useStudentLessons: lessons }));
// The real route pulls the whole player in; what matters here is that it is
// opened in place and that its exit comes back.
vi.mock("@/components/student/Lesson/LessonRoute", () => ({
  LessonRoute: ({ lessonId }: { lessonId: string }) => {
    const exit = useLessonExit();
    return (
      <div>
        <p>Playing {lessonId}</p>
        <button type="button" onClick={() => exit("/student/dashboard")}>
          Done
        </button>
      </div>
    );
  },
}));

const lesson = (id: string, title: string) => ({ id, title, segments: [] });

beforeEach(() => {
  window.localStorage.clear();
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: "ada",
    role: "student",
  });
  lessons.mockReturnValue({
    lessons: [{ id: "l1", title: "Adding fractions" }],
    live: true,
    loading: false,
    failed: false,
  });
  detail.mockReset();
});

afterEach(() => {
  cleanup();
  clearSession();
});

describe("saving a lesson for offline", () => {
  it("keeps the lesson on the device when the child saves it", async () => {
    detail.mockResolvedValue(lesson("l1", "Adding fractions"));
    render(<SavedLessons />);

    fireEvent.click(
      screen.getByRole("button", { name: "Save Adding fractions for offline" }),
    );

    await waitFor(() => expect(screen.getByText("Open")).toBeVisible());
    expect(savedLesson("ada", "l1")).not.toBeNull();
  });

  it("says so when it could not be saved, and claims nothing", async () => {
    detail.mockRejectedValue(new Error("offline"));
    render(<SavedLessons />);

    fireEvent.click(
      screen.getByRole("button", { name: "Save Adding fractions for offline" }),
    );

    expect(await screen.findByText(/couldn.t be saved/)).toBeVisible();
    expect(savedLesson("ada", "l1")).toBeNull();
    expect(screen.queryByText("Open")).toBeNull();
  });
});

describe("with no connection", () => {
  it("still lists what the child saved when their lesson list cannot load", () => {
    saveLesson("ada", lesson("l9", "The water cycle") as never);
    lessons.mockReturnValue({ lessons: [], live: true, loading: false, failed: true });

    render(<SavedLessons />);

    expect(screen.getByText("The water cycle")).toBeVisible();
    expect(screen.getByText("Open")).toBeVisible();
  });

  it("opens a saved lesson here, and comes back here when it is over", async () => {
    saveLesson("ada", lesson("l1", "Adding fractions") as never);
    render(<SavedLessons />);

    fireEvent.click(screen.getByText("Open"));
    expect(screen.getByText("Playing l1")).toBeVisible();

    await act(async () => {
      fireEvent.click(screen.getByText("Done"));
    });

    expect(screen.queryByText("Playing l1")).toBeNull();
    expect(screen.getByText("Adding fractions")).toBeVisible();
  });
});

describe("a shared tablet", () => {
  it("does not show one child's saved lessons to another", () => {
    saveLesson("someone-else", lesson("l9", "The water cycle") as never);
    lessons.mockReturnValue({ lessons: [], live: true, loading: false, failed: true });

    render(<SavedLessons />);

    expect(screen.queryByText("The water cycle")).toBeNull();
  });
});
