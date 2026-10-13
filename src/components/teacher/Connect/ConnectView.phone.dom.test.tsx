import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { search, loading, usePathname } = vi.hoisted(() => ({
  search: { value: "" },
  loading: { value: false },
  usePathname: vi.fn(() => "/teacher/connect"),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search.value),
  usePathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/hooks/useStudentDirectory", () => ({
  useStudentDirectory: () => ({ students: [], loading: false, failed: false }),
}));
vi.mock("@/hooks/useTeacherClasses", () => ({
  useTeacherClasses: () => ({ options: [], live: true, loading: false, sample: false }),
}));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => true }));
vi.mock("@/hooks/useCurrentUser", () => ({ useCurrentUser: () => null }));
vi.mock("@/components/shared/SystemMessages", () => ({
  useSystemMessages: () => ({ show: vi.fn(), resolve: vi.fn(), dismiss: vi.fn() }),
}));
vi.mock("@/hooks/useConnectThreads", () => ({
  useConnectThreads: () => ({
    threads: loading.value
      ? []
      : [
          {
            id: "t-1",
            studentName: "Amara Okafor",
            className: "JSS 2A",
            initials: "AO",
            preview: "The last two questions were hard.",
            time: "2m",
            unread: false,
            unreadCount: 0,
            recipientId: "s-1",
            recipientType: "student",
            loaded: true,
            messages: [],
          },
          {
            id: "t-2",
            studentName: "Tunde Bello",
            className: "JSS 2A",
            initials: "TB",
            preview: "Thanks",
            time: "1h",
            unread: false,
            unreadCount: 0,
            recipientId: "s-2",
            recipientType: "student",
            loaded: true,
            messages: [],
          },
        ],
    live: true,
    sample: false,
    loading: loading.value,
    openThread: vi.fn(),
    send: vi.fn(),
    markThreadRead: vi.fn(),
  }),
}));

import { ConnectView } from "./ConnectView";
import { PhoneBarProvider, PhoneShell } from "@/components/teacher/Shell/PhoneShell";

/**
 * C19 B4 (design, 12 Oct): on a phone, a reply notification opens one thread,
 * with B4's own back bar. Connect without a named thread is the list, which
 * C19 does not draw - so a phone gets the shared bigger-screen state.
 */

const BIGGER = { name: "This page needs a bigger screen" };

const renderIt = () =>
  render(
    <PhoneBarProvider>
      <PhoneShell />
      <ConnectView />
    </PhoneBarProvider>,
  );

beforeEach(() => {
  search.value = "";
  loading.value = false;
});

describe("Connect on a phone", () => {
  it("is a bigger-screen page with no thread named", () => {
    renderIt();

    expect(screen.getByRole("heading", BIGGER)).toBeInTheDocument();
    // The shell's own bar stays: the menu is the way on from here.
    expect(screen.getByRole("button", { name: "Open the menu" })).toBeInTheDocument();
  });

  it("opens the thread the link names, with B4's back bar in place of the menu", () => {
    search.value = "thread=t-2";
    renderIt();

    expect(screen.queryByRole("heading", BIGGER)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Message Tunde Bello")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Home" })).toHaveAttribute("href", "/teacher/dashboard");
    expect(screen.queryByRole("button", { name: "Open the menu" })).not.toBeInTheDocument();
  });

  it("never opens a different thread than the one named", () => {
    search.value = "thread=gone";
    renderIt();

    expect(screen.getByRole("heading", BIGGER)).toBeInTheDocument();
  });

  it("waits for the list rather than flashing the bigger-screen state", () => {
    search.value = "thread=t-1";
    loading.value = true;
    renderIt();

    expect(screen.queryByRole("heading", BIGGER)).not.toBeInTheDocument();
  });

  it("draws B4's pill composer and wider bubbles on a phone", () => {
    search.value = "thread=t-1";
    renderIt();

    expect(screen.getByLabelText("Message Amara Okafor").className).toMatch(/max-md:rounded-full/);
    expect(screen.getByRole("button", { name: "Send" }).className).toMatch(/max-md:rounded-full/);
  });
});
