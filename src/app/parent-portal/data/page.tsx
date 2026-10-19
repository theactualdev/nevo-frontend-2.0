import type { Metadata } from "next";
import { Suspense } from "react";
import { ParentMyData } from "@/components/parent/ParentMyData";

/**
 * D01c for a signed-in parent (Lydia, 14 Oct, L6): the route from the parent
 * home to what Nevo holds about their child and what they can do about it.
 * The page is the same one a tokenised link opens - see `ParentMyData`.
 *
 * Suspense because the page reads `?child=`. Never indexed: one family's data.
 */
export const metadata: Metadata = {
  title: "Your child's data - Nevo",
  robots: { index: false, follow: false },
};

export default function ParentDataPage() {
  return (
    <Suspense>
      <ParentMyData />
    </Suspense>
  );
}
