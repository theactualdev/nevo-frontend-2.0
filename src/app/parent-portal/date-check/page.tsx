import type { Metadata } from "next";
import { Suspense } from "react";
import { ParentDateCheck } from "@/components/parent/ParentDateCheck";

/**
 * D01d Parent Date Check (SCRUM-243): a signed-in parent gives their child's
 * date of birth again, when two records of it differ. Reached from the parent
 * home - see `ParentDateCheck`.
 *
 * Suspense because the page reads `?child=`. Never indexed: one family's data.
 */
export const metadata: Metadata = {
  title: "Confirm a date of birth - Nevo",
  robots: { index: false, follow: false },
};

export default function ParentDateCheckPage() {
  return (
    <Suspense>
      <ParentDateCheck />
    </Suspense>
  );
}
