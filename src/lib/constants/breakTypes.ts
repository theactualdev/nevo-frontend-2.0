/**
 * Break type definitions (Frontend Architecture Sections 1 & 5).
 *
 * Break decisions are the engine's - it has the full signal picture, and
 * nothing on this side times or primes one (frontend §5b). The player renders
 * the break the engine or the plan names.
 */
export const BREAK_TYPES = {
  /** Brief pause. */
  MICRO: "micro",
  /** Movement / stretching prompt. */
  MOVEMENT: "movement",
  /** Consolidation of what was just learned. */
  CONSOLIDATION: "consolidation",
  /** Full break. */
  FULL: "full",
} as const;

export type BreakType = (typeof BREAK_TYPES)[keyof typeof BREAK_TYPES];
