import { fireEvent } from "@testing-library/react";

/**
 * The lesson player's reading column, laid out in jsdom, which lays out
 * nothing: every element is 0x0 there, so without this a scroll test measures
 * a column of no height and passes by sending nothing.
 */

/** A rect at `top`, `height` tall. */
const rectAt = (top: number, height: number) =>
  ({
    top,
    bottom: top + height,
    height,
    left: 0,
    right: 375,
    width: 375,
    x: 0,
    y: top,
    toJSON: () => ({}),
  }) as DOMRect;

const columnIn = (container: HTMLElement) =>
  container.querySelector<HTMLElement>(".overflow-y-auto")!;

/**
 * THE PAGE CARRYING THE COLUMN. Until 11 Oct the player was `min-h-[100dvh]`,
 * so the column grew to its segment's full `height` and the PAGE scrolled:
 * the column's own scroll room stayed 0 however long the segment was - which
 * is how no `scroll` mark was ever sent without a test noticing. The player
 * is one screen high now and its column scrolls (`selfScrolledColumn`), but
 * the page still carries it where `dvh` is not honoured, so both are read.
 */
export function pageScrolledColumn(
  container: HTMLElement,
  { height, top = 120, viewport = 812 }: {
    height: number;
    top?: number;
    viewport?: number;
  },
) {
  const column = columnIn(container);
  Object.defineProperty(window, "innerHeight", {
    value: viewport,
    configurable: true,
  });
  let scrolled = 0;
  column.getBoundingClientRect = () => rectAt(top - scrolled, height);
  return {
    /** Scroll the page to `y`, as a phone does. */
    scrollPageTo(y: number) {
      scrolled = y;
      fireEvent.scroll(document);
    },
    /** A scroll event on the column itself, which this layout never has room for. */
    scrollColumn() {
      fireEvent.scroll(column);
    },
  };
}

/** The player's layout: the column the scroller, `room` px taller than it shows. */
export function selfScrolledColumn(
  container: HTMLElement,
  { room, shown = 600 }: { room: number; shown?: number },
) {
  const column = columnIn(container);
  Object.defineProperty(column, "clientHeight", {
    value: shown,
    configurable: true,
  });
  Object.defineProperty(column, "scrollHeight", {
    value: shown + room,
    configurable: true,
  });
  column.getBoundingClientRect = () => rectAt(120, shown);
  return {
    scrollColumnTo(y: number) {
      Object.defineProperty(column, "scrollTop", {
        value: y,
        configurable: true,
      });
      fireEvent.scroll(column);
    },
  };
}
