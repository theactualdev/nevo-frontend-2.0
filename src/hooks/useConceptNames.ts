"use client";

import { useEffect, useState } from "react";
import { lessonsApi } from "@/lib/api/lessons";

/**
 * Concept names by id, read one by one (`GET /api/concepts/{id}`).
 *
 * A name that fails to read is simply absent - the caller falls back to the
 * section's own name, and never to the id (see `students.ts`: a raw UUID was
 * once shown as the name of a concept).
 */
export function useConceptNames(ids: (string | null | undefined)[]): Record<string, string> {
  const key = [...new Set(ids.filter((id): id is string => !!id))].sort().join(",");
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    void Promise.allSettled(key.split(",").map((id) => lessonsApi.concept(id))).then((results) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const r of results) {
        if (r.status === "fulfilled" && r.value?.id && r.value.name?.trim()) next[r.value.id] = r.value.name.trim();
      }
      setNames(next);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return names;
}
