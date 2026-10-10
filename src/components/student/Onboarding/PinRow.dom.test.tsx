import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { PinRow } from "./PinCreationScreen";

/**
 * D132 (8 Oct): "navy borders on filled PIN boxes. Both screens, not just
 * Change PIN. It is the same component doing the same job, and a PIN box that
 * behaves differently on two screens is a defect rather than a distinction."
 *
 * `PinRow` is that one component, on PIN creation and on Change PIN. Frame 27
 * draws a filled box with the navy border; only the caret's box had it here.
 */

afterEach(cleanup);

const boxes = (container: HTMLElement) =>
  Array.from(container.firstElementChild!.children) as HTMLElement[];

describe("a PIN row", () => {
  it("keeps the navy border on every filled box, as frame 27 draws it", () => {
    const { container } = render(
      <PinRow filled={2} offset={0} caretAt={2} error={false} />,
    );
    const [first, second, caret, empty] = boxes(container);

    expect(first.className).toContain("border-nevo-navy");
    expect(second.className).toContain("border-nevo-navy");
    expect(caret.className).toContain("border-nevo-navy");
    expect(empty.className).toContain("border-nevo-near-black/20");
    expect(empty.className).not.toContain("border-nevo-navy");
  });

  it("draws a full row navy, on the second row as on the first", () => {
    // The confirmation row is the second half of the same digits.
    const { container } = render(
      <PinRow filled={8} offset={4} caretAt={8} error={false} />,
    );

    for (const box of boxes(container)) {
      expect(box.className).toContain("border-nevo-navy");
    }
  });

  it("still marks an empty row the child got wrong in violet", () => {
    const { container } = render(
      <PinRow filled={4} offset={4} caretAt={4} error />,
    );
    const [caret, ...rest] = boxes(container);

    expect(caret.className).toContain("border-nevo-navy");
    for (const box of rest) {
      expect(box.className).toContain("border-nevo-violet");
    }
  });
});
