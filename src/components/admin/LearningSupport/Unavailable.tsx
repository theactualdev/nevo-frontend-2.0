"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { PRIMARY_BTN } from "../Roster/primitives";

/**
 * SCRUM-247: "A person who does not hold it sees the progress report exporter
 * and adaptation history as unavailable, not as missing."
 *
 * So the control stays where it always is, switched off, with the reason and
 * the way to get it beside it. Hiding it would leave an administrator unable
 * to tell a feature they lack from one that does not exist.
 */
export const NEEDS_LEARNING_SUPPORT =
  "It needs Learning Support, which another administrator can give you on your record in Admin Team.";

export function UnavailableAction({
  label,
  what,
  align = "start",
  className,
}: {
  /** The control's own words, as it reads when available. */
  label: React.ReactNode;
  /** What is unavailable, for the line under it: "Progress reports". */
  what: string;
  align?: "start" | "end";
  className?: string;
}) {
  const why = useId();
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5",
        align === "end" ? "items-end text-right" : "items-start",
        className,
      )}
    >
      <button type="button" disabled aria-describedby={why} className={PRIMARY_BTN}>
        {label}
      </button>
      <p id={why} className="m-0 max-w-[44ch] text-[12.5px] leading-[1.5] text-nevo-near-black/58">
        {`${what} need Learning Support. Another administrator can give it to you on your record in Admin Team.`}
      </p>
    </div>
  );
}
