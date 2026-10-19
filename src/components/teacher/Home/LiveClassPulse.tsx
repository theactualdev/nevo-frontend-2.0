import type { ClassPulse } from "@/hooks/useTeacherHome";
import { PULSE_LABEL, PULSE_SUBTITLE } from "@/lib/mocks/teacherIntelligence";

/**
 * C16a Class Learning Pulse, from `GET /api/v1/teachers/me/home`.
 *
 * THE WORDS ARE THE ENGINE'S. Each tile prints the label backend sends for it
 * (`engagementLabel`, `comprehensionLabel`, `focusLabel`; B-6, Teslim 14 Oct)
 * exactly as sent. Backend owns where one word ends and the next begins; this
 * component reads no number and draws no band. That is the condition Lydia set
 * on 13 Oct for the pulse coming back: "nothing replaces them until backend
 * sends its own words". A tile whose label did not arrive is left out rather
 * than filled in.
 *
 * TWO DEPARTURES FROM THE FRAME, both forced by what the endpoint returns.
 *
 * The frame draws ONE pulse; the endpoint returns one per class. A teacher
 * with three classes has three different reads, and averaging them would
 * invent a number that describes nobody - so the section repeats, named per
 * class. With a single class it renders exactly as drawn.
 *
 * The frame's tiles carry a sentence under the word ("25 of 28 students
 * engaged consistently..."). Nothing serves that prose, so the tile states
 * the cohort it covers instead - a fact, not a claim.
 */
export function LiveClassPulse({ pulse }: { pulse: ClassPulse }) {
  if (pulse.tiles.length === 0) return null;
  return (
    <section className="mt-[22px] rounded-[12px] bg-nevo-cream-elevated p-5 shadow-elevation-1 xl:p-6">
      <h3 className="text-[11px] font-bold tracking-[0.14em] text-nevo-violet uppercase">
        {`${PULSE_LABEL} · ${pulse.className}`}
      </h3>
      <p className="mt-2 text-[13px] text-nevo-near-black/60">
        {PULSE_SUBTITLE}
      </p>

      <div className="mt-[18px] flex flex-col gap-2.5 xl:mt-5 xl:flex-row xl:gap-3">
        {pulse.tiles.map((t) => (
          <div
            key={t.head}
            className="flex flex-row items-center gap-4 rounded-[12px] bg-nevo-cream-inset px-[18px] py-4 xl:flex-1 xl:flex-col xl:items-start xl:gap-0"
          >
            <span className="w-[130px] shrink-0 text-[11px] font-bold tracking-[0.14em] text-nevo-violet uppercase xl:w-auto">
              {t.head}
            </span>
            <span className="text-[20px] font-semibold text-nevo-navy xl:mt-2.5">
              {t.label}
            </span>
            <span className="flex-1 text-[12px] leading-[1.5] text-nevo-near-black/70 xl:mt-1.5 xl:flex-none">
              {`Across ${pulse.studentCount} ${pulse.studentCount === 1 ? "student" : "students"}`}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
