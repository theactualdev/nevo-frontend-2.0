/**
 * BACK GOES WHERE THE ADMIN CAME FROM - one rule for every page that has a
 * back link (QA, 10 Oct: "that should be consistent product-wide").
 *
 * Each back link was hard-coded to one parent: a student opened from a class
 * sent the admin to all students, a class opened from a teacher sent them to
 * all classes, Compliance opened from IT & SSO sent them to the Overview. So
 * a link INTO a page now says where it was clicked from - `?back=` (the path)
 * and `?backLabel=` (what to call it) - and the page's back link uses that,
 * falling back to its usual parent when the page was opened any other way.
 *
 * Only this console's own paths are honoured. A `back` that is not an
 * `/admin` path - another site, a protocol-relative `//host`, a backslash
 * trick - is ignored, so the parameter cannot turn Back into a way off Nevo.
 */

export interface Back {
  href: string;
  label: string;
}

/** The longest label a back link will show; anything longer is cut. */
const MAX_LABEL = 60;

/** `href`, carrying where it was clicked from. */
export function withBack(href: string, back: Back): string {
  const sep = href.includes("?") ? "&" : "?";
  return `${href}${sep}back=${encodeURIComponent(back.href)}&backLabel=${encodeURIComponent(back.label)}`;
}

/** Whether a path is this console's own, and safe to send the admin to. */
export function isAdminPath(href: string): boolean {
  return (
    /^\/admin(?:[/?#]|$)/.test(href) && !href.startsWith("//") && !href.includes("\\")
  );
}

/**
 * Where the admin came from, read off a page's search params - or null when
 * the page was not opened from somewhere that said, or said something unsafe.
 */
export function readBack(params: {
  back?: string | string[];
  backLabel?: string | string[];
}): Back | null {
  const href = typeof params.back === "string" ? params.back : null;
  const label = typeof params.backLabel === "string" ? params.backLabel.trim() : "";
  if (!href || !label || !isAdminPath(href)) return null;
  return { href, label: label.slice(0, MAX_LABEL) };
}
