import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalDoc } from "@/components/legal/LegalDoc";
import { LEGAL_DOCS, type LegalDocId } from "@/lib/mocks/legalDoc";

export const metadata: Metadata = {
  title: "Privacy & Terms - Nevo",
};

// `Nevo Legal Doc` - Privacy Policy and Terms of Service, the destinations
// behind the activation consent line, the parent consent and the parent
// portal. `?from=` names the entry, which sets the way back.
// Next.js 16: `params` and `searchParams` are Promises and must be awaited.
export default async function LegalPage({
  params,
  searchParams,
}: {
  params: Promise<{ doc: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { doc } = await params;
  if (!(doc in LEGAL_DOCS)) notFound();
  const { from } = await searchParams;
  return <LegalDoc doc={doc as LegalDocId} from={typeof from === "string" ? from : undefined} />;
}
