/**
 * The accessibility preferences, applied before the first paint (rule 6).
 *
 * `AccessibilityProvider` reads them in an effect, which runs after React has
 * hydrated and the browser has painted. So every load drew one frame - on a
 * slow school connection, many - at default size, contrast and motion, then
 * snapped to what the child had chosen. A child who needs larger text met the
 * small version first, every time, and the snap itself is motion they had
 * asked not to see.
 *
 * This runs inline in `<head>` (see `app/layout.tsx`), synchronously, while
 * the browser is still parsing: it reads the same keys the provider reads and
 * sets the same three attributes on `<html>`. CSS does the rest - motion and
 * contrast already keyed off those attributes, and text size now does too
 * (`.nevo-text-zoom`, globals.css). The provider then writes the identical
 * values, so nothing moves when it does. The Next 16 guide's own pattern:
 * `node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md`.
 *
 * A plain module, not "use client": the root layout is a server component and
 * needs the string itself, not a client reference to it.
 *
 * Absence is nothing: no stored preferences, or storage that will not read,
 * leaves `<html>` exactly as the server sent it.
 */

/** Where the device-level choice lives; a signed-in account's is `:<userId>`. */
export const A11Y_STORAGE_KEY = "nevo:a11y";

/**
 * `lib/auth/session`'s key, duplicated because this string must stand alone
 * in a `<script>`. The test runs this script against the real session store,
 * so the two cannot drift apart unnoticed.
 */
const SESSION_STORAGE_KEY = "nevo.auth.session";

export const A11Y_BOOT_SCRIPT = `(function(){try{var d=document.documentElement,k=${JSON.stringify(
  A11Y_STORAGE_KEY,
)},s=JSON.parse(localStorage.getItem(${JSON.stringify(
  SESSION_STORAGE_KEY,
)})||"null");if(s&&s.userId&&!(Date.parse(s.expiresAt)<=Date.now()))k+=":"+s.userId;var p=JSON.parse(localStorage.getItem(k)||"null");if(!p||typeof p!=="object")return;d.setAttribute("data-reduced-motion",p.reducedMotion===true?"true":"false");d.setAttribute("data-contrast",p.highContrast===true?"high":"normal");if(/^(s|m|l|xl)$/.test(p.textSize))d.setAttribute("data-text-size",p.textSize)}catch(e){}})()`;
