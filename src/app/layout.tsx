import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { AppProviders } from "@/context/providers";
import { A11Y_BOOT_SCRIPT } from "@/context/accessibilityBoot";
import { SITE_URL } from "@/lib/site";

// Inter — the app-wide UI/body font (Design System v2 §2), wired to `--font-sans`
// so Tailwind's `font-sans` and shadcn defaults resolve to it everywhere.
// The brand-only "Agile" font is a separate `--font-agile` placeholder in
// globals.css (used ONLY for the logo/wordmark); add it via next/font/local
// once the font files are available.
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  // Inherited by every route, so relative OG images and canonicals resolve
  // against the real origin rather than the deploy host's guess.
  metadataBase: new URL(SITE_URL),
  title: "Nevo",
  description: "Learning that adapts to how you learn.",
};

export const viewport: Viewport = {
  themeColor: "#f7f1e6",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn("h-full", "antialiased", inter.variable, "font-sans")}
      // The boot script below sets the accessibility attributes before React
      // hydrates, so the DOM is meant to differ from the payload here.
      suppressHydrationWarning
    >
      <head>
        {/* Rule 6: accommodations before the first paint, not after it. */}
        <script dangerouslySetInnerHTML={{ __html: A11Y_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
