import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
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
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
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
