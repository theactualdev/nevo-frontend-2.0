import {
  HOME_PULSE,
  PULSE_LABEL,
  PULSE_SUBTITLE,
} from "@/lib/mocks/teacherIntelligence";

/**
 * Class Learning Pulse (C16a) - the intelligence layer's read on the class,
 * at the top of Home above everything else. Three qualitative tiles
 * (Engagement / Comprehension / Focus) - plain-language labels, never
 * numerical scores, never green. Desktop: tiles sit three across; tablet:
 * they stack as full-width rows with a fixed label column.
 */
export function ClassPulse() {
  return (
    <section className="mt-[22px] rounded-[12px] bg-nevo-cream-elevated p-5 shadow-elevation-1 xl:p-6">
      <h3 className="text-[11px] font-bold tracking-[0.14em] text-nevo-violet uppercase">
        {PULSE_LABEL}
      </h3>
      <p className="mt-2 text-[13px] text-nevo-near-black/60">
        {PULSE_SUBTITLE}
      </p>
      <div className="mt-[18px] flex flex-col gap-2.5 xl:mt-5 xl:flex-row xl:gap-3">
        {HOME_PULSE.map((m) => (
          <div
            key={m.head}
            className="flex flex-row items-center gap-4 rounded-[12px] bg-nevo-cream-inset px-[18px] py-4 xl:flex-1 xl:flex-col xl:items-start xl:gap-0"
          >
            <span className="w-[130px] shrink-0 text-[11px] font-bold tracking-[0.14em] text-nevo-violet uppercase xl:w-auto">
              {m.head}
            </span>
            <span className="text-[20px] font-semibold text-nevo-navy xl:mt-2.5">
              {m.value}
            </span>
            <span className="flex-1 text-[12px] leading-[1.5] text-nevo-near-black/70 xl:mt-1.5 xl:flex-none">
              {m.desc}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
