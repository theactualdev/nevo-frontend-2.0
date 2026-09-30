import type { Metadata } from "next";
import { InvoiceDetailView } from "@/components/admin/Billing/InvoiceDetailView";

export const metadata: Metadata = {
  title: "Invoice - Nevo",
};

// D11b Invoice detail. Next.js 16: `params` is a Promise and must be awaited.
export default async function AdminInvoicePage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;
  return <InvoiceDetailView invoiceId={invoiceId} />;
}
