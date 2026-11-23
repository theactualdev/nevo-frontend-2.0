import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { withGate } from "@/test/setupGate";
import { SaveRow } from "./SettingsView";

/**
 * D12's per-section save (backlog 68): a spinner while it saves, then the
 * check and "Saved just now". The taxonomy adds SCRUM-99's line that the
 * change is now live on every screen. "Last saved N days ago" needs a date
 * the server does not send, so it is never drawn.
 */
describe("SaveRow's saving and saved states", () => {
  it("spins while it saves", () => {
    const { container } = render(withGate(<SaveRow phase="saving" onSave={vi.fn()} />, null));

    const button = screen.getByRole("button", { name: "Saving…" });
    expect(button).toBeDisabled();
    expect(container.querySelector(".motion-safe\\:animate-spin")).not.toBeNull();
  });

  it("says Saved just now, with the check", () => {
    const { container } = render(withGate(<SaveRow phase="saved" onSave={vi.fn()} />, null));

    expect(screen.getByRole("status")).toHaveTextContent("Saved just now");
    expect(container.querySelector(".motion-safe\\:animate-nevo-pop svg")).not.toBeNull();
  });

  it("adds what the save changed beyond the section, once it has landed", () => {
    render(
      withGate(
        <SaveRow phase="saved" onSave={vi.fn()} savedNote="Now live on every screen." />,
        null,
      ),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Saved just now Now live on every screen.");
  });

  it("never says when it was last saved, which the server does not send", () => {
    const { rerender } = render(withGate(<SaveRow phase="idle" onSave={vi.fn()} />, null));
    expect(screen.queryByText(/Last saved/)).toBeNull();
    rerender(withGate(<SaveRow phase="saved" onSave={vi.fn()} />, null));
    expect(screen.queryByText(/Last saved/)).toBeNull();
  });
});
