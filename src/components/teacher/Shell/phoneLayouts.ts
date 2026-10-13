import { TEACHER_NAV } from "./teacherNav";

/**
 * C19 Teacher Phone Layouts (design, 12 Oct): "The console is a desktop and
 * tablet product. These are the screens a teacher reaches from a notification
 * email or an invite link on their phone ... Every other teacher screen shows
 * the shared 'needs a bigger screen' state."
 *
 * THE LIST GROWS AS EACH PHONE LAYOUT LANDS. A route belongs here only once
 * it is actually laid out for 375 wide - listing one early would hand a phone
 * the tablet layout squeezed, which is exactly what C19 says not to do. The
 * sign-in pages are outside the console shell and are not gated at all.
 */
const PHONE_READY: readonly RegExp[] = [
  // B1 - what most notifications open.
  /^\/teacher\/dashboard\/?$/,
  // A6 - help is reachable signed out, from any link.
  /^\/teacher\/help\/?$/,
  // B3 - the one-thumb Clear PIN a "forgot PIN" notification opens.
  /^\/teacher\/students\/[^/]+\/clear-pin\/?$/,
  // B2 - a child's profile, from an attention notification.
  /^\/teacher\/students\/[^/]+\/?$/,
  // B4/B5 - a thread, from a reply notification. Connect itself decides: a
  // named thread is laid out for a phone, the list is not (ConnectView).
  /^\/teacher\/connect\/?$/,
];

/**
 * Screens that draw their own phone bar - a back arrow and where it goes, in
 * place of the menu (C19 B2, B3, B4) - so the shell's bar stands aside.
 */
const OWNS_PHONE_BAR: readonly RegExp[] = [
  /^\/teacher\/students\/[^/]+\/clear-pin\/?$/,
  /^\/teacher\/students\/[^/]+\/?$/,
];

export function ownsPhoneBar(pathname: string): boolean {
  return OWNS_PHONE_BAR.some((r) => r.test(pathname));
}

/** Ask Nevo listens for this; the phone drawer's row sends it (C19 C1). */
export const OPEN_ASK_NEVO = "nevo:open-ask-nevo";

export function hasPhoneLayout(pathname: string): boolean {
  return PHONE_READY.some((r) => r.test(pathname));
}

/**
 * The phone app bar's title: the section a route belongs to, in the rail's
 * own words, so a phone and a desktop name a place the same way.
 */
export function phoneTitle(pathname: string): string {
  const tab = TEACHER_NAV.find((t) => pathname.startsWith(t.href));
  if (tab) return tab.name;
  // A student's pages sit under a class, as the rail has it.
  if (pathname.startsWith("/teacher/students")) return "Classes";
  if (pathname.startsWith("/teacher/profile")) return "Settings";
  if (pathname.startsWith("/teacher/notifications")) return "Notifications";
  if (pathname.startsWith("/teacher/help")) return "Help & support";
  return "Nevo";
}
