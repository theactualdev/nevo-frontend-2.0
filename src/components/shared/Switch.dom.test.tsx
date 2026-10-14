import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Switch } from "./Switch";

/**
 * The student Profile draws its switches 64x44 since 13 Oct (`Nevo Profile
 * Frame`). Every other switch keeps Design System v2's 52x30, so the larger
 * one is a size a caller asks for, and leaving it out changes nothing.
 */

const classesOf = (el: Element) => el.className.split(/\s+/);

describe("Switch", () => {
  it("keeps the 52x30 track and 24px knob when no size is asked for", () => {
    render(<Switch aria-label="Sounds" />);
    const track = screen.getByRole("switch", { name: "Sounds" });

    expect(classesOf(track)).toEqual(
      expect.arrayContaining(["h-[30px]", "w-[52px]"]),
    );
    expect(classesOf(track.firstElementChild!)).toEqual(
      expect.arrayContaining(["size-6", "top-[3px]", "left-[3px]"]),
    );
  });

  it("draws 64x44 with a 34px knob 5px in at size lg", () => {
    const { rerender } = render(<Switch aria-label="Sounds" size="lg" />);
    const track = screen.getByRole("switch", { name: "Sounds" });

    expect(classesOf(track)).toEqual(expect.arrayContaining(["h-11", "w-16"]));
    expect(classesOf(track)).not.toContain("h-[30px]");
    expect(classesOf(track.firstElementChild!)).toEqual(
      expect.arrayContaining(["size-[34px]", "top-[5px]", "left-[5px]"]),
    );

    // On, the knob sits at the far end: 64 - 5 - 34.
    rerender(<Switch aria-label="Sounds" size="lg" checked />);
    expect(classesOf(track.firstElementChild!)).toContain("left-[25px]");
  });

  it("still says what it is and turns over on a tap", () => {
    const onCheckedChange = vi.fn();
    render(
      <Switch
        aria-label="Sounds"
        size="lg"
        checked
        onCheckedChange={onCheckedChange}
      />,
    );
    const track = screen.getByRole("switch", { name: "Sounds" });

    expect(track).toHaveAttribute("aria-checked", "true");
    fireEvent.click(track);
    expect(onCheckedChange).toHaveBeenCalledWith(false);
  });
});
