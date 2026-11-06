import type { Metadata } from "next";
import { ItHomeView } from "@/components/admin/ItHome/ItHomeView";

export const metadata: Metadata = {
  title: "Systems overview - Nevo",
};

// D17 IT Admin Home - where an IT administrator lands, from sign-in through
// `adminHomeForScopes`; a "no access" page links back here by `homeName`, and
// the IT admin's rail has a Systems overview row for it (backlog 20). It sits
// under /admin/sso because IT & SSO once lit here; that row is off the rail
// since 24 Sep and the provider set-up stays deferred.
export default function AdminItHomePage() {
  return <ItHomeView />;
}
