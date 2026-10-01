import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
