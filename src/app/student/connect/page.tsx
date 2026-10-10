import type { Metadata } from "next";
import { ConnectTab } from "@/components/student/Connect/ConnectTab";

export const metadata: Metadata = {
  title: "Connect - Nevo",
};

// Next.js 16: `searchParams` is a Promise and must be awaited.
export default async function StudentConnectPage({
  searchParams,
}: {
  /**
   * `?thread=` opens that conversation instead of the first one. Read on the
   * SERVER, like the lesson page's `?assignment=`, so the client needs no
   * `useSearchParams` and the Suspense boundary it demands.
   *
   * `?to=teacher` opens the child's conversation with their teacher, for Ask
   * Nevo's "Message my teacher" (design D109).
   */
  searchParams: Promise<{ thread?: string; to?: string }>;
}) {
  const { thread, to } = await searchParams;
  return <ConnectTab threadId={thread} toTeacher={to === "teacher"} />;
}
