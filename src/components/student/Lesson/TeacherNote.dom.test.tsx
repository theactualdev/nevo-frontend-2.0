import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TeacherNote } from "./TeacherNote";

/**
 * A teacher deliberately typed these words TO this child, which is the whole
 * reason this was not closed the way `highlights` was. So the assertions are
 * about fidelity and voice: the words arrive exactly as written, and the child
 * can tell a person wrote them.
 */

afterEach(() => {
  cleanup();
});

describe("the words themselves", () => {
  it("shows them exactly as the teacher typed them", () => {
    const note = "Take your time on question 3. We did this on Tuesday.";

    render(<TeacherNote note={note} />);

    expect(screen.getByText(note)).toBeInTheDocument();
  });

  it("keeps the line breaks they chose", () => {
    /*
     * "Never rewritten, summarised or adapted" reaches punctuation and layout,
     * not just wording. Collapsing a teacher's two lines into one is a small
     * edit of somebody else's message.
     */
    render(<TeacherNote note={"Read it twice.\nThen try question 4."} />);

    const quote = document.querySelector("blockquote");

    expect(quote?.className).toContain("whitespace-pre-line");
    expect(quote?.textContent).toBe("Read it twice.\nThen try question 4.");
  });
});

describe("whose voice it is", () => {
  it("is a quotation, not prose in Nevo's own voice", () => {
    // Everything Nevo says to a child is unquoted and unattributed.
    render(<TeacherNote note="Well done last week." />);

    expect(document.querySelector("blockquote")).toBeTruthy();
    expect(document.querySelector("figcaption")).toBeTruthy();
  });

  it("says a person wrote it, and does not say Nevo", () => {
    render(<TeacherNote note="Well done last week." />);

    expect(screen.getByText(/Your teacher/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Nevo/);
  });

  it("names the teacher when the wire carries one", () => {
    // `assignedByName`, the teacher who SET the assignment.
    render(<TeacherNote note="Well done last week." author="Ms Adeyemi" />);

    expect(document.querySelector("figcaption")?.textContent).toBe(
      "— Ms Adeyemi",
    );
  });

  it("invents no name for them", () => {
    /*
     * The wire carries a name as of 24 Sep, and it can still be null - a
     * deleted or unnamed account. Backend returns null rather than a
     * placeholder on the principle this component was built around: naming the
     * wrong teacher is worse than naming none.
     *
     * So an unresolvable author is an UNSIGNED note, never a withheld one.
     */
    render(<TeacherNote note="Well done last week." />);

    const caption = document.querySelector("figcaption")?.textContent ?? "";

    expect(caption).toBe("— Your teacher");
  });
});

describe("the reading accommodation (D30, audit 46)", () => {
  /*
   * "The teacher's note takes typographic support only." It was the one block
   * in the reading column a child with reading support still met at 15px.
   */
  const NOTE = "Take your time on question 3.";

  it("sets the note in the accommodation's type", () => {
    render(<TeacherNote note={NOTE} reading />);

    const quote = document.querySelector("blockquote")?.className ?? "";
    expect(quote).toContain("text-[18px]");
    expect(quote).toContain("leading-[2]");
    expect(quote).not.toContain("text-[15px]");
  });

  it("changes nothing else about it", () => {
    // Typography is how the words are presented, never which words they are.
    render(<TeacherNote note={NOTE} reading />);

    const quote = document.querySelector("blockquote");
    expect(quote?.textContent).toBe(NOTE);
    expect(quote?.className).toContain("italic");
    expect(quote?.className).toContain("whitespace-pre-line");
  });

  it("leaves the note as drawn without it", () => {
    render(<TeacherNote note={NOTE} />);

    expect(document.querySelector("blockquote")?.className).toContain(
      "text-[15px]",
    );
  });
});
