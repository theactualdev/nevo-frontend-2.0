/**
 * The two pieces of chrome every staff password screen shares, as the frames
 * draw them (Nevo Set Password, C02d):
 *
 * - THE WORDMARK, top-left of the page. The sign-in door had it; the screens
 *   a teacher reaches from it - set password, reset, link sent, link expired -
 *   did not, so the brand vanished the moment they pressed anything. Fixed to
 *   the page corner, because these screens sit inside the auth layout's
 *   centred column and the frame places it against the page, not the column.
 *   It is the real logo from `public/brand`, cropped as the sign-in crops it.
 *
 * - THE CONTACT FOOTER, under a hairline: "Having trouble? Contact your
 *   school administrator." C02d puts it under every state, sent and expired
 *   included, where it used to appear on the first step only.
 */

export function AuthWordmark() {
  return (
    <span className="fixed top-[34px] left-[clamp(24px,4vw,40px)] z-[2] block h-[18px] w-[62px] overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/logo-wordmark-purple.png"
        alt="Nevo"
        className="absolute block h-[181px] w-[181px] max-w-none -translate-x-[66px] -translate-y-[87px]"
      />
    </span>
  );
}

export function ContactFooter({ className = "mt-[22px]" }: { className?: string }) {
  return (
    <div
      className={`${className} w-full border-t border-nevo-near-black/10 pt-5 text-center`}
    >
      <span className="text-[13px] text-nevo-near-black/50">
        Having trouble? Contact your school administrator.
      </span>
    </div>
  );
}
