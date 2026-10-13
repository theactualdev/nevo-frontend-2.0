import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ParseFallback } from "./ParseFallback";

/**
 * The supported-formats note lists what the picker actually takes. It said
 * JPG and PNG, which the picker refuses, and left out PowerPoint, which it
 * accepts - so a teacher following it would be turned away.
 */
describe("the supported formats", () => {
  it("are the ones the picker accepts", () => {
    render(
      <ParseFallback
        kind="unreadable"
        blockName="Water"
        onBack={vi.fn()}
        onTryAnother={vi.fn()}
        onContinueAnyway={vi.fn()}
        onRetrySameFile={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "See supported formats" }));

    expect(screen.getByText(/PDF, Word \(\.doc, \.docx\) and PowerPoint \(\.ppt, \.pptx\)/)).toBeInTheDocument();
    expect(screen.queryByText(/JPG|PNG/)).not.toBeInTheDocument();
  });
});
