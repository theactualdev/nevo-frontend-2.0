import { DENSITY, type Density } from "@/lib/constants";
import {
  ADJUSTMENT_ACTIONS,
  type AdjustmentAction,
} from "@/lib/constants/affect";

/**
 * The engine's instruction, as a reading density — the join design ruled on
 * 23 Sep.
 *
 * *"`simplify` is the same operation as the 17 Sep Simplify control. One is
 * asked for by the child, one is decided by the engine, and what happens on
 * screen is identical. Build it as a single path with two callers."*
 *
 * **SO THIS IS THE JOIN AND NOT A SECOND IMPLEMENTATION.** The child's chip
 * sets `density`; the engine's instruction sets the system's density; both end
 * up in the same `effectiveDensity` and the same `TextSegment`. Two code paths
 * that both "simplify" would eventually disagree about what simplifying is,
 * and a child would get a different screen depending on who asked.
 *
 * **IT IS ALSO WHY SIMPLIFY IS NO LONGER BLOCKED ON `textVariant`.** The
 * question of what `textVariant.body` is relative to `segment.body` is still
 * open and still worth answering — but it was never what stood between this
 * instruction and the screen.
 *
 * The three names are identical on both sides (`simplify`, `slower`, `expand`
 * are `Density`'s own values), which is a coincidence worth not relying on:
 * mapping them explicitly means the day either list moves, this stops
 * compiling rather than quietly mapping a new action onto an old reshape.
 */
const DENSITY_FOR_ACTION: Partial<Record<AdjustmentAction, Density>> = {
  [ADJUSTMENT_ACTIONS.SIMPLIFY]: DENSITY.SIMPLIFY,
  [ADJUSTMENT_ACTIONS.SLOWER]: DENSITY.SLOWER,
  [ADJUSTMENT_ACTIONS.EXPAND]: DENSITY.EXPAND,
};

/**
 * The density an instruction asks for, or **null when it asks for something
 * else entirely**.
 *
 * `offer_hint` and `show_socratic_panel` are instructions about the same
 * screen and are not densities; null is the honest answer for them, not a
 * default. The caller keeps whatever density was already in force.
 */
export function densityForAction(
  action: AdjustmentAction | null | undefined,
): Density | null {
  if (!action) return null;
  return DENSITY_FOR_ACTION[action] ?? null;
}
