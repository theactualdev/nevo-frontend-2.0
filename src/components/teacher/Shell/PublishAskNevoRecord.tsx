"use client";

import { useEffect } from "react";
import { setAskNevoRecord, type AskNevoRecord } from "./askNevoScope";

/**
 * Tells Ask Nevo which record this page has open, by the name the page has
 * already read (backlog item 32). Rendered by the page once it has the name,
 * and cleared when the page goes - so the drawer never keeps a name from a
 * page the teacher has left. A component rather than a hook, so a page can
 * place it after its own early returns.
 */
export function PublishAskNevoRecord({ kind, id, name, firstName = null }: AskNevoRecord) {
  useEffect(() => {
    if (!id || !name.trim()) return;
    setAskNevoRecord({ kind, id, name: name.trim(), firstName });
    return () => setAskNevoRecord(null);
  }, [kind, id, name, firstName]);
  return null;
}
