import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  GIVES_WAY_AFTER_MS,
  QuickCheckSheet,
  RECOVERY_LINE,
} from "./QuickCheckSheet";
import type { QuickCheck } from "@/lib/types";

/**
 * THE SHEET, MOCKED TO ITS SEAMS.
 *
 * Radix never registers an outside tap in jsdom - a pointerdown on the scrim,
 * or on the body, reaches no dismiss handler. So this reads the seams
 * themselves: whether the content refuses an outside interaction or Esc, and
 * what the sheet does when Radix reports one (its root's `onOpenChange`).
 * The content's own handlers - the phone sheet's pull - are spread onto the
 * dialog, so pointer events reach them.
 */

type Guarded = { preventDefault: () => void };
type Guards = {
  onInteractOutside?: (e: Guarded) => void;
  onEscapeKeyDown?: (e: Guarded) => void;
};
const content = vi.hoisted(() => ({
  props: null as Guards | null,
  root: null as { onOpenChange?: (open: boolean) => void } | null,
}));
vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({
    children,
    onOpenChange,
  }: {
    children: ReactNode;
    onOpenChange?: (open: boolean) => void;
  }) => {
    content.root = { onOpenChange };
    return <>{children}</>;
  },
  SheetContent: ({
    children,
    onInteractOutside,
    onEscapeKeyDown,
    ...rest
  }: Guards & { children: ReactNode } & Record<string, unknown>) => {
    content.props = { onInteractOutside, onEscapeKeyDown, ...rest } as Guards;
    // What is not a DOM attribute stays off the dialog.
    const dom: Record<string, unknown> = { ...rest };
    delete dom.side;
    delete dom.showCloseButton;
    return (
      <div role="dialog" {...dom}>
        {children}
      </div>
    );
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
  holds: true,
};

const mount = () =>
  render(
    <QuickCheckSheet
      check={CHECK}
      open
      onTapOut={() => {}}
      onAnswered={() => {}}
      onContinue={() => {}}
      onTakeBreak={() => {}}
    />,
  );

afterEach(() => {
  cleanup();
  content.props = null;
  content.root = null;
});

/*
 * A CHILD CAN TAP OUT OF THE CHECK (Olayinka, 23 Oct - reversing IA 31's no
 * manual dismiss): the dimmed player, Esc, or the phone sheet pulled down.
 */
