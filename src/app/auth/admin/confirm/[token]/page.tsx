import type { Metadata } from "next";
import { ConfirmEmail } from "@/components/admin/Auth/ConfirmEmail";

export const metadata: Metadata = {
  title: "Confirm your email address - Nevo",
};

/**
 * SCRUM-151. The address backend sends in the confirmation email:
 * `{base}/auth/admin/confirm/{token}`.
 *
 * THE TOKEN IS A PATH SEGMENT, NOT A QUERY PARAM, and that distinction has
 * already cost this team once. The parent consent link was fixed for its
 * prefix while the token stayed in a query param, so the app looked up a
 * consent literally named "consent" - a 404 that read as a routing bug. Same
 * shape, same trap, so it is settled here in the route rather than assumed.
 *
 * Next.js 16: `params` is a Promise.
 */
export default async function AdminConfirmEmailPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ConfirmEmail token={token} />;
}
