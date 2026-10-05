"use client";

import Link from "next/link";
import { useSupportContact } from "@/hooks/useSupportContact";

/**
 * Help & support.
 *
 * Design ruled it is ONE SCREEN, not a knowledge base: support email, WhatsApp
 * number, response time. No frame draws it, so the layout is ours and the three
 * facts are design's.
 *
 * It was CONTENT-BLOCKED for a week, not design-blocked. The email existed; the
 * WhatsApp number and the response time existed nowhere in the product, and the
 * two response-time strings that did exist were a landing-page sales promise
 * and an NDPA data-rights obligation. Borrowing either would have invented a
 * commitment Nevo had not made. Backend supplied all three on 17 Sep.
 *
 * Until then the nav item closed the menu and did nothing, which is the one
 * route out of the console when something has gone wrong.
 */

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-nevo-near-black/8 py-5 last:border-b-0">
      <p className="text-[12.5px] font-semibold tracking-[0.04em] text-nevo-near-black/55 uppercase">
        {label}
      </p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

export function HelpAndSupport() {
  const { contact, loading, failed } = useSupportContact();

  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[620px]">
        <h2 className="text-[23px] font-semibold tracking-[-0.015em] text-nevo-near-black xl:text-[26px]">
          Help &amp; support
        </h2>
        <p className="mt-[7px] text-sm leading-[1.55] text-nevo-near-black/65 xl:text-[15px]">
          A person will read this, not a bot. Tell us what you were doing and
          what happened.
        </p>

        {loading && (
          <div className="mt-7 flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-[76px] animate-pulse rounded-[12px] bg-nevo-cream-elevated"
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
          <div className="mt-7 rounded-[12px] bg-nevo-cream-elevated p-6 shadow-elevation-1">
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
          <div className="mt-7 rounded-[12px] bg-nevo-cream-elevated px-6 shadow-elevation-1">
            <Row label="Email">
              <a
                href={`mailto:${contact.email}`}
                className="cursor-pointer text-[15.5px] font-medium text-nevo-navy underline underline-offset-[3px]"
              >
                {contact.email}
              </a>
            </Row>

            <Row label="WhatsApp">
              {/*
                The href is the SERVER'S link, never assembled here. `wa.me`
                takes digits only and fails silently on a plus or a space, so a
                link built from the display number renders as a dead one rather
                than a malformed one.
              */}
              <a
                href={contact.whatsapp.link}
                target="_blank"
                rel="noopener noreferrer"
                className="cursor-pointer text-[15.5px] font-medium text-nevo-navy underline underline-offset-[3px]"
              >
                {contact.whatsapp.number}
              </a>
            </Row>

            {/* Absent is not "soon": with no promise from the server the
                row is left out, rather than drawn with nothing in it. */}
            {contact.responseTime && (
              <Row label="When you&rsquo;ll hear back">
                <p className="text-[15.5px] text-nevo-near-black/78">
                  {contact.responseTime}
                </p>
              </Row>
            )}
          </div>
        )}

        <Link
          href="/teacher/dashboard"
          className="mt-7 inline-flex h-11 cursor-pointer items-center rounded-[10px] border-[1.5px] border-nevo-navy/35 px-4 text-sm font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6"
        >
          Back to your dashboard
        </Link>
      </div>
    </div>
  );
}
