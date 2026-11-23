import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NevoSelect, type NevoSelectOption } from "./NevoSelect";
import { chooseOption, openSelect, optionNames } from "@/test/nevoSelect";

/**
 * THE SHARED DROPDOWN (Olayinka, TO-DO item 2): the admin console's menus in
 * Nevo's design language, and still a real select underneath - a combobox
 * with a listbox of options, the keyboard a native select answers to, and the
 * same values in and out.
 */

const CLASSES: NevoSelectOption[] = [
  { value: "", label: "All classes" },
  { value: "c-1", label: "JSS 2A" },
  { value: "c-2", label: "JSS 2B" },
  { value: "c-3", label: "SS 1C", disabled: true },
];

function Harness({
  initial = "",
  options = CLASSES,
  placeholder,
  disabled,
  onChange = () => {},
}: {
  initial?: string;
  options?: NevoSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  onChange?: (v: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <NevoSelect
      aria-label="Filter by class"
      value={value}
      onValueChange={(v) => {
        setValue(v);
        onChange(v);
      }}
      options={options}
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}

const trigger = () => screen.getByRole("combobox", { name: "Filter by class" });

let removeDocListener: (() => void) | null = null;
afterEach(() => {
  removeDocListener?.();
  removeDocListener = null;
});

describe("the shared dropdown", () => {
  it("is a combobox showing the current choice, closed until opened", () => {
    render(<Harness initial="c-2" />);
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(trigger()).toHaveTextContent("JSS 2B");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("opens a listbox of options, with the current one selected", () => {
    render(<Harness initial="c-1" />);
    // Held before opening: an open menu hides the rest of the page from
    // assistive tech (as a native select's popup does), role queries included.
    const t = trigger();
    const list = openSelect(t);

    expect(t).toHaveAttribute("aria-expanded", "true");
    const options = within(list).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["All classes", "JSS 2A", "JSS 2B", "SS 1C"]);
    // Radix keeps aria-selected for the row with focus; the chosen row is "checked".
    expect(within(list).getByRole("option", { name: "JSS 2A" })).toHaveAttribute("data-state", "checked");
  });

  it("hands back the chosen value and shows its words", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await chooseOption(trigger(), "JSS 2B");
    expect(onChange).toHaveBeenLastCalledWith("c-2");
    expect(trigger()).toHaveTextContent("JSS 2B");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it('carries an empty value as "" - "All classes" is a choice like any other', async () => {
    const onChange = vi.fn();
    render(<Harness initial="c-1" onChange={onChange} />);

    await chooseOption(trigger(), "All classes");
    expect(onChange).toHaveBeenLastCalledWith("");
    expect(trigger()).toHaveTextContent("All classes");
  });

  it("shows a prompt while nothing is chosen, and never lists the prompt as a row", () => {
    render(
      <Harness
        options={CLASSES.filter((o) => o.value !== "")}
        placeholder="Choose a class"
      />,
    );
    expect(trigger()).toHaveTextContent("Choose a class");
    expect(trigger()).toHaveAttribute("data-placeholder");
    expect(optionNames(trigger())).toEqual(["JSS 2A", "JSS 2B", "SS 1C"]);
  });

  it("never chooses a disabled option", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    const list = openSelect(trigger());
    const off = within(list).getByRole("option", { name: "SS 1C" });
    expect(off).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(off);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not open when the control is disabled", () => {
    render(<Harness disabled />);
    expect(trigger()).toBeDisabled();
    fireEvent.keyDown(trigger(), { key: "Enter" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("moves with the arrow keys and chooses with Enter", async () => {
    const onChange = vi.fn();
    render(<Harness initial="c-1" onChange={onChange} />);

    openSelect(trigger());
    await waitFor(() => expect(document.activeElement).toHaveTextContent("JSS 2A"));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    await waitFor(() => expect(document.activeElement).toHaveTextContent("JSS 2B"));
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });

    expect(onChange).toHaveBeenLastCalledWith("c-2");
  });

  it("closes on Escape without closing a sheet around it, and gives focus back", async () => {
    // The admin Sheet closes on any Escape the document hears.
    const sheetHeard = vi.fn();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") sheetHeard();
    };
    document.addEventListener("keydown", onKey);
    removeDocListener = () => document.removeEventListener("keydown", onKey);

    render(<Harness initial="c-1" />);
    const list = openSelect(trigger());
    fireEvent.keyDown(list, { key: "Escape" });

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(sheetHeard).not.toHaveBeenCalled();
    await waitFor(() => expect(trigger()).toHaveFocus());
  });

  it("reads a value no option carries as nothing chosen, never a stale label", () => {
    render(<Harness initial="gone" options={CLASSES.slice(1)} placeholder="Choose a class" />);
    expect(trigger()).toHaveTextContent("Choose a class");
  });
});
