import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Reports is one place with views inside it (Lydia, 7 Oct): "One menu item,
 * called Reports, with everything inside it. D09, D20 and the transformation
 * view are views within Reports rather than three competing destinations."
 *
 * So both pages carry the same row of views under the one heading, and the
 * sidebar's Reports stays lit on either. D09's list of exportable reports is
 * not a view yet: no endpoint serves a report list or its PDF and CSV, and a
 * tab that opens onto nothing is the defect the ruling exists to prevent. It
 * joins this row when the backend does.
 */

export type ReportsViewKey = "cohort" | "transformation";

const VIEWS: { key: ReportsViewKey; label: string; href: string }[] = [
  { key: "cohort", label: "Cohort analytics", href: "/admin/reports" },
  { key: "transformation", label: "School transformation", href: "/admin/reports/transformation" },
];

export function ReportsViews({ current }: { current: ReportsViewKey }) {
  return (
    <div>
      <p className="m-0 text-[12px] font-semibold tracking-[0.05em] text-nevo-near-black/50 uppercase">
        Reports
      </p>
      <nav
        aria-label="Reports"
        className="mt-2.5 flex gap-6 border-b border-nevo-near-black/[0.09]"
      >
        {VIEWS.map((v) => {
          const on = v.key === current;
          return (
            <Link
              key={v.key}
              href={v.href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "-mb-px border-b-2 pb-2.5 text-[14.5px] font-semibold transition-colors",
                on
                  ? "border-nevo-navy text-nevo-navy"
                  : "border-transparent text-nevo-near-black/55 hover:text-nevo-navy",
              )}
            >
              {v.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
