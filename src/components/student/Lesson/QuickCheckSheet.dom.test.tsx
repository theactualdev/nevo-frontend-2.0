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
      onLeave={() => {}}
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
        onLeave={() => {}}
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
        onLeave={() => {}}
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

describe("the sheet's look (design, 13 Oct)", () => {
  it("rounds its top corners at the sheet radius, 16", () => {
    mount();

    const className =
      (content.props as { className?: string } | null)?.className ?? "";
    expect(className.split(" ")).toContain("rounded-t-[16px]");
    expect(className).not.toContain("rounded-t-[20px]");
  });

  it("sets the retry note in the darker violet, never soft violet on cream (D210)", () => {
    mount();

    fireEvent.click(screen.getByRole("button", { name: "Oxygen" }));

    const note = screen.getByRole("status");
    expect(note.className.split(" ")).toContain("text-nevo-violet-text");
    expect(note.className.split(" ")).not.toContain("text-nevo-violet");
  });
});

/**
 * SCRUM-275, LYDIA 22 OCT: "The check sheet gets its own Keep going. A child
 * whose only way past is the right answer is trapped." And: "Two identical
 * navy buttons is a defect, not a choice. One primary per sheet and it is the
 * action that progresses the check, so Try again or Send. Keep going is
 * secondary, not navy, not full-width."
 */
const classes = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/);
/** A navy, full-width button: what only the primary may be. */
const navyFullWidth = () =>
  screen
    .getAllByRole("button")
    .filter(
      (b) => classes(b).includes("bg-nevo-navy") && classes(b).includes("w-full"),
    );
const keepGoing = () => screen.getByRole("button", { name: "Keep going" });

const mountWith = (handlers: {
  onAnswered?: () => void;
  onContinue?: () => void;
  onLeave?: () => void;
}) =>
  render(
    <QuickCheckSheet
      check={CHECK}
      open
      onOpenChange={() => {}}
      onAnswered={handlers.onAnswered ?? (() => {})}
      onContinue={handlers.onContinue ?? (() => {})}
      onLeave={handlers.onLeave ?? (() => {})}
    />,
  );

describe("the sheet's own Keep going (SCRUM-275)", () => {
  it("is there and pressable the moment the sheet opens, before any answer", () => {
    const onAnswered = vi.fn();
    const onContinue = vi.fn();
    const onLeave = vi.fn();
    mountWith({ onAnswered, onContinue, onLeave });

    expect(keepGoing()).toBeEnabled();
    fireEvent.click(keepGoing());

    expect(onLeave).toHaveBeenCalledOnce();
    // It answers nothing, and claims no right answer.
    expect(onAnswered).not.toHaveBeenCalled();
    expect(onContinue).not.toHaveBeenCalled();
  });

  it("stands beside Try again after a miss, and still leaves the check unpassed", () => {
    const onContinue = vi.fn();
    const onLeave = vi.fn();
    mountWith({ onContinue, onLeave });

    fireEvent.click(screen.getByRole("button", { name: "Oxygen" }));
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    fireEvent.click(keepGoing());

    expect(onLeave).toHaveBeenCalledOnce();
    expect(onContinue).not.toHaveBeenCalled();
  });

  it("is the frame's way on after a right answer, and is drawn once", () => {
    const onContinue = vi.fn();
    const onLeave = vi.fn();
    mountWith({ onContinue, onLeave });

    fireEvent.click(screen.getByRole("button", { name: "Carbon dioxide" }));
    expect(screen.getAllByRole("button", { name: "Keep going" })).toHaveLength(1);
    fireEvent.click(keepGoing());

    expect(onContinue).toHaveBeenCalledOnce();
    expect(onLeave).not.toHaveBeenCalled();
  });
});

describe("one navy primary per sheet (SCRUM-275)", () => {
  const states = [
    ["as it opens", () => {}],
    [
      "after a miss",
      () => fireEvent.click(screen.getByRole("button", { name: "Oxygen" })),
    ],
    [
      "after a right answer",
      () =>
        fireEvent.click(screen.getByRole("button", { name: "Carbon dioxide" })),
    ],
  ] as const;

  it.each(states)("has no more than one navy full-width button %s", (_, reach) => {
    mount();
    reach();

    expect(navyFullWidth().length).toBeLessThanOrEqual(1);
  });

  it("makes Try again the one primary after a miss", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Oxygen" }));

    expect(navyFullWidth()).toEqual([
      screen.getByRole("button", { name: "Try again" }),
    ]);
  });

  it.each(states)(
    "draws Keep going secondary %s: not navy, not full width, 44px, a pointer",
    (_, reach) => {
      mount();
      reach();

      const own = classes(keepGoing());
      expect(own).not.toContain("bg-nevo-navy");
      expect(own).not.toContain("w-full");
      expect(own).toContain("w-fit");
      expect(own).toContain("h-11");
      expect(own).toContain("cursor-pointer");
      // Named on the button itself, not only in a child span.
      expect(keepGoing().firstChild?.nodeType).toBe(Node.TEXT_NODE);
    },
  );
});
