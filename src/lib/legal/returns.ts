import type { LegalDocId } from "@/lib/mocks/legalDoc";

/**
 * WHERE PRIVACY & TERMS WAS OPENED FROM, and the way back from it. The frame
 * (`Nevo Privacy and Terms`) is "one screen, four entry points, back-action
 * set by where you came from": Entry 1 "Back to activation", Entry 2 "Back to
 * consent", and a persistent link in every portal (Entry 4, "Back to
 * settings").
 *
 * An entry with no address is one the page cannot rebuild: the consent and
 * activation screens live behind a token in their own link, and that token is
 * never copied into this page's address. A parent who shares the privacy page
 * would otherwise share their consent link with it. Those entries go back
 * through the browser's own history instead.
 *
 * The parent portal's own pages are named in the portal's own words: "Back to
 * home" is My Data's way home, and "Settings" is the page's title. The data
 * page's heading names the child, so its way back is the plain "Back".
 */
export const LEGAL_RETURNS = {
  activation: { label: "Back to activation", href: null },
  consent: { label: "Back to consent", href: null },
  "parent-home": { label: "Back to home", href: "/parent-portal" },
  "parent-settings": { label: "Back to settings", href: "/parent-portal/settings" },
  "parent-data": { label: "Back", href: null },
} as const satisfies Record<string, { label: string; href: string | null }>;

export type LegalReturn = keyof typeof LEGAL_RETURNS;

/** The entry an address names, or none for anything this page does not know. */
export function legalReturnOf(from: string | null | undefined): LegalReturn | null {
  return from && Object.hasOwn(LEGAL_RETURNS, from) ? (from as LegalReturn) : null;
}

/** A link to Privacy & Terms that says where it was opened from. */
export function legalHref(doc: LegalDocId, from: LegalReturn): string {
  return `/legal/${doc}?from=${from}`;
}

/*
 * OPENED FROM THAT ENTRY, IN THIS TAB. History alone cannot say where back
 * goes: a new tab opened straight on the page can already hold an entry (the
 * blank page it opened on), and back from there is not the consent. So the
 * link marks its own tab as it is followed, and only a tab with the mark and
 * somewhere to go back to is offered "Back to consent". Per tab
 * (sessionStorage), never shared, and nothing in it but the entry's name.
 */
const MARK = "nevo.legal.openedFrom";

/** Called as a history-backed link is followed. */
export function markLegalOpenedFrom(from: LegalReturn): void {
  try {
    window.sessionStorage.setItem(MARK, from);
  } catch {
    // Storage refused (private mode): the page offers the plain way back.
  }
}

/** Whether this tab followed a link from `from` into the page. */
export function legalOpenedFrom(from: LegalReturn): boolean {
  try {
    return window.sessionStorage.getItem(MARK) === from;
  } catch {
    return false;
  }
}
