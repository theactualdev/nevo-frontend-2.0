"use client";

import { Component, type ReactNode } from "react";

/**
 * THE SOLVER, FENCED (Teslim, 19 Oct): "A renderer failure on the device
 * should use the source body and report the failure."
 *
 * Nothing stood between the co-construction solver and the lesson route's
 * error boundary, so a calculation that threw while it drew took the whole
 * lesson with it - "Something went wrong", every segment gone, for one
 * drawing. This catches it at the segment: the child is given `fallback`,
 * the segment's own text, at once and in place, and `onFailed` tells the
 * player, which makes that segment its text for the rest of the visit and
 * reports it.
 *
 * A render failure only: what the solver throws from a tap is the browser's,
 * as everywhere else in the app. Keyed by segment, so one segment's failure
 * is never carried onto the next.
 */
export class CalculationBoundary extends Component<
  {
    children: ReactNode;
    /** The segment's text, drawn the moment the solver fails. */
    fallback: ReactNode;
    /** What the solver threw, once. */
    onFailed: (error: unknown) => void;
  },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    this.props.onFailed(error);
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
