/**
 * One "Ready for another look" chip (frame 22): a concept the scheduler says
 * is ready to be seen again. Subject Detail draws a row of them; Home draws
 * the one the engine puts first (SCRUM-75). One look for both, so the two
 * cannot drift apart.
 */
export const DUE_CHIP =
  "rounded-full bg-nevo-navy/10 px-3 py-1.5 text-[13px] text-nevo-navy ring-1 ring-nevo-navy/20 ring-inset";

/** The chip as a way into its review session. */
export const DUE_CHIP_LINK = `${DUE_CHIP} cursor-pointer transition hover:bg-nevo-navy/[0.16] active:scale-[0.98]`;
