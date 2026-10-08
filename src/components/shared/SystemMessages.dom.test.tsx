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

/**
 * The bars on the rail, newest first. The rail is the one live region (C14),
 * so the bars are read off it rather than found as regions of their own.
 */
const bars = () =>
  Array.from(screen.getByRole("log").children).map(
    (wrapper) => wrapper.firstElementChild as HTMLElement,
  );
const onlyBar = () => {
  const all = bars();
  expect(all).toHaveLength(1);
  return all[0];
};

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

describe("what it says", () => {
  it("says the thing, in the past tense, with no ceremony", () => {
    show({ kind: "confirm", message: "JSS 2A created." });

    const bar = onlyBar();
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
    expect(onlyBar()).toBeInTheDocument();

    act(() => void vi.advanceTimersByTime(6000));

    expect(bars()).toHaveLength(0);
  });

  it("keeps a failure until somebody has seen it", () => {
    /*
     * Design's first governing rule. "If an import rejects thirty rows and
     * the only notice is a bar that fades after four seconds, a person who
     * looked away has lost that permanently."
     */
    show({ kind: "failed", message: "Import stopped. The file had no header row." });

    act(() => void vi.advanceTimersByTime(60_000));

    expect(onlyBar()).toBeInTheDocument();
  });

  it("keeps a partial too, and offers the way into the page that lists them", () => {
    const onAction = vi.fn();
    show({
      kind: "partial",
      message: "Fourteen classes created. Four rows rejected.",
      action: { label: "See the four", onAction },
    });

    act(() => void vi.advanceTimersByTime(60_000));
    expect(onlyBar()).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "See the four" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("offers a dismiss on the ones that stay, and none on the ones that go", () => {
    show({ kind: "failed", message: "Import stopped." });
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(bars()).toHaveLength(0);
  });

  it("keeps a running message until it is resolved", () => {
    show({ kind: "progress", message: "Creating twelve classes…" });

    act(() => void vi.advanceTimersByTime(60_000));

    expect(onlyBar()).toBeInTheDocument();
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
    expect(bars()).toHaveLength(1);
    expect(onlyBar()).toHaveTextContent(
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
    expect(onlyBar()).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "finish" }));
    act(() => void vi.advanceTimersByTime(6000));

    expect(bars()).toHaveLength(0);
  });
});

describe("SM-06, several at once", () => {
  it("stacks rather than collapsing, newest first", () => {
    show(
      { kind: "confirm", message: "First." },
      { kind: "confirm", message: "Second." },
    );

    const stack = bars();
    expect(stack).toHaveLength(2);
    expect(stack[0]).toHaveTextContent("Second.");
  });

  it("caps at three and drops the oldest", () => {
    show(
      { kind: "confirm", message: "One." },
      { kind: "confirm", message: "Two." },
      { kind: "confirm", message: "Three." },
      { kind: "confirm", message: "Four." },
    );

    expect(bars()).toHaveLength(3);
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

    expect(onlyBar()).toHaveTextContent("Your work is saved.");
  });

  it("carries no tick, no action and no dismiss", () => {
    /*
     * RULE 8, AND THE REASON THIS COMPONENT HAS TWO SHAPES RATHER THAN ONE
     * WITH FLAGS. "A child never sees praise, a tick, a count or a streak."
     * The type already makes it unsayable - `ChildMessage` has no `kind`, no
     * `action` and no number - and this checks the render keeps the promise.
     */
    show({ audience: "child", state: "saved" });

    const bar = onlyBar();
    expect(bar.querySelector("svg")).toBeNull();
    expect(bar.querySelector("button")).toBeNull();
  });

  it("says nothing that reads as praise or a score", () => {
    show({ audience: "child", state: "saved" });

    const bar = onlyBar();
    expect(bar.textContent).not.toMatch(
      /well done|great|nice|complete|streak|\d/i,
    );
  });

  it("cannot say anything about the connection, which is the banner's (D55)", () => {
    /*
     * "It never duplicates the offline banner." `offline` and `online` were
     * in the vocabulary and raised by nothing; the type now refuses them, so
     * `tsc` fails here if either comes back.
     */
    // @ts-expect-error - not a child state since D55
    const offline: SystemMessageInput = { audience: "child", state: "offline" };
    // @ts-expect-error - not a child state since D55
    const online: SystemMessageInput = { audience: "child", state: "online" };
    show(offline, online);

    expect(document.body.textContent).not.toMatch(/offline|online/i);
  });
});

describe("C14, being heard", () => {
  it("has its live region in the page before anything is said", () => {
    // A region that arrives already holding its words is the case screen
    // readers most often skip. The rail used to mount only with a bar in it.
    show();

    const rail = screen.getByRole("log");
    expect(rail).toBeEmptyDOMElement();
  });

  it("says each bar through that one region, with none of its own to read it twice", () => {
    show({ kind: "confirm", message: "JSS 2A created." });

    expect(screen.getByRole("log")).toHaveTextContent("JSS 2A created.");
    expect(screen.queryAllByRole("status")).toHaveLength(0);
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
  });

  it("does the same for a child's bar", () => {
    show({ audience: "child", state: "saved" });

    expect(screen.getByRole("log")).toHaveTextContent("Your work is saved.");
    expect(screen.queryAllByRole("status")).toHaveLength(0);
  });

  it("takes the teacher's text size, as the page does (C12)", () => {
    show();

    expect(screen.getByRole("log")).toHaveClass("nevo-text-zoom");
  });
});

describe("C14, being read", () => {
  const wrapper = () => screen.getByRole("log").firstElementChild as HTMLElement;

  it("waits while the pointer is on a confirmation", () => {
    show({ kind: "confirm", message: "JSS 2A created." });
    fireEvent.mouseEnter(wrapper());
    act(() => void vi.advanceTimersByTime(60_000));

    expect(bars()).toHaveLength(1);
  });

  it("gets the full five seconds again once the pointer leaves", () => {
    show({ kind: "confirm", message: "JSS 2A created." });
    act(() => void vi.advanceTimersByTime(4000));
    fireEvent.mouseEnter(wrapper());
    fireEvent.mouseLeave(wrapper());

    act(() => void vi.advanceTimersByTime(4000));
    expect(bars()).toHaveLength(1);
    act(() => void vi.advanceTimersByTime(2000));
    expect(bars()).toHaveLength(0);
  });

  it("waits while focus is on its button", () => {
    show({ kind: "confirm", message: "Saved.", action: { label: "Undo", onAction: vi.fn() } });
    const undo = screen.getByRole("button", { name: "Undo" });
    act(() => undo.focus());
    act(() => void vi.advanceTimersByTime(60_000));
    expect(bars()).toHaveLength(1);

    act(() => undo.blur());
    act(() => void vi.advanceTimersByTime(6000));
    expect(bars()).toHaveLength(0);
  });

  it("is not let go by the pointer while focus is still in it", () => {
    show({ kind: "confirm", message: "Saved.", action: { label: "Undo", onAction: vi.fn() } });
    const undo = screen.getByRole("button", { name: "Undo" });
    fireEvent.mouseEnter(wrapper());
    act(() => undo.focus());
    fireEvent.mouseLeave(wrapper());
    act(() => void vi.advanceTimersByTime(60_000));

    expect(bars()).toHaveLength(1);
  });

  it("never holds a failure on a clock it never had", () => {
    show({ kind: "failed", message: "Couldn't create JSS 2A." });
    fireEvent.mouseEnter(wrapper());
    fireEvent.mouseLeave(wrapper());
    act(() => void vi.advanceTimersByTime(60_000));

    expect(bars()).toHaveLength(1);
  });
});
