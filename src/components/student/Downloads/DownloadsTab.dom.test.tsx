import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { SAMPLE_ATTR } from "@/lib/sampleData";
import { DownloadsTab } from "./DownloadsTab";

/**
 * The signed-out Downloads list is four lessons that are nobody's, saved by a
 * timer that caches nothing. Its gates hold, but it carried no sample mark, so
 * the end-to-end run that signs in and asserts "no sample marks" could not
 * have seen it if a gate ever stopped holding. The signed-in shelf
 * (`SavedLessons`, #587) is the child's own and must carry none.
 */

const session = vi.hoisted(() => ({ signedIn: false }));
vi.mock("@/hooks/useHasSession", () => ({
  useHasSession: () => session.signedIn,
}));
vi.mock("@/hooks/useHydrated", () => ({ useHydrated: () => true }));
vi.mock("./SavedLessons", () => ({
  SavedLessons: () => <p>your saved lessons</p>,
}));

afterEach(() => {
  session.signedIn = false;
});

describe("DownloadsTab sample marking", () => {
  it("marks the signed-out walkthrough", () => {
    render(<DownloadsTab />);

    const region = document.querySelector(`[${SAMPLE_ATTR}]`);
    expect(region?.getAttribute(SAMPLE_ATTR)).toBe("student:downloads");
    expect(region?.textContent).toMatch(/Adding Fractions/);
  });

  it("leaves a signed-in child's own shelf unmarked", () => {
    session.signedIn = true;

    render(<DownloadsTab />);

    expect(screen.getByText("your saved lessons")).toBeInTheDocument();
    expect(document.querySelector(`[${SAMPLE_ATTR}]`)).toBeNull();
  });
});

/**
 * D211, 13 Oct: "The last one is not blocked, it is finished. It still stays
 * pressable and still says so rather than going grey."
 */
describe("the finished bulk button", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("stays pressable once everything is saved, and says so in place", () => {
    vi.useFakeTimers();
    render(<DownloadsTab />);

    fireEvent.click(
      screen.getByRole("button", { name: "Download today's lessons" }),
    );
    act(() => {
      vi.runAllTimers();
    });

    const finished = screen.getByRole("button", {
      name: "All lessons saved for offline",
    });
    expect(finished).toBeEnabled();
    expect(finished.className).not.toMatch(/opacity/);
    expect(screen.queryByText("Everything's already saved.")).toBeNull();

    fireEvent.click(finished);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Everything's already saved.",
    );
  });

  it("drops the line once a lesson is removed", () => {
    vi.useFakeTimers();
    render(<DownloadsTab />);
    fireEvent.click(
      screen.getByRole("button", { name: "Download today's lessons" }),
    );
    act(() => {
      vi.runAllTimers();
    });
    fireEvent.click(
      screen.getByRole("button", { name: "All lessons saved for offline" }),
    );

    fireEvent.click(screen.getByText("Adding Fractions"));

    expect(screen.queryByText("Everything's already saved.")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Download today's lessons" }),
    ).toBeInTheDocument();
  });
});
