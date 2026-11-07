import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { QuickCheckSheet, RECOVERY_LINE, RETEACH_COPY } from "./QuickCheckSheet";
import type { ReteachingResponse } from "@/lib/api/lessons";
import type { Verdict } from "@/lib/lessons/verdict";
import type { QuickCheck } from "@/lib/types";

/**
 * TEST 9 IN THE SHEET: it moves on the mark its host gives back, never on the
 * check's own key, and holds the pick quietly until that mark lands. Each
 * case makes the host disagree with the key, which is the only way to tell
 * whose mark the sheet moved on.
 */

/** The sheet's own close, as Radix would call it on a tap out. */
const root = vi.hoisted(() => ({
  onOpenChange: undefined as undefined | ((open: boolean) => void),
}));
vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({
    children,
    onOpenChange,
  }: {
    children: ReactNode;
    onOpenChange?: (open: boolean) => void;
  }) => {
    root.onOpenChange = onOpenChange;
    return <>{children}</>;
  },
  SheetContent: ({ children }: { children: ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

afterEach(cleanup);

const CHECK: QuickCheck = {
  id: "cp-1",
  question: "Which gas do plants take in?",
  options: [
    { id: "o2", label: "Oxygen" },
    { id: "co2", label: "Carbon dioxide" },
  ],
  // The key says carbon dioxide.
  correctId: "co2",
  correctNote: "Yes - carbon dioxide.",
  recoveryNote: "Not quite.",
  explanation: "Plants take in carbon dioxide.",
  holds: true,
};

const RETEACHING: ReteachingResponse = {
  questionId: "cp-1",
  segmentId: "seg-1",
  availableRoutes: [],
  recommendedRoute: { action: "slower", label: "Take it more slowly" },
  screens: ["Picture a leaf in the sun."],
};

/** A mark the test lands when it chooses. */
function pending() {
  let land: (mark: Verdict) => void = () => {};
  const reply = new Promise<Verdict>((resolve) => {
    land = resolve;
  });
  return { reply, land: (mark: Verdict) => act(async () => land(mark)) };
}

type Props = ComponentProps<typeof QuickCheckSheet>;
const mount = (onAnswered: Props["onAnswered"], over: Partial<Props> = {}) => {
  const props = {
    check: CHECK,
    open: true,
    onTapOut: vi.fn(),
    onAnswered: vi.fn(onAnswered),
    onContinue: vi.fn(),
    onTakeBreak: vi.fn(),
    onGiveWay: vi.fn(),
    ...over,
  };
  const view = render(<QuickCheckSheet {...props} />);
  return { props, view };
};

const tapOption = (label: string) =>
  fireEvent.click(screen.getByRole("button", { name: label }));
const wayOn = () => screen.queryByRole("button", { name: "Continue" });

describe("the sheet moves on its host's mark, never the key's", () => {
  it("holds a pick the key calls right when the mark says wrong", () => {
    mount(() => false);
    tapOption("Carbon dioxide");

    expect(wayOn()).toBeNull();
    expect(screen.getByText(RECOVERY_LINE)).toBeInTheDocument();
    expect(screen.queryByText(CHECK.correctNote)).toBeNull();
  });

  it("passes a pick the key calls wrong when the mark says right", () => {
    mount(() => true);
    tapOption("Oxygen");

    expect(screen.getByText(CHECK.correctNote)).toBeInTheDocument();
    expect(wayOn()).toBeInTheDocument();
  });

  it("offers the way on and says nothing for a pick that could not be marked", () => {
    mount(() => null);
    tapOption("Oxygen");

    expect(wayOn()).toBeInTheDocument();
    expect(screen.queryByText(CHECK.correctNote)).toBeNull();
    expect(screen.queryByText(RECOVERY_LINE)).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("while the mark is on its way", () => {
  it("holds the pick, says nothing, offers nothing, and takes no second pick", async () => {
    const mark = pending();
    const { props } = mount(() => mark.reply);
    const before = document.body.textContent;
    tapOption("Carbon dioxide");

    // No new words, no way on, no spinner: the text is what it was.
    expect(document.body.textContent).toBe(before);
    expect(wayOn()).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
    // The pick is held - navy - and the other is not.
    expect(
      screen.getByRole("button", { name: "Carbon dioxide" }).className,
    ).toContain("navy");
    tapOption("Oxygen");
    expect(props.onAnswered).toHaveBeenCalledOnce();

    await mark.land(true);
    expect(wayOn()).toBeInTheDocument();
  });

  it("lets a mark for a pick since tapped out of land nowhere", async () => {
    const mark = pending();
    const { props, view } = mount(() => mark.reply);
    tapOption("Carbon dioxide");

    // Tapped out before the mark came; the check is asked afresh.
    act(() => root.onOpenChange?.(false));
    expect(props.onTapOut).toHaveBeenCalledOnce();
    view.rerender(<QuickCheckSheet {...props} open={false} />);
    view.rerender(<QuickCheckSheet {...props} open />);
    await mark.land(true);

    expect(wayOn()).toBeNull();
    expect(screen.queryByText(CHECK.correctNote)).toBeNull();
  });
});

describe("the re-teach box's retry", () => {
  it("is held on Check until its mark lands, and takes no second Check", async () => {
    const retry = pending();
    const marks: (Verdict | Promise<Verdict>)[] = [false, retry.reply];
    const { props } = mount(() => marks.shift() ?? null, {
      reteaching: RETEACHING,
    });
    tapOption("Oxygen");
    expect(screen.getByText(RETEACH_COPY.title)).toBeInTheDocument();

    tapOption("Carbon dioxide");
    fireEvent.click(screen.getByRole("button", { name: RETEACH_COPY.check }));
    expect(screen.getByText(RETEACH_COPY.title)).toBeInTheDocument();
    expect(screen.queryByText(RETEACH_COPY.done)).toBeNull();
    expect(
      screen.getByRole("button", { name: RETEACH_COPY.check }),
    ).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByRole("button", { name: RETEACH_COPY.check }));
    expect(props.onAnswered).toHaveBeenCalledTimes(2);

    await retry.land(true);
    expect(screen.getByText(RETEACH_COPY.done)).toBeInTheDocument();
  });

  it("follows the mark, not the key: a retry the key calls right, marked wrong, is not right", () => {
    mount(() => false, { reteaching: RETEACHING });
    tapOption("Oxygen");
    tapOption("Carbon dioxide");
    fireEvent.click(screen.getByRole("button", { name: RETEACH_COPY.check }));

    expect(screen.queryByText(RETEACH_COPY.done)).toBeNull();
    expect(screen.getByText(RETEACH_COPY.again)).toBeInTheDocument();
  });
});
