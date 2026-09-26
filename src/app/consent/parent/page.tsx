import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { parentPathFromLegacyConsentLink } from "@/lib/parentConsentLink";

/**
 * `/consent/parent?token=…` - the address in every consent email sent before
 * 21 Sep. It only ever forwards to `/parent/<token>`; see
 * `parentPathFromLegacyConsentLink` for why it has to exist forever.
 *
 * PUBLIC, like the page it forwards to: `proxy.ts` does not match `/consent`,
 * and a parent never signs in.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// Next.js 16: `searchParams` is a Promise and must be awaited.
export default async function LegacyParentConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const path = parentPathFromLegacyConsentLink((await searchParams).token);
  if (!path) notFound();
  redirect(path);
}
