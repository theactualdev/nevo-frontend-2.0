import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NevoAnswer } from "./NevoAnswer";

/**
 * The shared answer, for the teacher's drawer and the student's alike (Teslim
 * 09a29d8). Blocks by type, emphasis inside a line, and nothing as HTML.
 */
describe("NevoAnswer", () => {
  it("draws bullets as a list and steps as a numbered one", () => {
    const { container } = render(
      <NevoAnswer answer={"- one\n- two\n\n1. first\n2. second"} />,
    );

    expect(container.querySelectorAll("ul > li")).toHaveLength(2);
    expect(container.querySelectorAll("ol > li")).toHaveLength(2);
  });

  it("draws bold, italic and inline code as such", () => {
    render(<NevoAnswer answer="Open **this**, *then* `that`." />);

    expect(screen.getByText("this").tagName).toBe("STRONG");
    expect(screen.getByText("then").tagName).toBe("EM");
    expect(screen.getByText("that").tagName).toBe("CODE");
  });

  it("keeps a heading as its own line", () => {
    render(<NevoAnswer answer={"**Plan**\n\nDo the thing."} />);

    expect(screen.getByText("Plan")).toHaveClass("font-semibold");
    expect(screen.getByText("Do the thing.").tagName).toBe("P");
  });

  it("never turns the answer into markup", () => {
    const { container } = render(
      <NevoAnswer answer={'<script>alert(1)</script> <a href="javascript:x">go</a>'} />,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("<script>alert(1)</script>");
  });

  it("takes its type from the caller", () => {
    const { container } = render(<NevoAnswer answer="Hi" className="text-[15px]" />);

    expect(container.firstElementChild).toHaveClass("text-[15px]");
  });

  it("draws nothing for an answer with nothing in it", () => {
    const { container } = render(<NevoAnswer answer="" blocks={[]} plainText="" />);

    expect(container.firstElementChild?.childElementCount).toBe(0);
  });
});
