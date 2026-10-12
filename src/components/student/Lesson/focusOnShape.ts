/**
 * THE FOCUS RING ON THE SHAPE A CHILD SEES, where a control is touched at
 * 44px but drawn smaller inside it (a key-term chip, the affective pill). The
 * console's ring (globals.css) outlined the hit area: a square box around a
 * round chip. So the hit area drops it, and the drawn shape inside takes the
 * same 2px navy ring, 2px clear, following its own corners. The hit area
 * carries `group`.
 */
export const FOCUS_ON_SHAPE = {
  hit: "focus-visible:outline-none",
  shape:
    "group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-nevo-navy",
} as const;
