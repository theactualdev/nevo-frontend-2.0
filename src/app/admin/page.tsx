"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { adminHomeForScopes } from "@/components/admin/Shell/adminNav";

/**
 * `/admin` is the console's door, and it now CHOOSES where to open.
 *
 * It used to redirect straight to `/admin/dashboard` for everyone, which was
 * right while the Overview was the only home. It is not any more: the Overview
 * is gated on `oversight`, so an IT contractor or a finance administrator was
 * sent to a screen that refuses them - their first sight of Nevo being a
 * refusal. D17 and D18 exist now and `adminHomeForScopes` picks between them.
 *
 * WHY HERE AND NOT IN THE PROXY. `proxy.ts` reads only the role mirror cookie,
 * and the role is `senco_admin | other_admin` - which says nothing about
 * scopes. `GET /api/v1/permissions/me` is the only source, and
 * `PermissionProvider` already fetches it above every /admin route, so this
 * costs no extra request.
 *
 * It waits for `resolved`. Redirecting on an empty scope list before the answer
 * arrives would send every admin to the fallback on every cold load.
 *
 * A FAILED READ IS NOT "NO SCOPES". The context reports a failed read as
 * resolved with an empty list, and this used to route that to the scope-less
 * fallback - Settings - so a proprietor whose permissions GET blipped opened
 * the console on their password form. It does not guess a home either: the
 * Overview would widen an IT admin's view, which the 6 Oct ruling forbids. It
 * says it could not check, and offers to check again.
 */
export default function AdminRootPage() {
  const router = useRouter();
  const { scopes, resolved, status, refresh } = usePermissions();

  useEffect(() => {
    if (!resolved || status === "failed") return;
    router.replace(adminHomeForScopes(scopes));
  }, [resolved, status, scopes, router]);

  if (status !== "failed") return null;
  return (
    <div className="mx-auto w-full max-w-[680px] px-[38px] py-[34px]">
      <div className="rounded-xl bg-nevo-cream-elevated px-[26px] py-7 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
        <p className="m-0 text-[14.5px] leading-[1.55] text-nevo-near-black/72">
          We couldn&rsquo;t check which parts of the console you can see, so
          we haven&rsquo;t opened any of it yet.
        </p>
        <button
          type="button"
          onClick={refresh}
          className="mt-3.5 cursor-pointer text-[13.5px] font-semibold text-nevo-navy hover:underline"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
