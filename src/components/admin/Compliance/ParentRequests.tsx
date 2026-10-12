"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  consentsApi,
  type ParentRightLogRow,
  type RightsLogRequestType,
} from "@/lib/api/consents";
import { longDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { ReadFailed } from "../ReadFailed";

/**
 * What parents have asked of this school (`GET /consents/rights-log`): data
 * requests, objections and withdrawals, newest first. NDPA expects a school to
 * be able to produce this, and until now nothing read it back.
 *
 * D22b'S RULE, KEPT: "each row shows the category of the finding, a date and
 * a status, and nothing else. No student name, no record identifier." The log
 * carries `studentName` and `parentName`; neither is rendered. Whether a
 * school should see who asked - it has to answer them - is with design.
 *
 * Pending or resolved is read from `resolvedAt`, which the server sets when a
 * request is closed. `status` is a free string with no documented values, so
 * it is not shown as if it were a vocabulary.
 */

const PAGE = 20;

const CATEGORY: Record<RightsLogRequestType, string> = {
  request_data: "Data subject request",
  withdraw_consent: "Consent withdrawal",
  // D22b draws no objection row; D01c names the right "Object to Processing".
  object: "Objection to processing",
};

export function requestCategory(type: string): string {
  return CATEGORY[type as RightsLogRequestType] ?? "Request from a parent";
}

type Phase = "loading" | "ready" | "failed" | "denied";

export function ParentRequests() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [rows, setRows] = useState<ParentRightLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [more, setMore] = useState<"idle" | "loading" | "failed">("idle");

  const read = useCallback((alive: () => boolean) => {
    consentsApi
      .rightsLog({ limit: PAGE, offset: 0 })
      .then((log) => {
        if (!alive()) return;
        setRows(log.entries);
        setTotal(log.total);
        setPhase("ready");
      })
      .catch((err: unknown) => {
        if (!alive()) return;
        setPhase(err instanceof ApiError && err.status === 403 ? "denied" : "failed");
      });
  }, []);

  useEffect(() => {
    let alive = true;
    read(() => alive);
    return () => {
      alive = false;
    };
  }, [read]);

  const loadMore = () => {
    setMore("loading");
    consentsApi
      .rightsLog({ limit: PAGE, offset: rows.length })
      .then((log) => {
        setRows((prev) => [...prev, ...log.entries]);
        setTotal(log.total);
        setMore("idle");
      })
      .catch(() => setMore("failed"));
  };

  // Not this admin's to see: say nothing rather than a door they cannot open.
  if (phase === "denied") return null;

  return (
    <section aria-labelledby="parent-requests">
      <h3
        id="parent-requests"
        className="mt-8 text-[13.5px] font-semibold tracking-[0.04em] text-nevo-near-black/55 uppercase"
      >
        Requests from parents
      </h3>

      {phase === "loading" ? (
        <div className="mt-3 h-[88px] animate-pulse rounded-xl bg-nevo-near-black/[0.05]" />
      ) : phase === "failed" ? (
        <ReadFailed
          className="mt-3"
          what="the requests parents have made"
          onRetry={() => {
            setPhase("loading");
            read(() => true);
          }}
        />
      ) : rows.length === 0 ? (
        <p className="mt-3 text-[17px] font-medium text-nevo-near-black/50">
          No requests from parents.
        </p>
      ) : (
        <>
          <div className="mt-3 flex items-baseline gap-[9px]">
            <span className="text-[30px] leading-none font-semibold tracking-[-0.01em] text-nevo-near-black">
              {total}
            </span>
            <span className="text-[14px] text-nevo-near-black/60">
              {total === 1 ? "request" : "requests"}
            </span>
          </div>
          <ul className="m-0 mt-4 flex list-none flex-col gap-2.5 p-0">
            {rows.map((r) => {
              const pending = !r.resolvedAt;
              return (
                <li
                  key={r.id}
                  className={cn(
                    "relative flex items-center gap-[18px] overflow-hidden rounded-xl bg-nevo-cream-elevated py-[18px] pr-[22px] shadow-[0_2px_8px_rgba(0,0,0,0.05)]",
                    pending ? "pl-[26px]" : "pl-[22px]",
                  )}
                >
                  {pending ? (
                    <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-nevo-violet" />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <span className="text-[16px] font-semibold tracking-[-0.005em] text-nevo-near-black">
                      {requestCategory(r.requestType)}
                    </span>
                    <div className="mt-[5px] text-[13px] text-nevo-near-black/55">
                      {longDate(r.createdAt)}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "inline-flex flex-none items-center gap-[7px] rounded-full px-[13px] py-[5px] text-[12.5px] font-semibold whitespace-nowrap",
                      pending
                        ? "bg-nevo-violet/[0.22] text-nevo-navy"
                        : "bg-nevo-navy/10 text-nevo-near-black/68",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "size-1.5 flex-none rounded-full",
                        pending ? "bg-nevo-violet" : "bg-nevo-navy/40",
                      )}
                    />
                    {pending ? "Pending" : "Resolved"}
                  </span>
                </li>
              );
            })}
          </ul>
          {rows.length < total ? (
            <div className="mt-3">
              <button
                type="button"
                onClick={loadMore}
                disabled={more === "loading"}
                className="cursor-pointer text-[13.5px] font-semibold text-nevo-navy hover:underline disabled:cursor-wait disabled:opacity-60"
              >
                {more === "loading" ? "Loading…" : "Show older requests"}
              </button>
              {more === "failed" ? (
                <span role="status" className="ml-3 text-[13px] text-nevo-navy">
                  Those didn&rsquo;t load. Try again in a moment.
                </span>
              ) : null}
            </div>
          ) : null}
          <div className="mt-5 flex items-start gap-[11px] rounded-xl bg-nevo-violet/[0.14] px-[17px] py-[15px]">
            <p className="m-0 text-[13px] leading-[1.6] text-pretty text-nevo-near-black/72">
              This view is category and status only, by design. Nothing that
              could identify a child or their learning is shown at admin level;
              the underlying records are held by your data officer under the
              DPA.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
