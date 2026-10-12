import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
}));

import { useUnsavedGuard, type UnsavedAbout } from "@/hooks/useUnsavedGuard";
import { UnsavedChangesProvider, useLeaveGuard } from "./UnsavedChanges";

/**
 * C18 Unsaved Changes (design, 12 Oct): "shown when a teacher clicks away in
 * the sidebar mid-edit." A client-side navigation never fires the browser's
 * own prompt, so before this a sidebar click threw a half-made edit away
 * without a word.
 */

function Editing({ unsaved, about }: { unsaved: boolean; about?: UnsavedAbout }) {
  useUnsavedGuard(unsaved, about);
  return null;
}

/** Stands in for a sidebar link: the same call the sidebar makes. */
function SidebarLink({ href }: { href: string }) {
  const guard = useLeaveGuard();
  return (
    <a href={href} onClick={(e) => guard?.onNavigate(e, href)}>
      Insights
    </a>
  );
}

const page = (unsaved: boolean, about?: UnsavedAbout) =>
  render(
    <UnsavedChangesProvider>
      <Editing unsaved={unsaved} about={about} />
      <SidebarLink href="/teacher/insights" />
    </UnsavedChangesProvider>,
  );

/** True when the click was let through to the link. */
const click = (init: MouseEventInit = {}) =>
  fireEvent.click(screen.getByRole("link", { name: "Insights" }), init);

beforeEach(() => push.mockReset());

describe("leaving mid-edit from the sidebar", () => {
  it("asks first, in design's words", () => {
    page(true, "lesson");
    expect(click()).toBe(false);

    const dialog = screen.getByRole("dialog", { name: "You have changes that aren’t saved" });
    expect(dialog).toHaveTextContent(
      "If you leave this page now, your edits to this lesson won’t be kept.",
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("drops only 'to this lesson' where the work is not a lesson", () => {
    page(true);
    click();

    expect(screen.getByRole("dialog")).toHaveTextContent(
      "If you leave this page now, your edits won’t be kept.",
    );
  });

  it("stays put on Stay on this page, and on Escape", () => {
    page(true);
    click();
    fireEvent.click(screen.getByRole("button", { name: "Stay on this page" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    click();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("goes where the teacher was headed on Leave without saving", () => {
    page(true);
    click();
    const leave = screen.getByRole("button", { name: "Leave without saving" });

    // A real, pressable control - not disabled, not styled as destructive.
    expect(leave).toBeEnabled();
    expect(leave.className).not.toMatch(/red|danger|destructive/);
    fireEvent.click(leave);

    expect(push).toHaveBeenCalledWith("/teacher/insights");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("lets a link go straight through when nothing is unsaved", () => {
    page(false);
    expect(click()).toBe(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("leaves a new-tab click alone - this page's work stays where it is", () => {
    page(true);
    expect(click({ ctrlKey: true })).toBe(true);
    expect(click({ metaKey: true })).toBe(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("stops asking once the work is saved or put down", () => {
    const { rerender } = page(true);
    rerender(
      <UnsavedChangesProvider>
        <Editing unsaved={false} />
        <SidebarLink href="/teacher/insights" />
      </UnsavedChangesProvider>,
    );

    expect(click()).toBe(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("outside the shell", () => {
  it("has no registry, so a link simply goes", () => {
    render(
      <>
        <Editing unsaved />
        <SidebarLink href="/teacher/insights" />
      </>,
    );

    expect(click()).toBe(true);
  });
});
