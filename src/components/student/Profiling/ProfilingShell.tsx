"use client";

import Image from "next/image";
import { useContext, type ReactNode } from "react";
import { QuestMap, QuestSegments } from "./QuestMap";

/**
 * Shared shell for every baseline-profiling screen (SCRUM-104): the wordmark
 * top-left with the quest map centred (stacked on mobile), the screen's content
 * below. No back navigation, no skip, no exit - the flow is a straight line by
 * design. The map has as many segments as the run has modules (`QuestSegments`).
 */
export function ProfilingShell({
  filled,
  active,
  children,
}: {
  filled: number;
  active: number;
  children: ReactNode;
}) {
  const segments = useContext(QuestSegments);
  return (
    <div className="flex min-h-[100dvh] flex-col bg-nevo-cream text-nevo-near-black">
      <div className="relative flex shrink-0 flex-col items-center gap-4 px-5 pt-4 sm:min-h-11 sm:flex-row sm:justify-center sm:gap-0 sm:px-8 sm:pt-6">
        <Image
          src="/brand/nevo-wordmark.png"
          alt="Nevo"
          width={344}
          height={116}
          priority
          className="h-4 w-auto self-start sm:absolute sm:top-6 sm:left-8 sm:h-[18px]"
        />
        {segments !== null && segments > 0 && (
          <QuestMap segments={segments} filled={filled} active={active} />
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center px-5 py-5 sm:px-8 sm:py-8">
        {children}
      </div>
    </div>
  );
}

/**
 * The Nevo face + speech-bubble instruction row used inside the modules.
 *
 * `phoneText` is for the few instructions a frame words differently on a
 * phone, where the layout stacks and "side" stops describing what is on screen.
 */
export function AvatarBubble({
  text,
  phoneText,
}: {
  text: string;
  phoneText?: string;
}) {
  return (
    <div className="flex max-w-[420px] items-center gap-3">
      <svg viewBox="0 0 44 44" className="size-10 shrink-0 sm:size-11" aria-hidden>
        <circle cx="22" cy="22" r="22" fill="#3b3f6e" />
        <circle cx="16" cy="19" r="2.4" fill="#f7f1e6" />
        <circle cx="28" cy="19" r="2.4" fill="#f7f1e6" />
        <path
          d="M16 27 Q22 32 28 27"
          fill="none"
          stroke="#f7f1e6"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
      <div
        role="status"
        className="rounded-[12px] border border-nevo-navy/15 bg-nevo-cream-elevated px-[15px] py-[11px] text-[15px] leading-[1.4] font-medium text-pretty text-nevo-near-black sm:text-base"
      >
        {phoneText ? (
          <>
            <span className="sm:hidden">{phoneText}</span>
            <span className="hidden sm:inline">{text}</span>
          </>
        ) : (
          text
        )}
      </div>
    </div>
  );
}
