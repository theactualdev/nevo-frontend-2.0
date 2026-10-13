import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => true }));
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({
    name: "Ms. Adeyemi",
    initials: "MA",
    school: "Corona Secondary School",
    photoUrl: null,
  }),
}));
vi.mock("@/hooks", () => ({
  useAuth: () => ({ signOut: vi.fn(), signIn: vi.fn(), status: "authenticated", user: null }),
}));

import { BiggerScreen, PhoneShell } from "./PhoneShell";
import { OPEN_ASK_NEVO } from "./phoneLayouts";

/**
 * C19's shell on a phone: the app bar, the drawer (C1) and Ask Nevo reached
 * from it (C2), and the one "needs a bigger screen" drawing (D1).
 */

beforeEach(() => usePathname.mockReturnValue("/teacher/dashboard"));

describe("the phone app bar", () => {
  it("names the page and, on Home, carries the teacher's disc", () => {
    render(<PhoneShell />);

    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("MA")).toBeInTheDocument();
  });

  it("stands aside where a screen draws its own back bar (B3)", () => {
    usePathname.mockReturnValue("/teacher/students/s-1/clear-pin");
    const { container } = render(<PhoneShell />);

    expect(container).toBeEmptyDOMElement();
  });

  it("carries no disc away from Home", () => {
    usePathname.mockReturnValue("/teacher/insights");
    render(<PhoneShell />);

    expect(screen.getByText("Insights")).toBeInTheDocument();
    expect(screen.queryByText("MA")).not.toBeInTheDocument();
  });
});

describe("the drawer", () => {
  const open = () => {
    render(<PhoneShell />);
    fireEvent.click(screen.getByRole("button", { name: "Open the menu" }));
    return screen.getByRole("dialog", { name: "Menu" });
  };

  it("lists who is signed in, the tabs, Ask Nevo, Settings and Sign out", () => {
    const drawer = open();

    expect(drawer).toHaveTextContent("Ms. Adeyemi");
    expect(drawer).toHaveTextContent("Corona Secondary School");
    for (const tab of ["Home", "Classes", "Library", "Insights", "Connect"]) {
      expect(screen.getAllByRole("link", { name: tab }).length).toBeGreaterThan(0);
    }
    expect(screen.getByRole("button", { name: "Ask Nevo" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/teacher/profile");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("marks the tab the teacher is on", () => {
    open();
    expect(screen.getByRole("link", { name: "Home", current: "page" })).toBeInTheDocument();
  });

  it("opens Ask Nevo from its row, and closes behind it", () => {
    const heard = vi.fn();
    window.addEventListener(OPEN_ASK_NEVO, heard);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Ask Nevo" }));

    expect(heard).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: "Menu" })).not.toBeInTheDocument();
    window.removeEventListener(OPEN_ASK_NEVO, heard);
  });

  it("asks before signing out, as the rail's menu does", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(screen.getByRole("dialog", { name: "Sign out of Nevo?" })).toBeInTheDocument();
  });

  it("closes on Escape and on the scrim", () => {
    open();
    fireEvent.keyDown(document.activeElement ?? window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Menu" })).not.toBeInTheDocument();
  });
});

describe("this page needs a bigger screen", () => {
  it("says so in design's words, with the way back to Home", () => {
    render(<BiggerScreen />);

    expect(screen.getByRole("heading", { name: "This page needs a bigger screen" })).toBeInTheDocument();
    expect(
      screen.getByText("Open Nevo on a tablet or computer to use this part of the console."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Home" })).toHaveAttribute("href", "/teacher/dashboard");
  });
});
