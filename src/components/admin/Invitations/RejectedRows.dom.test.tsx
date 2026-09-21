import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RejectedRows } from "./RejectedRows";
import type { ParsedRow } from "./csv";

/**
 * CL-06 (SCRUM-149): *"the most important frame, and missing from every import
 * in the product today."*
 *
 * The result screen used to add two lengths together and render one sentence —
 * "4 rows were skipped due to errors" — over data that already carried every
 * row number and every reason. `BulkInvitationResponse.rejected` is
 * `{row, reason}` with both REQUIRED; our own parser produces `{line, error}`.
 * The detail was on the wire and discarded one step from the screen.
 *
 * These assert on what an admin can ACT on: a row number they can find in
 * their spreadsheet, and a reason they can fix. A count is not actionable, and
 * it is what these exist to prevent regressing to.
 */

const brokenRow = (over: Partial<ParsedRow> = {}): ParsedRow => ({
  line: 7,
  name: "Chisom Eze",
  email: "chisom.e@school.edu.ng",
  className: "JSS 2A",
  parentContact: "mrs.eze@email.com",
  error: "No class called \"JSS 2A\".",
  classId: null,
  ...over,
});

const setup = (props: Partial<React.ComponentProps<typeof RejectedRows>> = {}) =>
  render(
    <RejectedRows
      broken={[]}
      rejected={[]}
      isStudent
      filename="nevo-students-not-imported.csv"
      {...props}
    />,
  );

describe("nothing rejected", () => {
  it("renders nothing at all", () => {
    const { container } = setup();
    expect(container).toBeEmptyDOMElement();
  });
});

describe("rows our parser refused", () => {
  it("names the row number, so it can be found in the spreadsheet", () => {
    setup({ broken: [brokenRow()] });
    expect(screen.getByText("Row 7")).toBeInTheDocument();
  });

  it("shows the offending value beside the reason", () => {
    // "the offending value" is CL-06's wording, and it is what makes a row
    // findable when the admin has a thirty-row file open.
    setup({ broken: [brokenRow()] });
    expect(screen.getByText("Chisom Eze")).toBeInTheDocument();
    expect(screen.getByText(/No class called/)).toBeInTheDocument();
  });

  it("lists every rejection individually rather than counting them", () => {
    setup({
      broken: [
        brokenRow({ line: 3, name: "A", error: "No name in this row." }),
        brokenRow({ line: 9, name: "B", error: "This row repeats one above it." }),
      ],
    });
    expect(screen.getByText("Row 3")).toBeInTheDocument();
    expect(screen.getByText("Row 9")).toBeInTheDocument();
  });
});

describe("rows the server refused", () => {
  it("shows the server's own row number and reason", () => {
    setup({ rejected: [{ row: 12, reason: "That email is already invited." }] });
    expect(screen.getByText("Row 12")).toBeInTheDocument();
    expect(
      screen.getByText("That email is already invited."),
    ).toBeInTheDocument();
  });

  it("does NOT borrow a name from a parsed row with the same number", () => {
    // The tempting bug. Our `line` is index+2; the contract documents no base
    // for `row` at all. Pairing them on an assumption would put the wrong
    // person's name beside a real reason, which is worse than showing none.
    setup({
      broken: [brokenRow({ line: 12, name: "Someone Else" })],
      rejected: [{ row: 12, reason: "That email is already invited." }],
    });
    const serverReason = screen.getByText("That email is already invited.");
    expect(serverReason.textContent).not.toMatch(/Someone Else/);
  });
});

describe("the count line", () => {
  it("counts both sources together", () => {
    setup({
      broken: [brokenRow()],
      rejected: [{ row: 12, reason: "Already invited." }],
    });
    expect(screen.getByText(/2 rows were not imported/i)).toBeInTheDocument();
  });

  it("says row, not rows, for one", () => {
    setup({ broken: [brokenRow()] });
    expect(screen.getByText(/1 row was not imported/i)).toBeInTheDocument();
  });
});

describe("the download", () => {
  it("offers the rejected rows as a file to fix and re-upload", () => {
    setup({ broken: [brokenRow()] });
    expect(
      screen.getByRole("button", { name: /Download these rows/i }),
    ).toBeInTheDocument();
  });

  it("carries the reason in the file, not just the row", () => {
    // A downloaded list of row numbers with no reasons is the same dead end
    // as the count this screen replaced.
    const created = vi.fn();
    const blobText: string[] = [];
    const OriginalBlob = global.Blob;
    // @ts-expect-error - narrow stub, restored below
    global.Blob = class {
      constructor(parts: string[]) {
        blobText.push(parts.join(""));
        created();
      }
    };
    const url = { createObjectURL: () => "blob:x", revokeObjectURL: () => {} };
    const originalUrl = global.URL.createObjectURL;
    global.URL.createObjectURL = url.createObjectURL as never;
    global.URL.revokeObjectURL = url.revokeObjectURL as never;

    try {
      setup({
        broken: [brokenRow()],
        rejected: [{ row: 12, reason: "Already invited." }],
      });
      fireEvent.click(
        screen.getByRole("button", { name: /Download these rows/i }),
      );
      expect(created).toHaveBeenCalled();
      expect(blobText[0]).toMatch(/row,reason/);
      expect(blobText[0]).toMatch(/No class called/);
      expect(blobText[0]).toMatch(/Already invited\./);
    } finally {
      global.Blob = OriginalBlob;
      global.URL.createObjectURL = originalUrl;
    }
  });
});
