"use client";

import { useState } from "react";
import { studentsApi } from "@/lib/api/students";
import { cn } from "@/lib/utils";
import { TEXT_ACTION } from "../Roster/primitives";
import { signInCsv } from "./signInSheet";

/**
 * "Download sign-in details" (`GET /students/sign-in-details`, 9 Oct): the
 * school code and every active child's Student ID, as a spreadsheet. See
 * `signInSheet.ts` for why it is a file rather than a printed sheet.
 *
 * It reads when pressed, not on page load, so the file is as current as the
 * moment it was asked for.
 */
export function SignInDetailsDownload() {
  const [phase, setPhase] = useState<"idle" | "working" | "failed" | "empty">("idle");

  const download = () => {
    setPhase("working");
    studentsApi
      .signInDetails()
      .then((rows) => {
        if (rows.length === 0) {
          setPhase("empty");
          return;
        }
        const href = URL.createObjectURL(
          new Blob([signInCsv(rows)], { type: "text/csv;charset=utf-8" }),
        );
        const a = document.createElement("a");
        a.href = href;
        a.download = "student-sign-in-details.csv";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(href);
        setPhase("idle");
      })
      .catch(() => setPhase("failed"));
  };

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={download}
        disabled={phase === "working"}
        className={cn(TEXT_ACTION, "whitespace-nowrap")}
      >
        {phase === "working" ? "Preparing…" : "Download sign-in details"}
      </button>
      {phase === "failed" ? (
        <span role="status" className="text-[12.5px] text-nevo-navy">
          That didn&rsquo;t download. Try again in a moment.
        </span>
      ) : phase === "empty" ? (
        <span role="status" className="text-[12.5px] text-nevo-near-black/60">
          There are no active students to list yet.
        </span>
      ) : null}
    </span>
  );
}
