import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Back } from "./back";

/**
 * The back link at the top of a page: "← JSS 2A". Where the admin came from
 * when the link that opened this page said so (`back`), else the page's own
 * parent (`fallback`). See `back.ts`.
 */
export function BackLink({
  back,
  fallback,
  className,
}: {
  back?: Back | null;
  fallback: Back;
  className?: string;
}) {
  const to = back ?? fallback;
  return (
    <Link
      href={to.href}
      className={cn(
        "text-[13.5px] font-semibold text-nevo-navy hover:opacity-75",
        className,
      )}
    >
      &larr; {to.label}
    </Link>
  );
}
