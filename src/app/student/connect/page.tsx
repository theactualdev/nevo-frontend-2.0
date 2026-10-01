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
   */
  searchParams: Promise<{ thread?: string }>;
}) {
  const { thread } = await searchParams;
  return <ConnectTab threadId={thread} />;
}
