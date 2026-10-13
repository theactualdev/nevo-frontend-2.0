/**
 * The tablet frame a child's pre-login screen sits in at desktop width (D207).
 *
 * Design's reference: the pre-login and shared-device flow "is tablet-only and
 * letterboxes at desktop width (≥1024) - by design, not as a fallback. It has
 * no desktop composition and must not be given one." So from 1024px wide the
 * screen is drawn in a 768px frame centred on near-black, laid out exactly as
 * it is on a tablet: the variants in `globals.css` answer for the frame, not
 * the window, while a screen is inside one.
 *
 * BY WIDTH, NOT BY DEVICE. A touch screen 1024 or wider is letterboxed too.
 *
 * Below 1024 it draws nothing: both boxes are `contents`, so a phone or a
 * tablet lays the screen out as it always did, in whatever its parent is. The
 * frame's geometry and why it is what it is live with the rules in
 * `globals.css`, which key on the two attributes here.
 *
 * WHICH SCREENS. The drawn pre-login phase, the 768 x 1024 canvas: Welcome,
 * Teacher Join and 05 Entry, the Transition and the profiling run, the PIN
 * door and the picker (00, 28c), 00c, Forgot PIN, SSO, and the door's own
 * states - Account Closed (28d), on pause, the holds (00d, 00e). NOT the
 * learning notice, PIN creation or You're In, which are drawn on the
 * signed-in canvas with desktop compositions of their own, and not the
 * session-end screens (28, 28a). Applied by route where every screen on the
 * route is one of these (`DoorRotateLock`, `StudentShell`), and by the screen
 * where a route mixes them (the onboarding sequence, the session-end door).
 */
export function Letterbox({ children }: { children: React.ReactNode }) {
  return (
    <div data-nevo-letterbox="" className="contents">
      <div data-nevo-letterbox-frame="" className="contents">
        {children}
      </div>
    </div>
  );
}
