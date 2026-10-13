import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { SAMPLE_ATTR } from "@/lib/sampleData";
import { SampleRegion } from "./SampleRegion";

/**
 * A SHEET IS PORTALLED OUT OF ITS SAMPLE REGION.
 *
 * The mark is an attribute on a wrapper, and Radix renders a sheet into
 * `body` - outside every wrapper. So the signed-out lesson preview, with a
 * fixture's "what you'll do" in it, sat on the page unmarked: the end-to-end
 * detector asserts "no sample marks once signed in", and could not have seen
 * this one leak. Context follows the component tree through the portal, so
 * the sheet marks itself.
 */

const OpenSheet = ({ text }: { text: string }) => (
  <Sheet open>
    <SheetContent aria-describedby={undefined}>
      <SheetTitle>{text}</SheetTitle>
    </SheetContent>
  </Sheet>
);

describe("a sheet opened from sample data", () => {
  it("carries the mark of the region it was opened from", () => {
    const { container } = render(
      <SampleRegion kind="student:lessons">
        <OpenSheet text="A fixture lesson" />
      </SampleRegion>,
    );

    const sheet = screen.getByRole("dialog");
    // The whole point: the dialog is NOT inside the region's wrapper.
    expect(container.contains(sheet)).toBe(false);
    expect(sheet.getAttribute(SAMPLE_ATTR)).toBe("student:lessons");
  });

  it("carries no mark when it was opened from a child's own data", () => {
    // The other direction matters as much: a mark on a real child's sheet
    // makes the end-to-end assertion fail on a healthy screen.
    render(<OpenSheet text="A real lesson" />);

    expect(screen.getByRole("dialog").hasAttribute(SAMPLE_ATTR)).toBe(false);
    expect(document.querySelector(`[${SAMPLE_ATTR}]`)).toBeNull();
  });
});
