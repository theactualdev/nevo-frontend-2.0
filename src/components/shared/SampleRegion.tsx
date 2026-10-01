"use client";

import { createContext, useContext, type ReactNode } from "react";
import { sampleMark } from "@/lib/sampleData";

/**
 * WHICH SAMPLE REGION THIS IS INSIDE, carried through portals.
 *
 * The mark is an attribute on a wrapper, and a sheet is portalled to `body` -
 * outside every wrapper. So the signed-out preview sheet, with the fixture's
 * "what you'll do" line in it, rendered unmarked, and the end-to-end detector
 * could not have seen it leak to a signed-in child. React context follows the
 * component tree rather than the DOM, so it reaches through the portal; the
 * sheet reads it and marks its own portalled content (`ui/sheet.tsx`).
 */
const SampleKind = createContext<string | null>(null);

/** The kind of the sample region this component sits in, or null. */
export function useSampleKind(): string | null {
  return useContext(SampleKind);
}

/**
 * Wraps a region that is showing SAMPLE data rather than this person's own.
 *
 * See `lib/sampleData.ts` for why the mark exists: an end-to-end test asserts
 * that no sample region is on the page once signed in, which is what catches
 * the console silently degrading to fixtures - the failure this architecture
 * actually has, and the one a flow test would sail straight past because the
 * fallback renders exactly what the assertion looks for.
 *
 * `display: contents` so the wrapper takes part in no layout at all: the
 * children lay out against the real parent exactly as they did before, and
 * nothing about the rendered design changes. A marker that shifted the page
 * would be a marker people delete.
 */
export function SampleRegion({
  kind,
  children,
}: {
  /** Which surface fell back - a failing test should name the screen. */
  kind: string;
  children: ReactNode;
}) {
  return (
    <SampleKind.Provider value={kind}>
      <div style={{ display: "contents" }} {...sampleMark(kind)}>
        {children}
      </div>
    </SampleKind.Provider>
  );
}

/**
 * `SampleRegion`, but only when the region is actually showing samples.
 *
 * Lived privately in `StudentShell` until a second caller wanted it. Promoted
 * rather than copied: two versions of "mark this only if it is a fixture"
 * eventually disagree about what counts, and the mark is only worth anything
 * while every surface means the same thing by it.
 *
 * `display: contents` means the unmarked branch and the marked one lay out
 * identically, so nothing about the design changes either way.
 */
export function MaybeSample({
  showing,
  kind,
  children,
}: {
  showing: boolean;
  kind: string;
  children: ReactNode;
}) {
  if (!showing) return <>{children}</>;
  return <SampleRegion kind={kind}>{children}</SampleRegion>;
}
