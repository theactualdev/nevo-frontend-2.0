import { fireEvent, screen, waitFor, within } from "@testing-library/react";

/**
 * DRIVING A `NevoSelect` IN jsdom - the shared dropdown that replaced the
 * admin console's native `<select>`s (Olayinka's TO-DO item 2). A test that
 * did `fireEvent.change(select, { target: { value } })` now opens the menu
 * and chooses the row by its words, as a person does.
 *
 * Radix Select's open panel calls four things jsdom does not implement -
 * `scrollIntoView`, the pointer-capture trio and `ResizeObserver`. They are
 * added here, only where missing and only in a test file that opens a
 * select, rather than in `vitest.setup.ts`: `CalculationSolver` takes a
 * different path when `ResizeObserver` is absent, and its tests are written
 * against that path. Adding a function jsdom lacks, never replacing one it has.
 */
export function selectStandIns(): void {
  const proto = Element.prototype as Element & {
    hasPointerCapture?: (id: number) => boolean;
    setPointerCapture?: (id: number) => void;
    releasePointerCapture?: (id: number) => void;
  };
  if (!proto.scrollIntoView) proto.scrollIntoView = () => {};
  if (!proto.hasPointerCapture) proto.hasPointerCapture = () => false;
  if (!proto.setPointerCapture) proto.setPointerCapture = () => {};
  if (!proto.releasePointerCapture) proto.releasePointerCapture = () => {};
  const w = window as unknown as { ResizeObserver?: unknown };
  if (!w.ResizeObserver) {
    w.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
}

/** Opens the menu from the keyboard, as a person tabbing in would; returns the listbox. */
export function openSelect(trigger: HTMLElement): HTMLElement {
  selectStandIns();
  fireEvent.keyDown(trigger, { key: "Enter" });
  return screen.getByRole("listbox");
}

/**
 * Opens the menu and chooses the row with these words. Waits, as a person
 * would, for a control still loading to come on (a select is disabled while
 * its list is read) and for the row to arrive.
 */
export async function chooseOption(trigger: HTMLElement, name: string | RegExp): Promise<void> {
  await waitFor(() => {
    if ((trigger as HTMLButtonElement).disabled) throw new Error("the select is still disabled");
  });
  const list = openSelect(trigger);
  fireEvent.click(await within(list).findByRole("option", { name }));
}

/**
 * The rows the menu offers, in order (none while its list is still loading).
 * The menu is closed again after, so the rest of the page is queryable.
 */
export function optionNames(trigger: HTMLElement): string[] {
  const list = openSelect(trigger);
  const names = within(list)
    .queryAllByRole("option")
    .map((o) => (o.textContent ?? "").trim());
  fireEvent.keyDown(list, { key: "Escape" });
  return names;
}
