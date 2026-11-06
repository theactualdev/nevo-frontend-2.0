"use client";

import Link from "next/link";
import { useFollowedUploads, type FollowedRow } from "@/hooks/useFollowedUploads";
import { PROCESSING_STAGES, stageOf } from "@/components/teacher/Upload/ProcessingStages";

/**
 * C07j LU-03: the marker that follows a teacher while an upload runs - "Back
 * where they were. The upload keeps going in the corner." - with "Tap to
 * view" back to it (backlog 18 and 20).
 *
 * THE FINISHED MARKER GOES TO REVIEW (C07j, 1397ec4): "Ready to review ·
 * Review" - "a freshly built lesson can't reach students until it's
 * reviewed". The frame used to read "Ready to assign · Assign", which was
 * untrue for a staged upload still waiting on its check; design's push
 * settled it the same way. A reading that stopped says so in LU-05's words.
 *
 * Only the uploads started in this browser, until the server can say which
 * are this teacher's (`lib/uploads/followedUploads`). None, and it draws
 * nothing.
 */

function lineFor(row: FollowedRow): string {
  if (row.status === "ready") return "Ready to review";
  if (row.status === "failed") return "We couldn’t finish reading this one";
  // Not answered yet: C07j's own heading for the whole wait.
  if (row.status === null) return "Getting it ready";
  const key = stageOf(row.upload.uploadId, row.stage, row.status);
  return PROCESSING_STAGES.find((s) => s.key === key)?.label ?? "Getting it ready";
}

export function UploadMarker() {
  const rows = useFollowedUploads();
  if (rows.length === 0) return null;
  return (
    <div
      role="status"
      aria-label="Uploads in progress"
      className="fixed bottom-6 left-6 z-40 flex w-[280px] flex-col gap-2 max-md:bottom-[88px] max-md:left-[18px]"
    >
      {rows.map((row) => (
        <Link
          key={row.upload.uploadId}
          href={`/teacher/lessons/upload?upload=${row.upload.uploadId}`}
          className="flex cursor-pointer items-start gap-3 rounded-[12px] bg-nevo-cream-elevated px-4 py-3 shadow-elevation-2 transition-[filter] hover:brightness-[0.985]"
        >
          <span
            aria-hidden
            className={
              row.status === "ready" || row.status === "failed"
                ? "mt-[5px] size-2 shrink-0 rounded-full bg-nevo-navy"
                : "mt-[5px] size-2 shrink-0 rounded-full bg-nevo-violet motion-safe:animate-pulse"
            }
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-semibold text-nevo-near-black">
              {row.upload.name}
            </span>
            <span className="mt-0.5 block text-[12.5px] text-nevo-near-black/62">
              {lineFor(row)}
            </span>
          </span>
          <span className="shrink-0 pt-px text-[12.5px] font-semibold text-nevo-navy">
            {/* LU-03: "Review" once it's done, "Tap to view" while it runs. */}
            {row.status === "ready" ? "Review" : "Tap to view"}
          </span>
        </Link>
      ))}
    </div>
  );
}
