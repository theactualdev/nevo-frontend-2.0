import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SettingsView } from "./SettingsView";

/**
 * "Share feedback" at the foot of Settings was a link to the Overview - a page
 * with no feedback on it, which an admin without oversight cannot even open -
 * and it only rendered inside the school half, so such an admin never saw it.
 * `POST /api/v1/feedback` was live the whole time.
 */

const permissions = vi.fn();
const submit = vi.fn();

vi.mock("@/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks")>();
  return { ...actual, usePermissions: () => permissions() };
});
vi.mock("./SchoolSettings", () => ({ SchoolSettings: () => <div>SCHOOL HALF</div> }));
vi.mock("./AccountSettings", () => ({ AccountSettings: () => <div>ACCOUNT HALF</div> }));
vi.mock("next/navigation", () => ({ usePathname: () => "/admin/settings" }));
vi.mock("@/lib/api/feedback", () => ({
  feedbackApi: { submit: (b: unknown) => submit(b) },
}));

const scopes = (list: string[]) => ({
  scopes: list,
  resolved: true,
  status: "ready" as const,
  refresh: vi.fn(),
  hasScope: (s: string) => list.includes(s),
});

describe("Share feedback in admin Settings", () => {
  it("opens a real panel and sends the note, with the page it came from", async () => {
    permissions.mockReturnValue(scopes(["oversight"]));
    submit.mockResolvedValue({});
    render(<SettingsView />);

    fireEvent.click(screen.getByRole("button", { name: "Share feedback" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "The term dates screen is lovely." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Send/ }));

    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith(
        expect.objectContaining({
          note: "The term dates screen is lovely.",
          context: "/admin/settings",
        }),
      ),
    );
    expect(await screen.findByText(/on its way/)).toBeInTheDocument();
  });

  it("is there for an admin without oversight too", () => {
    permissions.mockReturnValue(scopes(["billing"]));
    render(<SettingsView />);
    expect(screen.getByRole("button", { name: "Share feedback" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Share feedback" })).toBeNull();
  });
});
