import { useEffect, useRef } from "react";

/**
 * WHETHER THE COMPONENT IS STILL ON SCREEN, for a read that answers later.
 *
 * A `.then` or `.catch` that sets state after its component has gone is the
 * flake behind check 19's "window is not defined" (YearGroupFigures): in a
 * browser React just drops the late update, but in a test the environment has
 * been torn down by then, and the update throws there. The admin sweep found
 * 67 reads like it (unguarded.py, 26 Nov) - so one shared guard, not a flag
 * hand-rolled in each file.
 *
 *   const mounted = useMountedRef();
 *   ...
 *   api.read().then((rows) => {
 *     if (!mounted.current) return;
 *     setRows(rows);
 *   });
 *
 * True from mount until cleanup. Strict Mode mounts, cleans up and mounts
 * again in development: the effect sets it true each time it runs and false
 * each time it is cleaned up, so after the remount it is true again - never
 * left false on a component that is in fact still showing.
 */
export function useMountedRef(): { readonly current: boolean } {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return mounted;
}
