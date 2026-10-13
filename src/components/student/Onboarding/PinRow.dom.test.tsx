import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { PinCreationScreen, PinRow } from "./PinCreationScreen";

/**
 * D177 and D199 (13 Oct): "One box component, one filled treatment, every
 * screen it appears on: PIN creation, Change PIN, the PIN door." A filled box
 * is solid navy with a navy border and a cream dot; an empty one has a muted
 * navy border; and a wrong attempt recolours nothing - "the error is carried
 * by the error line, not by recolouring the boxes".
 *
 * `PinRow` is PIN creation's and Change PIN's row; the doors draw the same
 * `PinBox` and are pinned in their own tests. It drew near-black dots on cream
 * here, and turned the empty boxes violet after a miss.
 */

vi.setConfig({ testTimeout: 30_000 });

afterEach(cleanup);

const boxes = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>("[data-pin-box]"));

describe("a PIN row", () => {
  it("fills a box solid navy, with a cream dot, and leaves the rest muted navy", () => {
    const { container } = render(<PinRow filled={2} offset={0} caretAt={2} />);
    const [first, second, caret, empty] = boxes(container);

    for (const box of [first, second]) {
      expect(box.dataset.pinBox).toBe("filled");
      expect(box.className).toContain("bg-nevo-navy");
      expect(box.className).toContain("border-nevo-navy");
      expect(box.firstElementChild?.className).toContain("bg-nevo-cream");
    }
    // The next box to fill keeps its full navy border, on cream.
    expect(caret.dataset.pinBox).toBe("caret");
    expect(caret.className).toContain("bg-nevo-cream");
    expect(caret.firstElementChild).toBeNull();
    expect(empty.dataset.pinBox).toBe("empty");
    expect(empty.className).toContain("border-nevo-navy/30");
    expect(empty.className).not.toContain("near-black");
  });

  it("draws a full row filled, on the second row as on the first", () => {
    // The confirmation row is the second half of the same digits.
    const { container } = render(<PinRow filled={8} offset={4} caretAt={8} />);

    for (const box of boxes(container)) {
      expect(box.dataset.pinBox).toBe("filled");
    }
  });
});

describe("PIN creation after the two rows did not match", () => {
  it("says so in the line, and recolours no box", async () => {
    const { container } = render(<PinCreationScreen onComplete={() => {}} />);

    for (const key of "12345678") {
      await act(async () => {
        fireEvent.keyDown(window, { key });
      });
    }

    expect(container.textContent).toContain(
      "Those didn't match - let's try once more",
    );
    const drawn = boxes(container);
    expect(drawn).toHaveLength(8);
    for (const box of drawn) expect(box.className).not.toMatch(/violet|grey/);
    // The first PIN is kept, filled; the second row is empty again.
    expect(drawn.slice(0, 4).every((b) => b.dataset.pinBox === "filled")).toBe(
      true,
    );
  });
});
