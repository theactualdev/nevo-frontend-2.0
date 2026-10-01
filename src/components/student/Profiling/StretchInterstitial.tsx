"use client";

import { useEffect, useRef } from "react";
import { IllustrationWrapper } from "@/components/shared";
import { cn } from "@/lib/utils";
import { ProfilingShell } from "./ProfilingShell";

/** The mandatory reset between modules: 15 seconds, then auto-advance. */
const STRETCH_MS = 15_000;

/**
 * Stretch interstitial (BP-INT) - a mandatory 15-second cognitive reset after
 * every profiling module on first run. Breathing figure, "Take a breath", and
 * the frame's soft-violet ring filling clockwise over 15s before
 * auto-advancing. No skip on first run; reduced motion lands the ring partway
 * (55%) and still. The pause is the system's ask, so the flow (not the
 * student) ends it.
 *
 * THE RING IS THE FRAME'S, and it had been replaced by water rising in a
 * circle - 56px everywhere, parked at 45% under reduced motion. `Nevo Stretch
 * Frame`: 56px on a phone and 64px from tablet up, a 3px stroke on a 15%
 * violet track, the fill sweeping from 12 o'clock (`nevoRing`, 15s linear),
 * and reduced motion holding it at `c * 0.45` offset, which is 55% filled.
 */
export function StretchInterstitial({
  filled,
  active,
  onDone,
}: {
  filled: number;
  active: number;
  onDone: () => void;
}) {
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);
  useEffect(() => {
    const t = setTimeout(() => onDoneRef.current(), STRETCH_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <ProfilingShell filled={filled} active={active}>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
        <IllustrationWrapper
          src="/illustrations/break-movement.png"
          alt="A Nevo figure stretching gently"
          width={1024}
          height={1536}
          priority
          motion="breathe"
          className="h-[140px] w-auto sm:h-[180px]"
        />
        <p className="mt-4 text-[17px] font-medium tracking-[0.01em] text-nevo-violet sm:text-lg">
          Take a breath
        </p>
        {/* Two sizes rather than one scaled, so the stroke stays 3px at both. */}
        <BreathRing size={56} className="mt-6 sm:hidden" />
        <BreathRing size={64} className="mt-6 hidden sm:block" />
      </div>
    </ProfilingShell>
  );
}

/** The frame's ring: a still track, and a fill that sweeps once over 15s. */
function BreathRing({ size, className }: { size: number; className: string }) {
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn("-rotate-90", className)}
      aria-hidden
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgba(154,156,203,0.15)"
        strokeWidth={stroke}
      />
      <circle
        data-ring-fill
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#9a9ccb"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        style={{ "--nevo-c": `${c}` } as React.CSSProperties}
        className="[stroke-dashoffset:var(--nevo-c)] motion-safe:[animation:nevo-ring-fill_15s_linear_forwards] motion-reduce:[stroke-dashoffset:calc(var(--nevo-c)*0.45)]"
      />
    </svg>
  );
}