describe("tapping out of the check", () => {
  it("lets a tap outside it, on the dimmed player, through", () => {
    mount();
    const e = { preventDefault: vi.fn() };

    content.props?.onInteractOutside?.(e);

    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it("lets Esc through", () => {
    mount();
    const e = { preventDefault: vi.fn() };

    content.props?.onEscapeKeyDown?.(e);

    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it("tells the player the child tapped out, when Radix closes it", () => {
    const onTapOut = vi.fn();
    render(
      <QuickCheckSheet
        check={CHECK}
        open
        onTapOut={onTapOut}
        onAnswered={() => {}}
        onContinue={() => {}}
        onTakeBreak={() => {}}
      />,
    );

    content.root?.onOpenChange?.(false);

    expect(onTapOut).toHaveBeenCalledOnce();
  });

  it("asks the check afresh after tapping out of a miss", () => {
    const view = mountWith({});
    fireEvent.click(screen.getByRole("button", { name: "Oxygen" }));
    expect(screen.getByRole("status").textContent).toBe(RECOVERY_LINE);

    content.root?.onOpenChange?.(false);
    view.rerender(sheet({ open: true }));

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: "Oxygen" })).toBeEnabled();
  });

  it("puts no close button of its own on the sheet", () => {
    mount();

    expect(screen.queryByRole("button", { name: /close/i })).toBeNull();
  });
});

describe("pulling the phone sheet down", () => {
  const dialog = () => screen.getByRole("dialog");
  const at = (y: number) => ({
    pointerId: 1,
    isPrimary: true,
    button: 0,
    clientX: 100,
    clientY: y,
  });
  const pullDown = (el: Element, from: number, to: number) => {
    fireEvent.pointerDown(el, at(from));
    fireEvent.pointerMove(el, at((from + to) / 2));
    fireEvent.pointerMove(el, at(to));
    fireEvent.pointerUp(el, at(to));
  };

  it("closes it, let go far enough down", () => {
    const onTapOut = vi.fn();
    mountWith({ onTapOut });

    pullDown(dialog(), 100, 220);

    expect(onTapOut).toHaveBeenCalledOnce();
  });

  it("follows the finger, and settles back when let go short of that", () => {
    const onTapOut = vi.fn();
    mountWith({ onTapOut });

    fireEvent.pointerDown(dialog(), at(100));
    fireEvent.pointerMove(dialog(), at(140));
    expect((dialog() as HTMLElement).style.transform).toBe("translateY(40px)");
    fireEvent.pointerUp(dialog(), at(140));

    expect(onTapOut).not.toHaveBeenCalled();
    expect((dialog() as HTMLElement).style.transform).toBe("");
  });

  it("picks no answer with a pull that ends on one", () => {
    const onAnswered = vi.fn();
    const onTapOut = vi.fn();
    mountWith({ onAnswered, onTapOut });
    const answer = screen.getByRole("button", { name: "Oxygen" });

    pullDown(answer, 100, 130);
    fireEvent.click(answer);

    expect(onAnswered).not.toHaveBeenCalled();
    // The next tap is a tap again.
    fireEvent.pointerDown(answer, at(100));
    fireEvent.click(answer);
    expect(onAnswered).toHaveBeenCalledOnce();
  });

  it("is the phone's alone: the centred card does not move", () => {
    const matchMedia = vi
      .spyOn(window, "matchMedia")
      .mockImplementation(
        (query: string) => ({ matches: true, media: query }) as MediaQueryList,
      );
    const onTapOut = vi.fn();
    mountWith({ onTapOut });

    pullDown(dialog(), 100, 300);

    expect(onTapOut).not.toHaveBeenCalled();
    matchMedia.mockRestore();
  });
});

/*
 * THE BREAK INSIDE THE CHECK (Lydia, 23 Oct: a hold at a check is not live
 * until the break is reachable at all times, including from inside the check
 * sheet), as design's 4e03b7f Lesson Check frame draws it.
 */
describe("Take a break, inside the check", () => {
  const takeBreak = () => screen.getByRole("button", { name: "Take a break" });

  it.each([
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
  ] as const)("is there and starts the child's break %s", (_, reach) => {
    const onTakeBreak = vi.fn();
    const onAnswered = vi.fn();
    mountWith({ onTakeBreak, onAnswered });
    reach();
    const answered = onAnswered.mock.calls.length;

    fireEvent.click(takeBreak());

    expect(onTakeBreak).toHaveBeenCalledOnce();
    // It answers nothing.
    expect(onAnswered).toHaveBeenCalledTimes(answered);
  });

  it("sits across from QUICK CHECK, in the frame's quiet navy words", () => {
    mount();

    const row = takeBreak().parentElement;
    expect(row?.textContent).toBe("Quick checkTake a break");
    expect(classes(row as Element)).toEqual(
      expect.arrayContaining(["flex", "items-center", "justify-between"]),
    );
    const own = classes(takeBreak());
    expect(own).toEqual(
      expect.arrayContaining([
        "text-[13px]",
        "font-medium",
        "text-nevo-navy",
        "cursor-pointer",
      ]),
    );
    expect(own).not.toContain("bg-nevo-navy");
    expect(own).not.toContain("w-full");
  });
});

describe("a spoken check (B16)", () => {
  it("offers its recording and keeps the printed question", () => {
    render(
      <QuickCheckSheet
        check={{ ...CHECK, promptAudio: "https://cdn.example/q.mp3" }}
        open
        onTapOut={() => {}}
        onAnswered={() => {}}
        onContinue={() => {}}
        onTakeBreak={() => {}}
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

describe("a miss (D93; 17d S1)", () => {
  it("offers nothing to press: no Try again, no See it explained, no save claimed", () => {
    mount();

    fireEvent.click(screen.getByRole("button", { name: "Oxygen" }));

    expect(screen.getByRole("status").textContent).toBe(RECOVERY_LINE);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
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
        onTapOut={() => {}}
        onAnswered={() => {}}
        onContinue={() => {}}
        onTakeBreak={() => {}}
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

  it("sets the line after a miss in the darker violet, as qc-recovery does, never soft violet on cream (D210)", () => {
    mount();

    fireEvent.click(screen.getByRole("button", { name: "Oxygen" }));

    const note = screen.getByRole("status");
    expect(note.className.split(" ")).toContain("text-nevo-violet-text");
    expect(note.className.split(" ")).not.toContain("text-nevo-violet");
  });
});

/**
 * SCRUM-275, LYDIA 22 OCT: "Two identical navy buttons is a defect, not a
 * choice. One primary per sheet and it is the action that progresses the
 * check." Since her 25 Oct ruling the way on after a right answer is the
 * Lesson Check frame's navy Continue (`qc-correct`), so each answer has its
 * one primary: Continue after a right answer. A miss has none at all - the
 * frame's `qc-recovery` gives way instead.
 */
const classes = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/);
/** A navy, full-width button: what only the primary may be. */
const navyFullWidth = () =>
  screen
    .getAllByRole("button")
    .filter(
      (b) => classes(b).includes("bg-nevo-navy") && classes(b).includes("w-full"),
    );
const continueButton = () => screen.getByRole("button", { name: "Continue" });
/** Any way on past the check: today's Continue, or the old Keep going. */
const wayOn = () =>
  screen.queryByRole("button", { name: /^(Continue|Keep going)$/ });

type Handlers = {
  open?: boolean;
  onTapOut?: () => void;
  onAnswered?: () => void;
  onContinue?: () => void;
  onTakeBreak?: () => void;
};
const sheet = (handlers: Handlers) => (
  <QuickCheckSheet
    check={CHECK}
    open={handlers.open ?? true}
    onTapOut={handlers.onTapOut ?? (() => {})}
    onAnswered={handlers.onAnswered ?? (() => {})}
    onContinue={handlers.onContinue ?? (() => {})}
    onTakeBreak={handlers.onTakeBreak ?? (() => {})}
  />
);
const mountWith = (handlers: Handlers) => render(sheet(handlers));

/*
 * NO MOVING ON PAST THE CHECK BEFORE A RIGHT ANSWER (Olayinka, 23 Oct, under
 * Lydia's gate ruling the same day; and 25 Oct: "the child shouldn't be able
 * to move with a wrong answer"). The way out is tapping out, back to the
 * section. A miss gives way to the section's other ways in, and Continue is the way on after a
 * right answer (Lydia, 25 Oct; the Lesson Check frame's `qc-correct`).
 */
describe("the way on (Olayinka, 23 and 25 Oct; Lydia, 25 Oct)", () => {
  it("is not there before any answer", () => {
    mountWith({});

    expect(wayOn()).toBeNull();
  });

  it("is not there after a miss, and nor is Try again", () => {
    const onContinue = vi.fn();
    mountWith({ onContinue });

    fireEvent.click(screen.getByRole("button", { name: "Oxygen" }));

    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(wayOn()).toBeNull();
    expect(onContinue).not.toHaveBeenCalled();
  });

  it("is the frame's Continue after a right answer, drawn once, and no Keep going", () => {
    const onContinue = vi.fn();
    mountWith({ onContinue });

    fireEvent.click(screen.getByRole("button", { name: "Carbon dioxide" }));
    expect(screen.getAllByRole("button", { name: "Continue" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Keep going" })).toBeNull();
    fireEvent.click(continueButton());

    expect(onContinue).toHaveBeenCalledOnce();
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

  it("has no button at all after a miss (qc-recovery)", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Oxygen" }));

    expect(navyFullWidth()).toEqual([]);
  });

  it("makes Continue the one primary after a right answer, navy and full width (Lydia, 25 Oct)", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Carbon dioxide" }));

    expect(navyFullWidth()).toEqual([continueButton()]);
    // Named on the button itself, not only in a child span.
    expect(continueButton().textContent).toBe("Continue");
  });
});

/*
 * SCRUM-282: A MISS IS THE FRAME'S `qc-recovery` (17d S1) - shipped ahead of
 * the gate (Lydia, 25 Oct), on every check (Olayinka, 26 Oct).
 */
describe("a miss, held and giving way (17d S1)", () => {
  const gatedSheet = (over: Partial<Parameters<typeof QuickCheckSheet>[0]> = {}) =>
    render(
      <QuickCheckSheet
        check={CHECK}
        open
        onTapOut={() => {}}
        onAnswered={() => {}}
        onContinue={() => {}}
        onTakeBreak={() => {}}
        {...over}
      />,
    );
  afterEach(() => vi.useRealTimers());

  it("holds the answer picked, says the frame's line, and offers no Try again", () => {
    gatedSheet();

    fireEvent.click(screen.getByRole("button", { name: "Oxygen" }));

    expect(screen.getByRole("status").textContent).toBe(RECOVERY_LINE);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(wayOn()).toBeNull();
    const held = screen.getByRole("button", { name: "Oxygen" });
    // Navy, like a pick held - not the violet of a miss - and no dot on it.
    expect(classes(held)).toContain("border-nevo-navy");
    expect(classes(held)).not.toContain("border-nevo-violet");
    expect(held.querySelector("svg, [data-answer-dot], span.rounded-full")).toBeNull();
    expect(document.body.textContent).not.toMatch(/not quite|wrong|incorrect/i);
  });

  it("gives way by itself once the line has been read - the system's move, not a tap-out", () => {
    vi.useFakeTimers();
    const onGiveWay = vi.fn();
    const onTapOut = vi.fn();
    gatedSheet({ onGiveWay, onTapOut });

    fireEvent.click(screen.getByRole("button", { name: "Oxygen" }));
    act(() => vi.advanceTimersByTime(GIVES_WAY_AFTER_MS - 1));
    expect(onGiveWay).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));

    expect(onGiveWay).toHaveBeenCalledOnce();
    expect(onTapOut).not.toHaveBeenCalled();
    // Asked afresh when it opens again.
    expect(screen.getByRole("button", { name: "Oxygen" })).toBeEnabled();
  });

  it("does not give way if the child has already tapped out", () => {
    vi.useFakeTimers();
    const onGiveWay = vi.fn();
    const { rerender } = gatedSheet({ onGiveWay });

    fireEvent.click(screen.getByRole("button", { name: "Oxygen" }));
    rerender(
      <QuickCheckSheet
        check={CHECK}
        open={false}
        onTapOut={() => {}}
        onAnswered={() => {}}
        onContinue={() => {}}
        onTakeBreak={() => {}}
        onGiveWay={onGiveWay}
      />,
    );
    act(() => vi.advanceTimersByTime(GIVES_WAY_AFTER_MS * 2));

    expect(onGiveWay).not.toHaveBeenCalled();
  });

  it("affirms a right answer as it always has, and never gives way after one", () => {
    vi.useFakeTimers();
    const onGiveWay = vi.fn();
    gatedSheet({ onGiveWay });

    fireEvent.click(screen.getByRole("button", { name: "Carbon dioxide" }));
    act(() => vi.advanceTimersByTime(GIVES_WAY_AFTER_MS * 2));

    expect(screen.getByRole("status").textContent).toBe(CHECK.correctNote);
    expect(continueButton()).toBeInTheDocument();
    expect(onGiveWay).not.toHaveBeenCalled();
  });

  it("never says the old \"Not quite\" with its Try again", () => {
    gatedSheet();

    fireEvent.click(screen.getByRole("button", { name: "Oxygen" }));

    expect(screen.getByRole("status").textContent).not.toBe(CHECK.recoveryNote);
    expect(document.body.textContent).not.toMatch(/not quite/i);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
});
