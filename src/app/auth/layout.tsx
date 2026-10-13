import type { Metadata } from "next";
import { DoorRotateLock } from "@/components/student/Shell/DoorRotateLock";

// Signed-in product surface - never indexed.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Shared auth context layout (FE Arch §1 — login, sso-callback,
 * forgot-password, forgot-pin).
 *
 * Centered single-column shell on Cream, matching the Welcome/onboarding tone
 * in the UI/UX spec. Authenticated users get redirected away by proxy.ts.
 *
 * A child's doors are held portrait like the app behind them (D65); see
 * `DoorRotateLock`, which leaves the staff doors alone.
 */
export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-nevo-cream text-nevo-near-black">
      <DoorRotateLock>{children}</DoorRotateLock>
    </div>
  );
}
