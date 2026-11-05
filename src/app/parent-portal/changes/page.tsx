import type { Metadata } from "next";
import { Suspense } from "react";
import { ParentChanges } from "@/components/parent/ParentChanges";

/**
 * D02b, what a signed-in parent's child has strengthened (design 1397ec4,
 * built reduced - see `ParentChanges`). Reached from the parent home, and
 * only when the server has something to show. Suspense because it reads
 * `?child=`. Never indexed: one family's child.
 */
export const metadata: Metadata = {
  title: "What your child has strengthened - Nevo",
  robots: { index: false, follow: false },
};

export default function ParentChangesPage() {
  return (
    <Suspense>
      <ParentChanges />
    </Suspense>
  );
}
