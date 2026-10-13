import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NevoKeyboard } from "./NevoKeyboard";

/**
 * THE PAD THAT SITS IN THE SCREEN RATHER THAN SLIDING UP OVER IT.
 *
 * Design's keyboard frame added a `presentation` prop: *"docked (default):
 * full-width tray that slides up from the bottom, the keyboard metaphor.
 * block: a compact, content-sized grid with no tray band, for a single numeric
 * field (e.g. a child's PIN) sat inside a layout rather than docked."*
 *
 * The distinction matters most on the PIN unlock, where the tray was summoned
 * by focusing a hidden input: four boxes with nothing beneath them, and a child
 * had to tap the screen before they could see how to answer it. A pad that is
 * simply part of the screen cannot be missed and cannot cover the boxes it
 * fills.
 *
 * These pin the contract rather than the pixels: same keys, same handlers, no
 * tray chrome, and docked unchanged for every caller that did not ask.
 */

const noop = () => {};

const digits = () =>
  screen
    .getAllByRole("button")
    .map((b) => b.textContent?.trim())
    .filter((t) => t && /^[0-9]$/.test(t));

afterEach(() => {
  cleanup();
});

describe("a pad sat inside a layout", () => {
  it("offers every digit and the delete key, exactly as docked does", () => {
    render(
      <NevoKeyboard
        layout="pad"
        presentation="block"
        onKey={noop}
        onBackspace={noop}
      />,
    );

    expect(digits()).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]);
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("still reports the key that was pressed", () => {
    const onKey = vi.fn();
    const onBackspace = vi.fn();
    render(
      <NevoKeyboard
        layout="pad"
        presentation="block"
        onKey={onKey}
        onBackspace={onBackspace}
      />,
    );

    screen.getByRole("button", { name: "7" }).click();
    screen.getByRole("button", { name: "Delete" }).click();

    expect(onKey).toHaveBeenCalledWith("7");
    expect(onBackspace).toHaveBeenCalled();
  });

  it("wears no tray band and does not slide up", () => {
    // The tray band is the keyboard metaphor - a full-width surface at the
    // bottom edge. A pad inside a layout is neither, and animating it in would
    // say it had arrived from somewhere when it was always there.
    const { container } = render(
      <NevoKeyboard
        layout="pad"
        presentation="block"
        onKey={noop}
        onBackspace={noop}
      />,
    );

    expect(container.querySelector(".animate-nevo-kb-up")).toBeNull();
    expect(container.innerHTML).not.toContain("bg-[#e4ddcc]");
  });
});

describe("what block does NOT change", () => {
  it("leaves the docked tray exactly as it was", () => {
    // Every existing caller passes no `presentation`, so this is the assertion
    // that they all still get what they had.
    const { container } = render(
      <NevoKeyboard layout="pad" onKey={noop} onBackspace={noop} />,
    );

    expect(container.innerHTML).toContain("bg-[#e4ddcc]");
    expect(container.querySelector(".motion-safe\\:animate-nevo-kb-up")).not.toBeNull();
  });

  it("ignores block on a qwerty layout, which has no content-sized form", () => {
    const { container } = render(
      <NevoKeyboard
        layout="qwerty"
        presentation="block"
        onKey={noop}
        onBackspace={noop}
      />,
    );

    expect(container.innerHTML).toContain("bg-[#e4ddcc]");
  });

  it("still stands aside for a real keyboard", () => {
    // A laptop types digits. Hiding on a fine pointer is as right for a pad in
    // the layout as it is for a tray.
    const { container } = render(
      <NevoKeyboard
        layout="pad"
        presentation="block"
        onKey={noop}
        onBackspace={noop}
      />,
    );

    expect(container.innerHTML).toContain("pointer:fine");
  });
});

describe("the pad's bottom-left corner (D54, D58)", () => {
  it.each(["docked", "block"] as const)(
    "is blank, as the frame draws it: %s",
    (presentation) => {
      // It held a navy check key for the one-tap unlock. Every PIN is four
      // digits now and the boxes send themselves on the fourth.
      render(
        <NevoKeyboard
          layout="pad"
          presentation={presentation}
          onKey={noop}
          onBackspace={noop}
        />,
      );

      expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
      // Ten digits and delete, and nothing else.
      expect(screen.getAllByRole("button")).toHaveLength(11);
    },
  );
});
