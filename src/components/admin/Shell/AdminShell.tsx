"use client";

import { usePathname } from "next/navigation";
import { Fragment } from "react";
import { AdminSidebar } from "./AdminSidebar";
import { DpaGate } from "./DpaGate";
import { TooNarrow } from "./TooNarrow";
import { useYearGroupLabels } from "./useYearGroupLabels";

/**
 * The chrome every admin screen sits in: the rail, then a scrolling content
 * column. Desktop is 1440x900 and tablet 1024x768 with the rail collapsed -
 * there is no mobile frame anywhere in the admin set.
 *
 * THE WIDTHS (Lydia, 16 Nov, SCRUM-347): desktop starts at 1280 (`xl:`) in
 * every console, and 1024-1279 is the wide tablet; 768-1023 is the tablet
 * layout; above 1440 the 1040 column holds and centres; below 768 the console
 * is not supported (`TooNarrow`). No admin screen switches at 1024 (`lg:`).
 *
 * ONBOARDING IS THE ONE EXCEPTION, and it is not a styling preference: D1 is a
 * single-column wizard with NO SIDEBAR, because the workspace does not exist
 * until it completes. There is nothing to navigate to, and SCRUM-39 also asks
 * for no back-out escape. A nested layout cannot remove a parent's chrome in
 * the App Router, so the shell steps aside here rather than every other admin
 * route moving into a group - a smaller change, and one that does not touch
 * files other people are working in.
 */
const BARE_ROUTES = ["/admin/onboarding"];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bare = BARE_ROUTES.some((p) => pathname.startsWith(p));
  // The school's own year-group labels, for every screen - see the hook.
  const labelsKey = useYearGroupLabels(!bare);

  /*
   * 768 IS THE FLOOR (Lydia, 16 Nov, SCRUM-347). Below it, onboarding
   * included, the console gives way to `TooNarrow`. CSS decides, as every
   * other width switch here does, so the first paint is already right and no
   * width is measured in script.
   */
  if (bare) {
    return (
      <>
        <div className="contents max-md:hidden">{children}</div>
        <TooNarrow />
      </>
    );
  }

  return (
    <>
      <div className="flex h-dvh min-h-0 w-full overflow-hidden bg-nevo-cream max-md:hidden">
        <AdminSidebar />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <DpaGate>
            <Fragment key={labelsKey}>{children}</Fragment>
          </DpaGate>
        </main>
      </div>
      <TooNarrow />
    </>
  );
}
