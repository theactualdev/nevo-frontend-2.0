"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSupportContact } from "@/hooks/useSupportContact";
import { useSystemMessages } from "@/components/shared/SystemMessages";

/**
 * C17 Help & support.
 *
 * Design ruled it is ONE SCREEN, not a knowledge base: two ways to reach a
 * person and how quickly they'll hear back. This was built before C17 was
 * drawn, as plain label rows under a subtitle of our own; it now follows the
 * frame - a "Settings" back link, the frame's subtitle, a card per contact
 * with an icon tile and a copy button, and the response time beside a clock.
 *
 * It was CONTENT-BLOCKED for a week, not design-blocked. The email existed; the
 * WhatsApp number and the response time existed nowhere in the product, and the
 * two response-time strings that did exist were a landing-page sales promise
 * and an NDPA data-rights obligation. Borrowing either would have invented a
 * commitment Nevo had not made. Backend supplied all three on 17 Sep, and the
 * frame's "We usually reply within one working day." is therefore the
 * server's sentence, never ours.
 *
 * Until then the nav item closed the menu and did nothing, which is the one
 * route out of the console when something has gone wrong.
 */

const COPIED_FOR_MS = 1600;

const MAIL_ICON = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="M4 7l8 6 8-6" />
  </svg>
);

const CHAT_ICON = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z" />
  </svg>
);

const COPY_GLYPH = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="9" y="9" width="11" height="11" rx="2.5" />
    <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
  </svg>
);

const CHECK_GLYPH = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

const CLOCK_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v4l3 2" />
  </svg>
);

interface Contact {
  id: "email" | "wa";
  label: string;
  value: string;
  href: string;
  copyText: string;
  icon: React.ReactNode;
  external?: boolean;
}

export function HelpAndSupport() {
  const { contact, loading, failed } = useSupportContact();
  const say = useSystemMessages();
  const [copied, setCopied] = useState<Contact["id"] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  /*
   * The browser gets a vote. `navigator.clipboard` is absent on an insecure
   * origin and rejects when the page is unfocused or permission is refused.
   * The frame's handler swallows both and says "copied" anyway; here nothing
   * is claimed until the write has resolved.
   */
  const copy = (c: Contact) => {
    try {
      const write = navigator.clipboard?.writeText(c.copyText);
      if (!write) return;
      write.then(
        () => {
          if (timer.current) clearTimeout(timer.current);
          setCopied(c.id);
          timer.current = setTimeout(() => setCopied(null), COPIED_FOR_MS);
          say.show({ kind: "confirm", message: `${c.label} copied` });
        },
        () => {},
      );
    } catch {
      // Nothing was copied, so nothing is said.
    }
  };

  const contacts: Contact[] = contact
    ? [
        {
          id: "email",
          label: "Email us",
          value: contact.email,
          href: `mailto:${contact.email}`,
          copyText: contact.email,
          icon: MAIL_ICON,
        },
        {
          id: "wa",
          label: "WhatsApp",
          value: contact.whatsapp.number,
          /*
           * The href is the SERVER'S link, never assembled here. `wa.me`
           * takes digits only and fails silently on a plus or a space, so a
           * link built from the display number renders as a dead one rather
           * than a malformed one. The copied text is the number with its
           * reading spaces taken out, as the frame copies it.
           */
          href: contact.whatsapp.link,
          copyText: contact.whatsapp.number.replace(/\s+/g, ""),
          icon: CHAT_ICON,
          external: true,
        },
      ]
    : [];

  return (
    <div className="mx-auto w-full max-w-[1040px] px-12 py-11 xl:px-16 xl:py-14">
      <div className="max-w-[540px] xl:max-w-[560px]">
        <Link
          href="/teacher/profile"
          className="inline-flex cursor-pointer items-center gap-[7px] text-[13.5px] text-nevo-near-black/60 transition-colors hover:text-nevo-navy xl:text-sm"
        >
          <svg className="size-4 xl:size-[17px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 6l-6 6 6 6" />
          </svg>
          Settings
        </Link>
        <h1 className="mt-[18px] text-[26px] font-semibold tracking-[-0.018em] text-nevo-near-black xl:mt-5 xl:text-[30px]">
          Help &amp; support
        </h1>
        <p className="mt-2.5 text-[15px] leading-[1.6] text-pretty text-nevo-near-black/66 xl:mt-3 xl:text-base">
          Reach a real person on the Nevo team whenever you need a hand.
          We&rsquo;re glad to help.
        </p>

        {loading && (
          <div className="mt-[30px] flex flex-col gap-3.5 xl:mt-9 xl:gap-4">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="h-[92px] animate-pulse rounded-[12px] bg-nevo-cream-elevated"
              />
            ))}
          </div>
        )}

        {/*
          NO HARDCODED FALLBACK. The email is the one fact we could hardcode,
          and doing so would put a stale address on the screen the day it
          changes - on the one screen someone reaches when nothing else works.
          Saying we could not load it is worse than useless only if there is
          nothing else to offer, and there is: the page they came from.
        */}
        {failed && (
          <div className="mt-[30px] rounded-[12px] bg-nevo-cream-elevated p-6 shadow-elevation-1 xl:mt-9">
            <h3 className="text-[15.5px] font-semibold text-nevo-near-black">
              We couldn&rsquo;t load our contact details
            </h3>
            <p className="mt-2 text-sm leading-[1.55] text-nevo-near-black/68">
              That is our end, not yours. Try again in a moment, and if your
              school has an IT contact they can reach us too.
            </p>
          </div>
        )}

        {contact && (
          <>
            <div className="mt-[30px] flex flex-col gap-3.5 xl:mt-9 xl:gap-4">
              {contacts.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 rounded-[12px] bg-nevo-cream-elevated py-1.5 pr-2.5 pl-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
                >
                  <a
                    href={c.href}
                    {...(c.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-[18px] rounded-[10px] py-4 pr-3 pl-4 transition-[filter] duration-150 hover:brightness-[0.985]"
                  >
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-[12px] bg-nevo-navy/10 text-nevo-navy">
                      {c.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] font-semibold tracking-[0.02em] text-nevo-near-black/50 uppercase xl:text-[13px]">
                        {c.label}
                      </span>
                      <span className="mt-[5px] block text-lg font-semibold tracking-[-0.01em] break-words text-nevo-near-black xl:text-xl">
                        {c.value}
                      </span>
                    </span>
                  </a>
                  <button
                    type="button"
                    aria-label={`Copy ${c.value}`}
                    onClick={() => copy(c)}
                    className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-[10px] text-nevo-navy transition-colors duration-[120ms] hover:bg-nevo-navy/6"
                  >
                    {copied === c.id ? CHECK_GLYPH : COPY_GLYPH}
                  </button>
                </div>
              ))}
            </div>

            {/* Absent is not "soon": with no promise from the server the
                line is left out, rather than drawn with nothing in it. */}
            {contact.responseTime && (
              <div
                data-response-time
                className="mt-6 flex items-center gap-[11px] xl:mt-7"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-nevo-violet/20 text-nevo-navy xl:size-[34px]">
                  {CLOCK_ICON}
                </span>
                <p className="text-[15px] leading-[1.5] text-nevo-near-black/72 xl:text-[15.5px]">
                  {contact.responseTime}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
