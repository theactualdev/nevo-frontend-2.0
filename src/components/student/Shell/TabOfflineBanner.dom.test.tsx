import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TabOfflineBanner, useOnline } from "./TabOfflineBanner";

/**
 * Board 28's offline banner, as the IA specifies it: *"top of any screen when
 * offline; never navigates; Dismiss X hides it; auto-dismisses when
 * connectivity restored"*.
 *
 * The harness renders it exactly the way the shell does - on `!online` - so
 * these drive the real connectivity listener rather than a mocked flag.
 */

function Harness() {
  const online = useOnline();
  return (
    <>
      {!online && <TabOfflineBanner />}
      <p>the tab</p>
    </>
  );
}

const go = (event: "online" | "offline") =>
  act(() => {
    window.dispatchEvent(new Event(event));
  });

afterEach(() => {
  cleanup();
});

describe("the tab's offline banner", () => {
  it("appears when the connection drops, over a tab that stays put", () => {
    render(<Harness />);
    expect(screen.queryByRole("status")).toBeNull();

    go("offline");

    expect(screen.getByRole("status")).toHaveTextContent(
      "No internet connection - your progress is saved",
    );
    expect(screen.getByText("the tab")).toBeVisible();
  });

  it("goes by itself when the connection comes back", () => {
    render(<Harness />);
    go("offline");
    go("online");

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("offers a dismiss and nothing that pretends to retry", () => {
    // The takeover's "Try again" called `router.refresh()`, which cannot
    // change what `navigator.onLine` says. A button that does nothing is
    // worse than none.
    render(<Harness />);
    go("offline");

    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual([
      "Dismiss",
    ]);
    expect(screen.queryByText(/try again/i)).toBeNull();
  });

  it("stays dismissed for this drop, and comes back for the next one", () => {
    render(<Harness />);
    go("offline");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("status")).toBeNull();

    go("online");
    go("offline");

    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
