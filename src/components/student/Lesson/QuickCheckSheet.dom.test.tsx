import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { QuickCheckSheet } from "./QuickCheckSheet";
import type { QuickCheck } from "@/lib/types";

/**
 * NO MANUAL DISMISS, AT THE SHEET (IA 31).
 *
 * Radix never registers an outside tap in jsdom - a pointerdown on the scrim,
 * or on the body, reaches no dismiss handler - so a test that taps the scrim
 * and checks the sheet is still open passes whether or not the guard exists.
 * This reads the guard itself: what the sheet does with an outside
 * interaction and with Esc.
 */

type Guarded = { preventDefault: () => void };
type Guards = {
  onInteractOutside?: (e: Guarded) => void;
  onEscapeKeyDown?: (e: Guarded) => void;
};
const content = vi.hoisted(() => ({ props: null as Guards | null }));
vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }: { children: ReactNode }) => <>{children}</>,
  SheetContent: (props: Guards & { children: ReactNode }) => {
    content.props = props;
    return <div role="dialog">{props.children}</div>;
  },
  SheetTitle: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => <h2 className={className}>{children}</h2>,
}));

const CHECK: QuickCheck = {
  question: "What do plants take in?",
  options: [
    { id: "co2", label: "Carbon dioxide" },
    { id: "o2", label: "Oxygen" },
  ],
  correctId: "co2",
  correctNote: "That's it.",
  recoveryNote: "Not quite. Let's look again.",
};

const mount = () =>
  render(
    <QuickCheckSheet
      check={CHECK}
      open
      onOpenChange={() => {}}
      onAnswered={() => {}}
      onContinue={() => {}}
    />,
  );

afterEach(() => {
  cleanup();
  content.props = null;
});

describe("the quick check refuses a manual dismiss", () => {
  it("refuses a tap outside it, which is a tap on the scrim", () => {
    mount();
    const e = { preventDefault: vi.fn() };

    content.props?.onInteractOutside?.(e);

    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("refuses Esc", () => {
    mount();
    const e = { preventDefault: vi.fn() };

    content.props?.onEscapeKeyDown?.(e);

    expect(e.preventDefault).toHaveBeenCalled();
  });
});

describe("a spoken check (B16)", () => {
  it("offers its recording and keeps the printed question", () => {
    render(
      <QuickCheckSheet
        check={{ ...CHECK, promptAudio: "https://cdn.example/q.mp3" }}
        open
        onOpenChange={() => {}}
        onAnswered={() => {}}
        onContinue={() => {}}
      />,
    );

    expect(document.querySelector("audio")?.getAttribute("src")).toBe(
      "https://cdn.example/q.mp3",
    );
    expect(screen.getByRole("button", { name: "Listen" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: CHECK.question })).toBeTruthy();
  });

  it("is a printed question only when the server sent no recording", () => {
    mount();

    expect(document.querySelector("audio")).toBeNull();
    expect(screen.queryByRole("button", { name: "Listen" })).toBeNull();
  });
});

describe("a miss (D93)", () => {
  it("offers Try again alone: no See it explained, no save claimed", () => {
    mount();

    fireEvent.click(screen.getByRole("button", { name: "Oxygen" }));

    expect(screen.getByRole("status").textContent).toBe(CHECK.recoveryNote);
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /explained/i })).toBeNull();
    expect(document.body.textContent).not.toMatch(/saved/i);
  });
});

describe("the reading accommodation on a quick check (D30)", () => {
  const mountReading = (reading: boolean) =>
    render(
      <QuickCheckSheet
        check={CHECK}
        open
        reading={reading}
        onOpenChange={() => {}}
        onAnswered={() => {}}
        onContinue={() => {}}
      />,
    );

  it("sets the answers in 37c's reading type", () => {
    mountReading(true);

    const label = screen.getByText("Carbon dioxide");
    expect(label.className).toContain("text-[18px]");
    expect(label.className).toContain("leading-[2]");
    expect(label.className).toContain("tracking-[0.02em]");
  });

  it("opens the question's letter-spacing", () => {
    mountReading(true);

    expect(
      screen.getByRole("heading", { name: CHECK.question }).className,
    ).toContain("tracking-[0.01em]");
  });

  it("sets the note after an answer in it too", () => {
    mountReading(true);

    fireEvent.click(screen.getByRole("button", { name: "Oxygen" }));

    expect(screen.getByRole("status").className).toContain("text-[18px]");
  });

  it("leaves a check alone when it is off", () => {
    mountReading(false);

    expect(screen.getByText("Carbon dioxide").className).not.toContain(
      "text-[18px]",
    );
    expect(
      screen.getByRole("heading", { name: CHECK.question }).className,
    ).not.toContain("tracking-[0.01em]");
  });
});
