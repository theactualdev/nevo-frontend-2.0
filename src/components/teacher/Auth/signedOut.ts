import { MESSAGE_LEAVES_AFTER_MS } from "@/lib/constants/systemMessages";

/**
 * SCRUM-88 step 3: after signing out, a brief "Signed out" on the door.
 *
 * It travels on the URL because signing out is a HARD navigation - the page
 * that knew is gone by the time the door draws - and the URL is what the door
 * reads on the server as well, so the line is in its first paint. It carries
 * nothing about who signed out.
 */
export const SIGNED_OUT_PARAM = "signedOut";
export const SIGNED_OUT_DOOR = `/auth/teacher?${SIGNED_OUT_PARAM}=1`;
/** "Signed out" - SCRUM-88's words. */
export const SIGNED_OUT_LINE = "Signed out";
/**
 * The shared bar's own dwell, not SCRUM-88's 1.5 seconds. Design, 12 Oct
 * (`CLAUDE-reference.md`): "One message pattern across the console: the
 * shared bar, top centre, ~5s. Signed-out and every other system
 * confirmation use it ... never a bottom-centre or 1.5s one-off."
 */
export const SIGNED_OUT_HOLD_MS = MESSAGE_LEAVES_AFTER_MS;
