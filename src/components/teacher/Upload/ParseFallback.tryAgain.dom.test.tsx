import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { ParseFallback, type FallbackKind } from "./ParseFallback";

/**
 * LU-05 (design, 12 Oct): a reading that stops "routes to the Try-again
 * screen", and that screen offers a way out of the upload as well as a way
 * to try again - "Back to my library" beside the primary action.
 */

const show = (kind: FallbackKind) =>
  render(
    <ParseFallback
      kind={kind}
      blockName="Quadratic Graphs"
      onBack={vi.fn()}
      onTryAnother={vi.fn()}
      onContinueAnyway={vi.fn()}
      onRetrySameFile={vi.fn()}
    />,
  );

describe("the try-again screens", () => {
  it.each(["parseFailed", "unreachable"] as const)(
    "%s offers the library beside trying again",
    (kind) => {
      show(kind);

      expect(screen.getByRole("link", { name: "Back to my library" })).toHaveAttribute(
        "href",
        "/teacher/lessons",
      );
      // The foot's Back is still there: one steps a screen, one leaves.
      expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    },
  );

  it("leaves the unreadable screen with C07f's own two actions", () => {
    show("unreadable");

    expect(screen.getByRole("button", { name: "Try another file" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "See supported formats" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Back to my library" })).not.toBeInTheDocument();
  });
});
