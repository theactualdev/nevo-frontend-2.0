import type { Metadata } from "next";
/**
 * School Admin Layer context layout (Product Arch A.1 — desktop-first,
 * permission-scoped, multiple admins with different roles in one dashboard).
 *
 * Will host, along the way:
 * - Layout-level auth check backing up proxy.ts (any admin scope — FE Arch §2;
 *   individual pages check specific scopes via usePermissions)
 * - PermissionContext provider — Admin Layer only (FE Arch §8)
 * - Dynamic navigation per scopes held (D.3)
 */
import { AdminShell } from "@/components/admin/Shell/AdminShell";
import { PermissionProvider } from "@/context/PermissionContext";
import { SetupGateProvider } from "@/context/SetupGateContext";
// D14 interaction states for this console only - see the file.
import "./admin.css";

// Signed-in product surface - never indexed.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};


export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <PermissionProvider>
      <SetupGateProvider>
        {/* `contents`, so the scope adds no box of its own to the layout. */}
        <div data-console="admin" className="contents">
          <AdminShell>{children}</AdminShell>
        </div>
      </SetupGateProvider>
    </PermissionProvider>
  );
}
