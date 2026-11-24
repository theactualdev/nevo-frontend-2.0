import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { AssignTeacherButton, NoTeacherYet } from "./primitives";

/**
 * The dot beside "Assign a teacher" pulses (Olayinka, 23 Nov): calm and slow,
 * in its own violet, and a plain dot under reduced motion.
 */

const dot = (c: HTMLElement) => c.querySelector("[aria-hidden]")!;

describe("the Assign a teacher dot", () => {
  it("pulses only where motion is welcome", () => {
    const { container } = render(<AssignTeacherButton onClick={vi.fn()} />);
    const cls = dot(container).className;
    // `motion-safe:` and never bare: reduced motion gets a plain dot.
    expect(cls).toMatch(/(^|\s)motion-safe:animate-nevo-dot-pulse(\s|$)/);
    expect(cls).not.toMatch(/(^|\s)animate-nevo-dot-pulse(\s|$)/);
    // The dot's own colour - no new one.
    expect(cls).toMatch(/\bbg-nevo-violet\b/);
  });

  it("holds still on a paused control, and where nothing can be assigned", () => {
    const paused = render(<AssignTeacherButton onClick={vi.fn()} disabled />);
    expect(dot(paused.container).className).not.toMatch(/animate-/);
    const none = render(<NoTeacherYet />);
    expect(dot(none.container).className).not.toMatch(/animate-/);
  });

  it("is a slow opacity and scale pulse, nothing else", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toMatch(/--animate-nevo-dot-pulse: nevo-dot-pulse 2\.4s ease-in-out infinite;/);
    const frames = css.match(/@keyframes nevo-dot-pulse \{([\s\S]*?)\n\}/)![1];
    const props = [...frames.matchAll(/([a-z-]+):/g)].map((m) => m[1]);
    expect(new Set(props)).toEqual(new Set(["opacity", "transform"]));
  });
});
