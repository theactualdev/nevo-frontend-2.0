"use client";

import { usePathname } from "next/navigation";
import { Fragment } from "react";
import { AdminSidebar } from "./AdminSidebar";
import { useYearGroupLabels } from "./useYearGroupLabels";

/**
 * The chrome every admin screen sits in: the rail, then a scrolling content
 * column. Desktop is 1440x900 and tablet 1024x768 with the rail collapsed -
 * there is no mobile frame anywhere in the admin set.
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
  if (bare) return <>{children}</>;

  return (
    <div className="flex h-dvh min-h-0 w-full overflow-hidden bg-nevo-cream">
      <AdminSidebar />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <Fragment key={labelsKey}>{children}</Fragment>
      </main>
    </div>
  );
}
