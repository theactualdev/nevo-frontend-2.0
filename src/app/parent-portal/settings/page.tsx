import type { Metadata } from "next";
import { ParentSettings } from "@/components/parent/ParentSettings";

/**
 * D01f, a signed-in parent's settings (design 1397ec4, built reduced - see
 * `ParentSettings`). Reached from the parent home's bar. Never indexed.
 */
export const metadata: Metadata = {
  title: "Settings - Nevo",
  robots: { index: false, follow: false },
};

export default function ParentSettingsPage() {
  return <ParentSettings />;
}
