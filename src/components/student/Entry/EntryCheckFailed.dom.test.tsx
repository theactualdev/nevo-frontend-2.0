import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterRetry, EntryCheckFailed } from "./EntryCheckFailed";

/**
 * D69: "A check that cannot complete must not leave the door open." A child
 * whose consent could not be read at a sign-in door is held here - on frame
 * 28's offline state when the device is offline, its generic error otherwise -
 * with a way to try again, and no way into the app past the check.
 */

const { replace, push, signOut, studentDestination } = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  signOut: vi.fn(),
  studentDestination: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push, back: vi.fn() }),
}));
vi.mock("@/hooks", () => ({ useAuth: () => ({ signOut }) }));
vi.mock("@/lib/auth/entryGate", () => ({ studentDestination }));

const LESSON = "/student/lessons/frac-3";
const STILL_UNCHECKED = `/student/unchecked?next=${encodeURIComponent(LESSON)}`;

let online: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  replace.mockReset();
  push.mockReset();
  signOut.mockReset();
  studentDestination.mockReset();
  online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  online.mockRestore();
});

describe("the state it holds a child on", () => {
  it("is frame 28's generic error when the device is online", () => {
    render(<EntryCheckFailed next={LESSON} />);

    expect(
      screen.getByRole("heading", { name: "Something went wrong" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("We're on it. Try again or go back."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go back" })).toBeInTheDocument();
  });

  it("is frame 28's offline state when it is not, less what is not true here", () => {
    online.mockReturnValue(false);
    render(<EntryCheckFailed next={LESSON} />);

    expect(
      screen.getByRole("heading", { name: "You're offline" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No internet connection right now."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
    // "See saved lessons" is a door past the check, and nothing says
    // anything was saved.
    expect(screen.queryByRole("button", { name: /saved lessons/i })).toBeNull();
    expect(document.body.textContent).not.toMatch(/saved/i);
  });

  it("is not the Welcome's couldn't set things up, and says nothing about consent", () => {
    render(<EntryCheckFailed next={LESSON} />);

    expect(document.body.textContent).not.toMatch(
      /set things up|consent|parent|permission/i,
    );
  });
});

describe("Try again", () => {
  it("reads consent again and goes where the answer says", async () => {
    studentDestination.mockResolvedValue(LESSON);
    render(<EntryCheckFailed next={LESSON} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });

    expect(studentDestination).toHaveBeenCalledWith(LESSON);
    expect(replace).toHaveBeenCalledWith(LESSON);
  });

  it("goes to the hold the answer names, for a held child", async () => {
    studentDestination.mockResolvedValue("/student/unavailable");
    render(<EntryCheckFailed next={LESSON} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });

    expect(replace).toHaveBeenCalledWith("/student/unavailable");
  });

  it("stays, and can be pressed again, when the read fails again", async () => {
    studentDestination.mockResolvedValue(STILL_UNCHECKED);
    render(<EntryCheckFailed next={LESSON} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });
    expect(replace).not.toHaveBeenCalled();

    studentDestination.mockResolvedValue(LESSON);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });
    expect(replace).toHaveBeenCalledWith(LESSON);
  });
});

describe("Go back", () => {
  it("signs the child out to the door, never into the app", () => {
    render(<EntryCheckFailed next={LESSON} />);

    fireEvent.click(screen.getByRole("button", { name: "Go back" }));

    expect(signOut).toHaveBeenCalledTimes(1);
    // Not "back" into the lessons, and not Home: both are past the check.
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("afterRetry", () => {
  it("stays put on another failed read, and goes on otherwise", () => {
    expect(afterRetry(STILL_UNCHECKED)).toBeNull();
    expect(afterRetry("/student/unchecked")).toBeNull();
    expect(afterRetry(LESSON)).toBe(LESSON);
    expect(afterRetry("/student/waiting")).toBe("/student/waiting");
  });
});
