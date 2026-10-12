"use client";

import { useState } from "react";
import { consentsApi } from "@/lib/api/consents";
import { cn } from "@/lib/utils";
import { TEXT_ACTION } from "../Roster/primitives";

/**
 * "Download the consent form" (D25a, `GET /consents/form`): Nevo's printable
 * form, as a PDF the backend renders. With a child, their name is printed on
 * it. Read when pressed, behind the session's token.
 */
export function ConsentFormDownload({
  studentId,
  label = "Download the consent form",
  className,
}: {
  studentId?: string;
  label?: string;
  className?: string;
}) {
  const [phase, setPhase] = useState<"idle" | "working" | "failed">("idle");

  const download = () => {
    setPhase("working");
    consentsApi
      .consentForm(studentId)
      .then((blob) => {
        const href = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = href;
        a.download = "nevo-consent-form.pdf";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(href);
        setPhase("idle");
      })
      .catch(() => setPhase("failed"));
  };

  return (
    <span className={cn("inline-flex flex-col gap-1", className)}>
      <button
        type="button"
        onClick={download}
        disabled={phase === "working"}
        className={cn(TEXT_ACTION, "text-[13.5px]")}
      >
        {phase === "working" ? "Preparing…" : label}
      </button>
      {phase === "failed" ? (
        <span role="status" className="text-[12.5px] text-nevo-navy">
          That didn&rsquo;t download. Try again in a moment.
        </span>
      ) : null}
    </span>
  );
}
