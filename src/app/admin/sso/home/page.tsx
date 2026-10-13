import type { Metadata } from "next";
import { ItHomeView } from "@/components/admin/ItHome/ItHomeView";

export const metadata: Metadata = {
  title: "Systems overview - Nevo",
};

// D17 IT Admin Home - where an IT administrator lands, from sign-in through
// `adminHomeForScopes`; a "no access" page links back here by `homeName`. It
// sits under /admin/sso to light the IT & SSO rail item, which has been off
// the rail since 24 Sep, so no rail row lights here now.
export default function AdminItHomePage() {
  return <ItHomeView />;
}
