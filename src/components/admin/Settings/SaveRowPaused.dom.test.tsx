import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { withGate } from "@/test/setupGate";
import { SaveRow } from "./SettingsView";

/** The school's settings pause while setup is unfinished; the row says why. */
describe("SaveRow while setup is unfinished", () => {
  it("cannot save, and says why beside the button", () => {
    render(withGate(<SaveRow phase="idle" onSave={vi.fn()} />, "not_active"));
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(screen.getByText("Paused until your school is active.")).toBeInTheDocument();
  });

  it("saves as normal for a running school", () => {
    render(withGate(<SaveRow phase="idle" onSave={vi.fn()} />, null));
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
    expect(screen.queryByText(/Paused until/)).toBeNull();
  });
});
