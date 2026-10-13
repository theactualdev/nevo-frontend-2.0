/**
 * BRINGING THE STEP INTO VIEW ABOVE THE DOCKED PAD.
 *
 * The player's column is all that scrolls, and with the arrows pinned under
 * it and the calculation pad docked under them, it can be short: about 300px
 * on a 375×667 phone, less at a larger text size. A step's question, its
 * field and its Check do not always fit together. So the solver shows the
 * most of the step that fits, in an order of what matters - the question,
 * the field, the hint it was given, Check once it is live - and moves the
 * column the least distance that shows it, the way a device's keyboard
 * brings its field up.
 *
 * Each part is marked in the step with `data-reveal`; a stretch runs from
 * the top of one to the bottom of another. Nothing is hidden or reordered to
 * make it fit: what does not fit is a scroll away, as it always was.
 */

/** A stretch of the step: from the top of one marked part to the bottom of another. */
export type Stretch = readonly [from: string, to: string];

/** Where a stretch sits, and where the column's view is, on one axis. */
interface Span {
  top: number;
  bottom: number;
}

/**
 * Which stretch to show and how: the first that fits in the view, brought in
 * by its top if it starts above, by its bottom if it ends below, and left
 * where it is if it is in view already. Null when none fits.
 */
export function revealPlan(
  stretches: Span[],
  view: Span,
): { index: number; align: "start" | "end" | null } | null {
  const room = view.bottom - view.top;
  for (let index = 0; index < stretches.length; index++) {
    const { top, bottom } = stretches[index];
    if (bottom - top > room) continue;
    if (top < view.top) return { index, align: "start" };
    if (bottom > view.bottom) return { index, align: "end" };
    return { index, align: null };
  }
  return null;
}

/** The nearest ancestor that scrolls up and down - the player's column. */
export function scrollerOf(el: Element): HTMLElement | null {
  for (let at = el.parentElement; at; at = at.parentElement) {
    const { overflowY } = getComputedStyle(at);
    if (overflowY === "auto" || overflowY === "scroll") return at;
  }
  return null;
}

/**
 * Shows the first of `stretches` that fits, within `block`'s scroller.
 * Instant, not smooth: the player takes how far down the column the system
 * itself moved it as soon as this returns, so that the move is never read
 * as the child scrolling (`scroll`). True when it moved the column.
 */
export function revealIn(block: HTMLElement, stretches: Stretch[]): boolean {
  const scroller = scrollerOf(block);
  if (!scroller) return false;
  const part = (name: string) =>
    block.querySelector<HTMLElement>(`[data-reveal="${name}"]`);
  const found = stretches.flatMap(([a, b]) => {
    const from = part(a);
    const to = part(b);
    return from && to ? [{ from, to }] : [];
  });
  const plan = revealPlan(
    found.map(({ from, to }) => ({
      top: from.getBoundingClientRect().top,
      bottom: to.getBoundingClientRect().bottom,
    })),
    scroller.getBoundingClientRect(),
  );
  if (!plan?.align) return false;
  const { from, to } = found[plan.index];
  if (plan.align === "start") from.scrollIntoView({ block: "start" });
  else to.scrollIntoView({ block: "end" });
  return true;
}
