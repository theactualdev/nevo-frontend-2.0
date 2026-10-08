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
/** SCRUM-88: "Auto-dismiss after 1.5 seconds". */
export const SIGNED_OUT_HOLD_MS = 1500;
