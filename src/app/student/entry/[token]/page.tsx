import type { Metadata } from "next";
import { StudentEntry } from "@/components/student/Entry/StudentEntry";

export const metadata: Metadata = {
  title: "Welcome - Nevo",
};

/**
 * The entry link's address: `{base}/student/entry/{token}`.
 *
 * THE TOKEN IS A PATH SEGMENT, matching `/api/v1/student-entry/{token}` and
 * matching the admin confirmation route, which settles the same question in
 * its own docblock. The parent consent link has already been caught once
 * keeping its token in a query param while its prefix moved, and looking up a
 * consent literally named "consent".
 *
 * The existing `/student/onboarding?token=` hand-off is untouched and still
 * works. This is an additional door, not a replacement for that one.
 *
 * Next.js 16: `params` is a Promise.
 */
export default async function StudentEntryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <StudentEntry token={token} />;
}
