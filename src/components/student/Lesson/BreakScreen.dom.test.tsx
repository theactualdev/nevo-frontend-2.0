import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BreakScreen } from "./BreakScreen";
import { BREAK_TYPES } from "@/lib/constants";

/**
 * A break can come after the connection has dropped, and its picture is
 * fetched only when the break begins. One that will not load is left out,
 * never drawn as a broken box with its alt text in it.
 */

afterEach(cleanup);

describe("a break's picture that will not load", () => {
  it("is left out, and the break stands without it", () => {
    render(<BreakScreen type={BREAK_TYPES.FULL} onDone={() => {}} />);

    fireEvent.error(
      screen.getByRole("img", { name: "A figure lying down resting" }),
    );

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByText("A figure lying down resting")).toBeNull();
    expect(screen.getByRole("button", { name: "I'm back" })).toBeTruthy();
  });
});
