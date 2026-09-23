import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { SystemMessagesProvider, useSystemMessages } from "./SystemMessages";
import { spellCount, type SystemMessageInput } from "./SystemMessage";

/**
 * SCRUM-152, SM-01 to SM-07.
 *
 * "Every action in the product currently completes in silence." The two rules
 * that govern the whole thing are design's, and both are here as assertions
 * rather than as comments:
 *
 * 1. A system message is NEVER THE ONLY PLACE a failure is recorded - so a
 *    failure stays until someone dismisses it, and a partial carries a way
 *    into the page that lists the rows.
 * 2. NO CELEBRATORY MESSAGE ever appears on a child's screen. No praise, no
 *    tick, no count, no streak. That is rule 8 of the architecture, and the
 *    type makes the wrong thing unsayable - the tests below check the type's
 *    promise is kept in the render too.
 */

function Harness({ messages }: { messages: SystemMessageInput[] }) {
  const say = useSystemMessages();
  return (
    <button type="button" onClick={() => messages.forEach((m) => say.show(m))}>
      go
    </button>
  );
}

const show = (...messages: SystemMessageInput[]) => {
  render(
    <SystemMessagesProvider>
      <Harness messages={messages} />
    </SystemMessagesProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "go" }));
};

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

describe("what it says", () => {
  it("says the thing, in the past tense, with no ceremony", () => {
    show({ kind: "confirm", message: "JSS 2A created." });

    const bar = screen.getByRole("status");
    expect(bar).toHaveTextContent("JSS 2A created.");
    // Design names all three: no "Success", no "successfully", no "!".
    expect(bar.textContent).not.toMatch(/success/i);
    expect(bar.textContent).not.toMatch(/!/);
  });

  it("spells the number rather than badging it", () => {
    // SM-02 "settles the number's treatment once", and the frame's own
    // examples run to fourteen - so it is not the usual spell-to-twelve.
    expect(spellCount(4)).toBe("Four");
    expect(spellCount(12)).toBe("Twelve");
    expect(spellCount(14)).toBe("Fourteen");
    expect(spellCount(20)).toBe("Twenty");
  });

  it("stops spelling where a figure reads better", () => {
    // Twenty is MY reading, raised on the ticket: "one hundred and forty
    // seven classes created" is worse than "147", and an import that size is
    // where a person wants the digits.
    expect(spellCount(21)).toBe("21");
    expect(spellCount(147)).toBe("147");
  });
});

describe("what leaves and what stays", () => {
  it("lets a confirmation go on its own", () => {
    show({ kind: "confirm", message: "JSS 2A created." });
    expect(screen.getByRole("status")).toBeInTheDocument();

    act(() => void vi.advanceTimersByTime(6000));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps a failure until somebody has seen it", () => {
    /*
     * Design's first governing rule. "If an import rejects thirty rows and
     * the only notice is a bar that fades after four seconds, a person who
     * looked away has lost that permanently."
     */
    show({ kind: "failed", message: "Import stopped. The file had no header row." });

    act(() => void vi.advanceTimersByTime(60_000));

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("keeps a partial too, and offers the way into the page that lists them", () => {
    const onAction = vi.fn();
    show({
      kind: "partial",
      message: "Fourteen classes created. Four rows rejected.",
      action: { label: "See the four", onAction },
    });

    act(() => void vi.advanceTimersByTime(60_000));
    expect(screen.getByRole("status")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "See the four" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("offers a dismiss on the ones that stay, and none on the ones that go", () => {
    show({ kind: "failed", message: "Import stopped." });
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps a running message until it is resolved", () => {
    show({ kind: "progress", message: "Creating twelve classes…" });

    act(() => void vi.advanceTimersByTime(60_000));

    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

describe("SM-05, resolving in place", () => {
  it("turns the running bar into the finished one without a second bar", () => {
    function Resolver() {
      const say = useSystemMessages();
      return (
        <button
          type="button"
          onClick={() => {
            const id = say.show({
              kind: "progress",
              message: "Creating twelve classes…",
            });
            say.resolve(id, {
              kind: "count",
              message: "Twelve classes created.",
            });
          }}
        >
          go
        </button>
      );
    }
    render(
      <SystemMessagesProvider>
        <Resolver />
      </SystemMessagesProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "go" }));

    // ONE bar, carrying the finished words. "It never vanishes and gets
    // replaced by a second bar."
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Twelve classes created.",
    );
  });

  it("starts the leaving clock only once it has something finished to say", () => {
    function Resolver() {
      const say = useSystemMessages();
      return (
        <>
          <button
            type="button"
            onClick={() =>
              say.show({ kind: "progress", message: "Creating…" })
            }
          >
            start
          </button>
          <button type="button" onClick={() => say.resolve(1, { kind: "confirm", message: "Done." })}>
            finish
          </button>
        </>
      );
    }
    render(
      <SystemMessagesProvider>
        <Resolver />
      </SystemMessagesProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "start" }));
    act(() => void vi.advanceTimersByTime(60_000));
    expect(screen.getByRole("status")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "finish" }));
    act(() => void vi.advanceTimersByTime(6000));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("SM-06, several at once", () => {
  it("stacks rather than collapsing, newest first", () => {
    show(
      { kind: "confirm", message: "First." },
      { kind: "confirm", message: "Second." },
    );

    const bars = screen.getAllByRole("status");
    expect(bars).toHaveLength(2);
    expect(bars[0]).toHaveTextContent("Second.");
  });

  it("caps at three and drops the oldest", () => {
    show(
      { kind: "confirm", message: "One." },
      { kind: "confirm", message: "Two." },
      { kind: "confirm", message: "Three." },
      { kind: "confirm", message: "Four." },
    );

    expect(screen.getAllByRole("status")).toHaveLength(3);
    expect(screen.queryByText("One.")).not.toBeInTheDocument();
  });

  it("does not let a success bury a failure", () => {
    /*
     * The reason design chose stacking: "a single count could hide a failure
     * behind a success." Three confirmations after a failure would, on a
     * newest-first cap, push it out - so the failure is the thing that has to
     * survive a busy moment.
     */
    show(
      { kind: "failed", message: "Import stopped." },
      { kind: "confirm", message: "One." },
      { kind: "confirm", message: "Two." },
    );

    expect(screen.getByText("Import stopped.")).toBeInTheDocument();
  });
});

describe("SM-07, a child's screen", () => {
  it("says the factual state and nothing else", () => {
    show({ audience: "child", state: "saved" });

    expect(screen.getByRole("status")).toHaveTextContent("Your work is saved.");
  });

  it("carries no tick, no action and no dismiss", () => {
    /*
     * RULE 8, AND THE REASON THIS COMPONENT HAS TWO SHAPES RATHER THAN ONE
     * WITH FLAGS. "A child never sees praise, a tick, a count or a streak."
     * The type already makes it unsayable - `ChildMessage` has no `kind`, no
     * `action` and no number - and this checks the render keeps the promise.
     */
    show({ audience: "child", state: "saved" });

    const bar = screen.getByRole("status");
    expect(bar.querySelector("svg")).toBeNull();
    expect(bar.querySelector("button")).toBeNull();
  });

  it("says nothing that reads as praise or a score", () => {
    show({ audience: "child", state: "online" });

    const bar = screen.getByRole("status");
    expect(bar.textContent).not.toMatch(
      /well done|great|nice|complete|streak|\d/i,
    );
  });
});
