import type { Metadata } from "next";
import { ForgotPinScreen } from "@/components/student/Auth/ForgotPinScreen";
import { safeNextPath } from "@/lib/auth/nextPath";

export const metadata: Metadata = {
  title: "Forgot PIN - Nevo",
};

// `?next=` is where the child was going before they forgot; the way back to
// the PIN carries it on. `?child=` is which remembered child forgot, as the
// device roster's opaque id - never an identifier. Next.js 16: `searchParams`
// is a Promise.
export default async function ForgotPinPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; child?: string }>;
}) {
  const { next, child } = await searchParams;
  return <ForgotPinScreen next={safeNextPath(next)} childId={child} />;
}
