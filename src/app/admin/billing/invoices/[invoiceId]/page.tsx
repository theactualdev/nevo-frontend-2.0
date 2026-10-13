import type { Metadata } from "next";
import { InvoiceDetailView } from "@/components/admin/Billing/InvoiceDetailView";
import { readBack } from "@/components/admin/back";

export const metadata: Metadata = {
  title: "Invoice - Nevo",
};

// D11b Invoice detail. Next.js 16: `params` is a Promise and must be awaited.
export default async function AdminInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ invoiceId: string }>;
  searchParams: Promise<{ back?: string | string[]; backLabel?: string | string[] }>;
}) {
  const { invoiceId } = await params;
  return <InvoiceDetailView invoiceId={invoiceId} back={readBack(await searchParams)} />;
}
