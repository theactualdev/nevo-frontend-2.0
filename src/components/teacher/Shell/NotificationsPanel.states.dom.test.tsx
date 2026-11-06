import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { NotificationsPanel } from "./NotificationsPanel";

/**
 * Three states that are not the same, drawn as three.
 *
 * "Nothing new right now." stood over the whole first read, and the failed
 * state said "Try again in a moment" with nothing to press.
 */

const panel = (over: Partial<Parameters<typeof NotificationsPanel>[0]> = {}) =>
  render(
    <NotificationsPanel
      notes={[]}
      onMarkAllRead={vi.fn()}
      onClose={vi.fn()}
      {...over}
    />,
  );

describe("before the feed answers", () => {
  it("does not say there is nothing new", () => {
    panel({ loading: true });

    expect(screen.queryByText("Nothing new right now.")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Loading notifications")).toBeInTheDocument();
  });
});

describe("when the feed failed", () => {
  it("offers the Try again it promises, and it asks again", () => {
    const onRetry = vi.fn();
    panel({ failed: true, onRetry });

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("when there is genuinely nothing", () => {
  it("says so - the frame's own line", () => {
    panel();

    expect(screen.getByText("Nothing new right now.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Loading notifications")).not.toBeInTheDocument();
  });
});

describe("a row the bell has no mark for", () => {
  /*
   * The fallback mark was the tick, so an unmapped "support needed" row read
   * as resolved (5 Nov). The neutral mark is a dot; the tick stays `done`'s.
   */
  it("draws the neutral dot, never the tick", () => {
    const { container } = panel({
      notes: [
        { id: "1", kind: "other", text: "A child needs support", detail: "", time: "Just now", unread: true },
      ],
    });

    expect(screen.getByText("A child needs support")).toBeInTheDocument();
    expect(container.querySelector('path[d="M20 6L9 17l-5-5"]')).toBeNull();
    expect(container.querySelector("circle")).not.toBeNull();
  });
});
