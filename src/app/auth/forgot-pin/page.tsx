import type { Metadata } from "next";
import { ForgotPinScreen } from "@/components/student/Auth/ForgotPinScreen";
import { safeNextPath } from "@/lib/auth/nextPath";

export const metadata: Metadata = {
  title: "Forgot PIN - Nevo",
};

// `?next=` is where the child was going before they forgot; the way back to
// the PIN carries it on. Next.js 16: `searchParams` is a Promise.
export default async function ForgotPinPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <ForgotPinScreen next={safeNextPath(next)} />;
}
