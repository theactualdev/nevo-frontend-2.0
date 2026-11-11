import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { QuickCheckSheet, RECOVERY_LINE, RETEACH_COPY } from "./QuickCheckSheet";
import type { ReteachingResponse } from "@/lib/api/lessons";
import {
  MARK_WAIT_LINE,
  SEND_AGAIN,
  SLOW_MARK_MS,
  type PendingVerdict,
  type Verdict,
} from "@/lib/lessons/verdict";
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
    // Pressable while marked (SCRUM-315): never reads as disabled, and a
    // second Check does nothing.
    expect(
      screen.getByRole("button", { name: RETEACH_COPY.check }),
    ).toHaveAttribute("aria-disabled", "false");
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

/**
 * SCRUM-315 (Lydia, 7 Nov): the pick holds visibly chosen and the control
 * stays PRESSABLE - never disabled - with no spinner, no progress and no
 * verdict before the server's. Her 9 Nov rulings, restated 10 Nov: past
 * about two seconds, one neutral line about the system, "Nevo has your answer
 * and is still working."; and the retry "appears only on a real failure
 * rather than on a timer", reading "Send again".
 */
describe("a pick held for its mark (SCRUM-315)", () => {
  /** A reply on its way that can be sent again, and can fail, as the player's. */
  function retryable() {
    let land: (mark: Verdict) => void = () => {};
    const reply: PendingVerdict = new Promise<Verdict>((resolve) => {
      land = resolve;
    });
    const listeners = new Set<() => void>();
    let failing = false;
    reply.retry = vi.fn(() => {
      failing = false;
    });
    reply.onFailure = (listener) => {
      listeners.add(listener);
      if (failing) listener();
      return () => {
        listeners.delete(listener);
      };
    };
    return {
      reply,
      land: (mark: Verdict) => act(async () => land(mark)),
      fail: () =>
        act(() => {
          failing = true;
          for (const hear of [...listeners]) hear();
        }),
    };
  }

  const line = () => screen.queryByText(MARK_WAIT_LINE);
  const sendAgain = () => screen.queryByRole("button", { name: SEND_AGAIN });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps every option pressable: none reads as disabled", () => {
    const mark = retryable();
    mount(() => mark.reply);
    tapOption("Carbon dioxide");

    for (const label of ["Carbon dioxide", "Oxygen"]) {
      expect(screen.getByRole("button", { name: label })).toBeEnabled();
      expect(screen.getByRole("button", { name: label })).not.toHaveAttribute(
        "aria-disabled",
        "true",
      );
    }
    // The pick is the one held, visibly.
    expect(
      screen.getByRole("button", { name: "Carbon dioxide" }).className,
    ).toContain("border-nevo-navy");
    expect(
      screen.getByRole("button", { name: "Oxygen" }).className,
    ).not.toContain("border-nevo-navy");
  });

  it("says nothing for about two seconds, then her one neutral line, and offers nothing", () => {
    vi.useFakeTimers();
    const mark = retryable();
    mount(() => mark.reply);
    const before = document.body.textContent;
    tapOption("Carbon dioxide");

    act(() => {
      vi.advanceTimersByTime(SLOW_MARK_MS - 1);
    });
    expect(line()).toBeNull();
    expect(document.body.textContent).toBe(before);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(line()).toBeInTheDocument();
    // Her words exactly, and nothing else: no verdict, no way on, no retry.
    expect(document.body.textContent).toBe(`${before}${MARK_WAIT_LINE}`);
    expect(sendAgain()).toBeNull();
    expect(wayOn()).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("is read out when it comes: the line lands in a polite live region", () => {
    vi.useFakeTimers();
    const mark = retryable();
    mount(() => mark.reply);
    tapOption("Carbon dioxide");
    // The region is there, empty, from the pick - so what lands in it is heard.
    const region = document.querySelector("[data-mark-wait-slot]");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toBeEmptyDOMElement();

    act(() => {
      vi.advanceTimersByTime(SLOW_MARK_MS);
    });
    expect(region).toContainElement(line());
  });

  it("never offers a retry on a timer, however long the wait", () => {
    vi.useFakeTimers();
    const mark = retryable();
    mount(() => mark.reply);
    tapOption("Carbon dioxide");

    act(() => {
      vi.advanceTimersByTime(SLOW_MARK_MS * 60);
    });
    expect(sendAgain()).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(line()).toBeInTheDocument();
  });

  it("offers Send again, in the line's place, once the send has really failed", async () => {
    vi.useFakeTimers();
    const mark = retryable();
    mount(() => mark.reply);
    tapOption("Carbon dioxide");
    act(() => {
      vi.advanceTimersByTime(SLOW_MARK_MS);
    });

    await mark.fail();

    expect(sendAgain()).toBeInTheDocument();
    // "Still working" is not true of a send that failed.
    expect(line()).toBeNull();
    expect(wayOn()).toBeNull();
    // Secondary, never the way on.
    expect(sendAgain()).toHaveAttribute("data-variant", "secondary");
  });

  it("offers it at once on a failure inside the two seconds, with no line first", async () => {
    vi.useFakeTimers();
    const mark = retryable();
    mount(() => mark.reply);
    tapOption("Carbon dioxide");

    await mark.fail();

    expect(sendAgain()).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(SLOW_MARK_MS);
    });
    expect(line()).toBeNull();
  });

  it("sends the same answer again on Send again, and is a new, quiet hold from there", async () => {
    vi.useFakeTimers();
    const mark = retryable();
    const { props } = mount(() => mark.reply);
    tapOption("Carbon dioxide");
    await mark.fail();

    fireEvent.click(screen.getByRole("button", { name: SEND_AGAIN }));

    expect(mark.reply.retry).toHaveBeenCalledOnce();
    // The same answer, not a new one: the host's retry sends it.
    expect(props.onAnswered).toHaveBeenCalledOnce();
    expect(sendAgain()).toBeNull();
    expect(line()).toBeNull();
    act(() => {
      vi.advanceTimersByTime(SLOW_MARK_MS);
    });
    expect(line()).toBeInTheDocument();
    expect(sendAgain()).toBeNull();

    // And again, only if this send fails too.
    await mark.fail();
    expect(sendAgain()).toBeInTheDocument();
  });

  it("goes as the mark lands, the line with it", async () => {
    vi.useFakeTimers();
    const mark = retryable();
    mount(() => mark.reply);
    tapOption("Carbon dioxide");
    act(() => {
      vi.advanceTimersByTime(SLOW_MARK_MS);
    });

    await mark.land(true);

    expect(line()).toBeNull();
    expect(sendAgain()).toBeNull();
    expect(wayOn()).toBeInTheDocument();
  });

  it("offers nothing to send where the reply reports no failure", () => {
    vi.useFakeTimers();
    mount(() => new Promise<Verdict>(() => {}));
    tapOption("Carbon dioxide");
    act(() => {
      vi.advanceTimersByTime(SLOW_MARK_MS * 30);
    });

    expect(sendAgain()).toBeNull();
    expect(line()).toBeInTheDocument();
  });

  it("waits the same way on the re-teach box's retry, under Check", async () => {
    vi.useFakeTimers();
    const retry = retryable();
    const marks: (Verdict | PendingVerdict)[] = [false, retry.reply];
    mount(() => marks.shift() ?? null, { reteaching: RETEACHING });
    tapOption("Oxygen");
    tapOption("Carbon dioxide");
    fireEvent.click(screen.getByRole("button", { name: RETEACH_COPY.check }));
    act(() => {
      vi.advanceTimersByTime(SLOW_MARK_MS);
    });
    expect(line()).toBeInTheDocument();

    await retry.fail();
    fireEvent.click(screen.getByRole("button", { name: SEND_AGAIN }));
    expect(retry.reply.retry).toHaveBeenCalledOnce();
  });
});
