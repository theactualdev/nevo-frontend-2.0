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

  it("invents no name for them", () => {
    /*
     * THE CONSTRAINT THAT COST THE MOST TO HONOUR. Design asked for the
     * teacher by name and the wire carries none - `AssignmentResponse` has
     * `note` and nothing saying who wrote it. The available near-misses are
     * `lesson.createdByName`, which is whoever authored the lesson rather than
     * whoever set it, and the class's teacher LIST. Putting one teacher's name
     * on another teacher's words is worse than not naming them.
     */
    render(<TeacherNote note="Well done last week." />);

    const caption = document.querySelector("figcaption")?.textContent ?? "";

    expect(caption).toBe("— Your teacher");
  });
});
