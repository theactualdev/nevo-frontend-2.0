import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AfterLessonAssessment } from "./AfterLessonAssessment";
import {
  MARK_WAIT_LINE,
  SEND_AGAIN,
  SLOW_MARK_MS,
  type PendingVerdict,
  type Verdict,
} from "@/lib/lessons/verdict";
import type { Assessment } from "@/lib/types";

/**
 * TEST 9 IN THE END-OF-LESSON QUESTIONS: a confirmed answer moves on the
 * mark its host gives back - its recovery note on a miss, the next question
 * otherwise - never on the question's own key, and is held quietly until
 * that mark lands.
 */

afterEach(cleanup);

const question = (n: number) => ({
  prompt: `Question ${n}?`,
  options: [
    { id: "a", label: "Key says right" },
    { id: "b", label: "Key says wrong" },
  ],
  correctId: "a",
  recoveryNote: `Here is how ${n} works.`,
});

const ASSESSMENT: Assessment = { questions: [question(1), question(2)] };

const mount = (
  onAnswer: (r: { selectedId: string }) => Verdict | Promise<Verdict>,
) => {
  const spy = vi.fn(onAnswer);
  render(
    <AfterLessonAssessment
      assessment={ASSESSMENT}
      onFinish={() => {}}
      onAnswer={spy}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  return spy;
};
const confirm = (label: string) => {
  fireEvent.click(screen.getByRole("button", { name: label }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
};
const onQuestion = (n: number) =>
  expect(screen.getByText(`Question ${n}?`)).toBeInTheDocument();

describe("the end-of-lesson questions move on their host's mark", () => {
  it("show the recovery note for a pick the key calls right, marked wrong", () => {
    mount(() => false);
    confirm("Key says right");

    onQuestion(1);
    expect(screen.getByText("Here is how 1 works.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next question" })).toBeInTheDocument();
  });

  it("go on past a pick the key calls wrong, marked right", () => {
    mount(() => true);
    confirm("Key says wrong");

    onQuestion(2);
    expect(screen.queryByText("Here is how 1 works.")).toBeNull();
  });

  it("go on past a pick the server could not mark, saying nothing about it", () => {
    mount(() => null);
    confirm("Key says wrong");

    onQuestion(2);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("hold the pick quietly while its mark is on its way, and take no second confirm", async () => {
    let land: (mark: Verdict) => void = () => {};
    const spy = mount(
      () =>
        new Promise<Verdict>((resolve) => {
          land = resolve;
        }),
    );
    confirm("Key says right");

    onQuestion(1);
    expect(screen.queryByRole("status")).toBeNull();
    // Another pick, and Next again, do nothing while it is marked.
    confirm("Key says wrong");
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ selectedId: "a" }),
    );

    await act(async () => land(false));
    expect(screen.getByText("Here is how 1 works.")).toBeInTheDocument();
  });
});

/** A reply that never lands on its own, can be sent again, and can fail. */
function failingReply() {
  const reply: PendingVerdict = new Promise<Verdict>(() => {});
  const listeners = new Set<() => void>();
  reply.retry = vi.fn();
  reply.onFailure = (listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const fail = () =>
    act(() => {
      for (const hear of [...listeners]) hear();
    });
  return { reply, fail };
}

describe("the wait for a mark (SCRUM-315; Lydia, 9 Nov, restated 10 Nov)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the pick pressable, says her line past two seconds, and never retries on a timer", () => {
    vi.useFakeTimers();
    const { reply } = failingReply();
    mount(() => reply);
    confirm("Key says right");

    expect(screen.getByRole("button", { name: "Key says right" })).toBeEnabled();
    expect(screen.queryByText(MARK_WAIT_LINE)).toBeNull();
    act(() => {
      vi.advanceTimersByTime(SLOW_MARK_MS);
    });
    expect(screen.getByText(MARK_WAIT_LINE)).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(SLOW_MARK_MS * 30);
    });
    expect(screen.queryByRole("button", { name: SEND_AGAIN })).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("offers Send again on a real failure, which sends the same answer again", async () => {
    vi.useFakeTimers();
    const { reply, fail } = failingReply();
    mount(() => reply);
    confirm("Key says right");

    await fail();
    expect(screen.queryByText(MARK_WAIT_LINE)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: SEND_AGAIN }));

    expect(reply.retry).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: SEND_AGAIN })).toBeNull();
  });
});
