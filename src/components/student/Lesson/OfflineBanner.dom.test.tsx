import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { OfflineBanner } from "./OfflineBanner";

/**
 * D136 (8 Oct): "nothing claims a save that has not been confirmed". The
 * lesson's offline banner still promised one - "we'll save where you got to
 * when you're back" - and a banner that shows on any drop cannot know that.
 */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the lesson's offline banner", () => {
  it("says the lesson keeps working, and claims no save", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<OfflineBanner />);

    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent(
      /^You're offline\. Your lesson keeps working\.$/,
    );
    expect(banner.textContent).not.toMatch(/sav/i);
  });

  it("is not there while the device is online", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    render(<OfflineBanner />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
