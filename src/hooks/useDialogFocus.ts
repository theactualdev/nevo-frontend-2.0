"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Focus for a dialog: moved in when it opens, kept in while it is open, and
 * given back when it closes (audit C07).
 *
 * NO TEACHER DIALOG DID ANY OF THIS. Twelve render `role="dialog"`, ten with
 * `aria-modal`, and none moved focus: a keyboard or screen-reader user opened
 * a sheet and was left on the button behind it, could Tab out into the page
 * the sheet was covering, and lost their place when it closed. Ask Nevo was
 * worse - opening it unmounts the pill that had focus, so focus fell to the
 * body and the drawer was last in tab order, after the whole page.
 *
 * WHAT IT DOES:
 * - On open, focuses the element marked `data-autofocus` inside the dialog,
 *   else its first focusable element, else the dialog itself (give the
 *   dialog `tabIndex={-1}` so that last resort works).
 * - While open and `trap` is on (the default, for `aria-modal` dialogs), Tab
 *   and Shift+Tab cycle inside it. A popover that is not modal passes
 *   `trap: false` and only gets the move in and the return.
 * - Escape calls `onEscape` when one is given. Dialogs with their own Escape
 *   handling pass nothing, so a press is never handled twice. A caller that
 *   must not be dismissed mid-write passes `undefined` while busy.
 * - On close, focus goes back to whatever had it before - when that element
 *   is still in the page. Ask Nevo's pill is not, so the drawer returns focus
 *   to the pill itself.
 *
 * `active` is for a dialog rendered inside a component that stays mounted
 * (Ask Nevo, the feedback panel): the focus work runs each time it opens.
 *
 * STACKED, so a dialog opened over another (a confirm over a sheet) owns the
 * keyboard until it closes, and the one beneath gets it back.
 */

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute("hidden") && el.getAttribute("aria-hidden") !== "true",
  );
}

/** The open dialogs, innermost last. Only the innermost answers the keyboard. */
const stack: symbol[] = [];

export function useDialogFocus(
  ref: RefObject<HTMLElement | null>,
  {
    active = true,
    trap = true,
    onEscape,
  }: {
    /** For a dialog rendered inside an always-mounted component: is it open? */
    active?: boolean;
    trap?: boolean;
    onEscape?: () => void;
  } = {},
): void {
  // The latest handler, read at press time, so a caller's inline arrow does
  // not re-run the whole effect - and re-steal focus - on every render.
  const escape = useRef(onEscape);
  useEffect(() => {
    escape.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    const root = ref.current;
    if (!active || !root) return;
    const id = Symbol("dialog");
    stack.push(id);
    const previous =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const first =
      root.querySelector<HTMLElement>("[data-autofocus]") ?? focusables(root)[0] ?? root;
    first.focus();

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return;
      if (e.key === "Escape" && escape.current) {
        e.stopPropagation();
        escape.current();
        return;
      }
      if (e.key !== "Tab" || !trap) return;
      const items = focusables(root);
      if (items.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const head = items[0];
      const tail = items[items.length - 1];
      const at = document.activeElement;
      const inside = at instanceof Node && root.contains(at);
      if (e.shiftKey && (at === head || !inside)) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && (at === tail || !inside)) {
        e.preventDefault();
        head.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      const at = stack.indexOf(id);
      if (at >= 0) stack.splice(at, 1);
      if (previous && previous.isConnected) previous.focus();
    };
    // Once per opening. `ref` is stable and the handlers are read through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
