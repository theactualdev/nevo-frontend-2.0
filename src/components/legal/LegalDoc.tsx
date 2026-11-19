"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { LEGAL_RETURNS, legalOpenedFrom, legalReturnOf } from "@/lib/legal/returns";
import {
  LEGAL_DOCS,
  LEGAL_DRAFT_BADGE,
  LEGAL_FOOTER,
  LEGAL_VERSION_LINE,
  type LegalDocId,
} from "@/lib/mocks/legalDoc";
import { cn } from "@/lib/utils";

/**
 * Privacy Policy / Terms of Service (`Nevo Legal Doc`) - one scrollable page
 * with two pill tabs, reached from the activation consent line and from
 * anywhere else that needs to show the terms.
 *
 * The draft badge is not decoration: the wording is placeholder text pending
 * counsel, and the frame says so on the page. It stays until real text lands.
 *
 * THE WAY BACK IS SET BY WHERE IT WAS OPENED FROM (the frame's own rule;
 * `LEGAL_RETURNS`). It used to be "Back" to "/" from everywhere, so a parent
 * reading the privacy policy mid-consent was sent to the landing page. An
 * entry behind a token goes back through history - and only when this tab
 * followed that entry's link here and has history to go back through (see
 * `markLegalOpenedFrom`). Opened any other way, it says the plain "Back" to
 * "/", never "Back to consent" to somewhere that is not the consent.
 */
const noSubscription = () => () => {};

export function LegalDoc({
  doc,
  from,
  backHref = "/",
  backLabel = "Back",
}: {
  doc: LegalDocId;
  /** Where it was opened from - the `?from=` its links carry. */
  from?: string;
  backHref?: string;
  backLabel?: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<LegalDocId>(doc);
  const active = LEGAL_DOCS[tab];
  const entry = legalReturnOf(from);
  const way = entry ? LEGAL_RETURNS[entry] : null;
  // The server cannot see the tab; it draws the way back, and the client
  // takes it away unless this tab came here from that entry.
  const cameFromEntry = useSyncExternalStore(
    noSubscription,
    () => entry !== null && window.history.length > 1 && legalOpenedFrom(entry),
    () => true,
  );

  const BACK =
    "inline-flex cursor-pointer items-center gap-[7px] text-sm text-nevo-near-black/60 transition-transform active:scale-[0.99]";
  const chevron = (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );

  return (
    <div className="mx-auto w-full max-w-[720px] px-6 py-12 text-nevo-near-black">
      {way?.href ? (
        <Link href={way.href} className={BACK}>
          {chevron}
          {way.label}
        </Link>
      ) : way && cameFromEntry ? (
        <button
          type="button"
          onClick={() => router.back()}
          className={cn(BACK, "border-none bg-transparent p-0")}
        >
          {chevron}
          {way.label}
        </button>
      ) : (
        <Link href={backHref} className={BACK}>
          {chevron}
          {backLabel}
        </Link>
      )}

      <div className="mt-6 flex gap-2">
        {(["privacy", "terms"] as const).map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "cursor-pointer rounded-full px-4 py-[9px] text-[13.5px] font-semibold transition-colors duration-150",
              tab === id
                ? "bg-nevo-navy text-nevo-cream"
                : "bg-transparent text-nevo-near-black/55",
            )}
          >
            {LEGAL_DOCS[id].title}
          </button>
        ))}
      </div>

      <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-nevo-violet/20 px-3 py-[5px] text-[11.5px] font-semibold tracking-[0.02em] text-nevo-navy">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
        </svg>
        {LEGAL_DRAFT_BADGE}
      </div>

      <h1 className="mt-[18px] text-[34px] leading-[1.15] font-semibold tracking-[-0.02em]">
        {active.title}
      </h1>
      <p className="mt-3 text-[15px] leading-[1.65] text-nevo-near-black/62">
        {active.intro}
      </p>
      <p className="mt-3.5 text-[13px] text-nevo-near-black/50">
        {LEGAL_VERSION_LINE}
      </p>

      <div className="mt-8 flex flex-col gap-7">
        {active.sections.map((sec) => (
          <div key={sec.num}>
            <div className="flex items-baseline gap-3">
              <span className="shrink-0 text-[13px] font-bold text-nevo-violet tabular-nums">
                {sec.num}
              </span>
              <h2 className="text-[20px] font-semibold tracking-[-0.01em] text-nevo-near-black">
                {sec.title}
              </h2>
            </div>
            <p className="mt-2.5 pl-[26px] text-[15px] leading-[1.7] text-nevo-near-black/72">
              {sec.body}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-10 rounded-xl bg-nevo-cream-elevated px-6 py-5 shadow-elevation-1">
        <div className="text-[15.5px] font-semibold">{LEGAL_FOOTER.heading}</div>
        <p className="mt-2 text-[14.5px] leading-[1.6] text-nevo-near-black/70">
          {LEGAL_FOOTER.body}
        </p>
      </div>
    </div>
  );
}
