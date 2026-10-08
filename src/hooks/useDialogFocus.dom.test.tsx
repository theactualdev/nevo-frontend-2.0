import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { useDialogFocus } from "./useDialogFocus";

/**
 * Focus for a dialog (audit C07): in on open, kept in while open, back on
 * close. No teacher dialog did any of the three.
 */

function Dialog({
  onEscape,
  trap,
  autofocus = false,
}: {
  onEscape?: () => void;
  trap?: boolean;
  autofocus?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref, { onEscape, trap });
  return (
    <div ref={ref} role="dialog" tabIndex={-1}>
      <button type="button">First</button>
      <input aria-label="Field" data-autofocus={autofocus ? "" : undefined} />
      <button type="button">Last</button>
    </div>
  );
}

function Host({ onEscape, trap, autofocus }: { onEscape?: () => void; trap?: boolean; autofocus?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <button type="button">Elsewhere</button>
      {open && <Dialog onEscape={onEscape ?? (() => setOpen(false))} trap={trap} autofocus={autofocus} />}
      {open && (
        <button type="button" onClick={() => setOpen(false)}>
          Close outside
        </button>
      )}
    </>
  );
}

const open = () => {
  const opener = screen.getByRole("button", { name: "Open" });
  opener.focus();
  fireEvent.click(opener);
  return opener;
};
const tab = (shift = false) => fireEvent.keyDown(document, { key: "Tab", shiftKey: shift });

describe("opening a dialog", () => {
  it("moves focus to its first control", () => {
    render(<Host />);
    open();

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "First" }));
  });

  it("prefers the control marked to take focus", () => {
    render(<Host autofocus />);
    open();

    expect(document.activeElement).toBe(screen.getByLabelText("Field"));
  });
});

describe("while it is open", () => {
  it("keeps Tab inside, wrapping from the last control to the first", () => {
    render(<Host />);
    open();
    screen.getByRole("button", { name: "Last" }).focus();
    tab();

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "First" }));
  });

  it("wraps Shift+Tab from the first control to the last", () => {
    render(<Host />);
    open();
    tab(true);

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Last" }));
  });

  it("brings focus back in if it has strayed outside", () => {
    render(<Host />);
    open();
    screen.getByRole("button", { name: "Elsewhere" }).focus();
    tab();

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "First" }));
  });

  it("does not trap a popover that is not modal", () => {
    render(<Host trap={false} />);
    open();
    screen.getByRole("button", { name: "Last" }).focus();
    const e = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    document.dispatchEvent(e);

    expect(e.defaultPrevented).toBe(false);
  });

  it("closes on Escape when asked to", () => {
    const onEscape = vi.fn();
    render(<Host onEscape={onEscape} />);
    open();
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it("keeps an Escape it answered from closing what is underneath too", () => {
    // Most sheets listen for Escape on window. One press must close one thing.
    const beneath = vi.fn();
    window.addEventListener("keydown", beneath);
    render(<Host onEscape={() => {}} />);
    open();
    fireEvent.keyDown(document, { key: "Escape" });
    window.removeEventListener("keydown", beneath);

    expect(beneath).not.toHaveBeenCalled();
  });
});

describe("closing it", () => {
  it("gives focus back to the control that opened it", () => {
    render(<Host />);
    const opener = open();
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(opener);
  });

  it("gives focus back however it was closed", () => {
    render(<Host onEscape={() => {}} />);
    const opener = open();
    fireEvent.click(screen.getByRole("button", { name: "Close outside" }));

    expect(document.activeElement).toBe(opener);
  });
});

describe("a dialog opened over another", () => {
  function Inner({ onClose }: { onClose: () => void }) {
    const ref = useRef<HTMLDivElement>(null);
    useDialogFocus(ref, { onEscape: onClose });
    return (
      <div ref={ref} role="dialog" aria-label="Inner" tabIndex={-1}>
        <button type="button">Inner button</button>
      </div>
    );
  }

  function Stacked() {
    const [inner, setInner] = useState(false);
    const [closedOuter, setClosedOuter] = useState(false);
    const outer = useRef<HTMLDivElement>(null);
    useDialogFocus(outer, { onEscape: () => setClosedOuter(true) });
    return (
      <div ref={outer} role="dialog" aria-label="Outer" tabIndex={-1}>
        <button type="button" onClick={() => setInner(true)}>
          Open inner
        </button>
        {closedOuter && <p>outer closed</p>}
        {inner && <Inner onClose={() => setInner(false)} />}
      </div>
    );
  }

  it("lets only the innermost answer Escape, then hands focus back down", () => {
    render(<Stacked />);
    const openInner = screen.getByRole("button", { name: "Open inner" });
    fireEvent.click(openInner);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Inner button" }));

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Inner" })).not.toBeInTheDocument();
    expect(screen.queryByText("outer closed")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(openInner);
  });
});
