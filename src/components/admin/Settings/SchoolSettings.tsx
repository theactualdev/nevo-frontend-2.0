"use client";

import { useCallback, useEffect, useState } from "react";
import {
  readAcademic,
  readContact,
  schoolApi,
  type AcademicConfig,
  type RetentionPolicy,
  type School,
  type SchoolTerm,
} from "@/lib/api/school";
import {
  YEAR_GROUPS,
  defaultYearGroupLabel,
  setYearGroupLabels,
} from "@/lib/constants/yearGroups";
import { ApiError, apiErrorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { CARD } from "../Roster/primitives";
import {
  termIssues,
  TERM_STARTS_STORED,
  termStartDatesFrom,
  unresolvedLine,
} from "./academicCalendar";
import {
  PRESETS,
  labelsForPreset,
  presetFor,
  type PresetId,
} from "./taxonomy";
import {
  NotBuiltNote,
  S_FIELD,
  S_LABEL,
  SaveRow,
  SettingsSection,
} from "./SettingsView";

/**
 * D12 General + data retention, and D12b calendar and taxonomy.
 *
 * RETENTION IS WRITTEN IN PLAIN WORDS, and D12 is emphatic about why: it is a
 * decision an admin should make understanding exactly what happens to a
 * deactivated student's records and when, not a buried toggle. So the selected
 * policy is restated as a sentence underneath, and the sentence names the
 * consequence - permanently deleted, cannot be recovered - rather than
 * softening it.
 *
 * The three options are the API's own (`contract`, `contract_plus_3_years`,
 * `contract_plus_7_years`). D12 also offers "12 months"; there is no enum
 * value for it, so it is not offered. Raised with backend rather than mapped
 * onto whichever value looked closest.
 *
 * THE TAXONOMY EDITOR IS THE ONE THAT MATTERS MOST DOWNSTREAM. It writes
 * `academicConfig.yearGroupLabels`, which `lib/constants/yearGroups.ts` reads
 * through its single lookup - so renaming P1 to "Year 1" here changes every
 * class row, student record and report at once. The underlying enum never
 * changes, which is what keeps cross-school comparison meaningful, and the
 * screen says so.
 */

type Phase = "idle" | "saving" | "saved" | "failed";
type Load = "loading" | "ready" | "failed";

const RETENTION: { value: RetentionPolicy; label: string; plain: string }[] = [
  {
    value: "contract",
    label: "For the length of our contract",
    plain:
      "their profile and learning history stay available until your contract with Nevo ends",
  },
  {
    value: "contract_plus_3_years",
    label: "Our contract, then three more years",
    plain:
      "their profile and learning history stay available until three years after your contract ends",
  },
  {
    value: "contract_plus_7_years",
    label: "Our contract, then seven more years",
    plain:
      "their profile and learning history stay available until seven years after your contract ends",
  },
];


export function SchoolSettings() {
  const [load, setLoad] = useState<Load>("loading");
  const [school, setSchool] = useState<School | null>(null);

  const [name, setName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [location, setLocation] = useState("");
  const [retention, setRetention] = useState<RetentionPolicy>("contract");
  const [general, setGeneral] = useState<Phase>("idle");

  const [academic, setAcademic] = useState<AcademicConfig>({});
  const [calendar, setCalendar] = useState<Phase>("idle");
  /** The server's own 422 wording, when it gave one. See `SaveRow`. */
  const [calendarNote, setCalendarNote] = useState<string | null>(null);

  const [labels, setLabels] = useState<Record<string, string>>({});
  const [taxonomy, setTaxonomy] = useState<Phase>("idle");

  const hydrate = useCallback((s: School) => {
    const contact = readContact(s);
    const acad = readAcademic(s);
    setSchool(s);
    setName(s.name);
    setContactEmail(contact.contactEmail ?? "");
    setContactPhone(contact.contactPhone ?? "");
    setLocation(contact.location ?? "");
    setRetention(
      RETENTION.some((r) => r.value === s.retentionPolicy)
        ? (s.retentionPolicy as RetentionPolicy)
        : "contract",
    );
    setAcademic(acad);
    setLabels(acad.yearGroupLabels ?? {});
    setYearGroupLabels(acad.yearGroupLabels);
    setLoad("ready");
  }, []);

  useEffect(() => {
    schoolApi.get().then(hydrate).catch(() => setLoad("failed"));
  }, [hydrate]);

  if (load === "loading") {
    return <div className={cn(CARD, "mt-5 h-[420px] animate-pulse")} />;
  }

  if (load === "failed" || !school) {
    return (
      <SettingsSection title="We couldn't load your settings">
        <p className="m-0 text-sm leading-[1.55] text-nevo-near-black/62">
          Nothing has changed - this is only about showing them to you. Try
          again in a moment.
        </p>
      </SettingsSection>
    );
  }

  const chosen = RETENTION.find((r) => r.value === retention) ?? RETENTION[0];

  const saveGeneral = () => {
    setGeneral("saving");
    schoolApi
      .update({ name: name.trim(), retentionPolicy: retention })
      .then(() =>
        schoolApi.saveContact({
          contactEmail: contactEmail.trim(),
          contactPhone: contactPhone.trim(),
          location: location.trim(),
        }),
      )
      .then((s) => {
        hydrate(s);
        setGeneral("saved");
        setTimeout(() => setGeneral("idle"), 2200);
      })
      .catch(() => setGeneral("failed"));
  };

  const saveCalendar = () => {
    setCalendar("saving");
    setCalendarNote(null);
    schoolApi
      .saveAcademic({
        yearStart: academic.yearStart,
        yearEnd: academic.yearEnd,
        terms: academic.terms ?? [],
        /*
         * THE ONLY FIELD NEVO ACTUALLY READS, and this save never wrote it.
         *
         * `yearStart`, `yearEnd` and `terms` are all OURS - client inventions
         * kept in a blob the backend passes through untouched. The deployed
         * `AcademicConfig` types exactly one property, `termStartDates`, and
         * its own description says what happens without it: "fewer means Nevo
         * falls back to splitting the contract year evenly."
         *
         * So a school that carefully set three term dates here had told Nevo
         * nothing, and every "this half-term" figure in the product went on
         * dividing their year into equal thirds. Derived rather than typed
         * twice, so the two cannot disagree.
         */
        termStartDates: termStartDatesFrom(academic.terms ?? []),
      })
      .then((s) => {
        hydrate(s);
        setCalendar("saved");
        setTimeout(() => setCalendar("idle"), 2200);
      })
      .catch((err: unknown) => {
        /*
         * THE 422 HERE SAYS SOMETHING WORTH REPEATING. A fourth term start is
         * refused because billing issues one invoice per term start, and
         * backend rewrote the message on 22 Sep from Pydantic's stock "List
         * should have at most 3 items" to a sentence a school can act on.
         * Catching with `() => setCalendar("failed")` discarded it and showed
         * "that didn't save" - which is exactly the complaint we had raised
         * about the stock message, reproduced on our side.
         */
        setCalendarNote(
          err instanceof ApiError ? apiErrorMessage(err.detail) : null,
        );
        setCalendar("failed");
      });
  };

  const saveTaxonomy = () => {
    setTaxonomy("saving");
    schoolApi
      // The preset is derived from the labels, so what is stored can never
      // disagree with what is on screen.
      .saveAcademic({ yearGroupLabels: labels, taxonomyPreset: preset })
      .then((s) => {
        hydrate(s);
        setTaxonomy("saved");
        setTimeout(() => setTaxonomy("idle"), 2200);
      })
      .catch(() => setTaxonomy("failed"));
  };

  const terms = academic.terms ?? [];
  const setTerms = (next: SchoolTerm[]) =>
    setAcademic((a) => ({ ...a, terms: next }));

  /*
   * SCRUM-99: "Save stays disabled while any row is unresolved, with a live
   * count beside it." There was no validation at all, on the record every
   * period figure in the product resolves through.
   */
  const issues = termIssues(terms);
  const issueFor = (i: number) => issues.find((x) => x.index === i) ?? null;
  const unresolved = unresolvedLine(issues);

  /** Derived, never a stored claim - see `presetFor`. */
  const preset: PresetId = presetFor(labels);
  const applyPreset = (id: PresetId) => setLabels(labelsForPreset(id));

  return (
    <>
      {/* ------------------------------------------------------------ GENERAL */}
      <SettingsSection title="General">
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="set-name" className={S_LABEL}>
              School name
            </label>
            <input
              id="set-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={S_FIELD}
            />
          </div>
          <div className="flex gap-4 max-lg:flex-col">
            <div className="flex-1">
              <label htmlFor="set-email" className={S_LABEL}>
                Contact email
              </label>
              <input
                id="set-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className={S_FIELD}
              />
            </div>
            <div className="flex-1">
              <label htmlFor="set-phone" className={S_LABEL}>
                Contact phone
              </label>
              <input
                id="set-phone"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className={S_FIELD}
              />
            </div>
          </div>
          <div>
            <label htmlFor="set-location" className={S_LABEL}>
              Location
            </label>
            <input
              id="set-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Lagos, Nigeria"
              className={S_FIELD}
            />
          </div>
        </div>
      </SettingsSection>

      {/* ---------------------------------------------------------- RETENTION */}
      <SettingsSection title="Data retention">
        <label htmlFor="set-retention" className={S_LABEL}>
          When a student is deactivated, keep their records for…
        </label>
        <select
          id="set-retention"
          value={retention}
          onChange={(e) => setRetention(e.target.value as RetentionPolicy)}
          className={cn(S_FIELD, "cursor-pointer")}
        >
          {RETENTION.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>

        {/* Plain words, and they name the consequence rather than soften it. */}
        <p className="m-0 mt-4 max-w-[62ch] text-sm leading-[1.6] text-nevo-near-black/70">
          When you deactivate a student, {chosen.plain} in case they return or a
          record is needed. After that they&rsquo;re permanently deleted and
          can&rsquo;t be recovered. Active students are never affected.
        </p>
        {/*
          * SCRUM-99's VS ERASURE line, verbatim, and it is a done-when: "The
          * erasure distinction is stated on screen."
          *
          * Two retention periods exist and the spec is emphatic they must not
          * be conflated - this setting governs a DEACTIVATED student's record,
          * while an outright erasure follows the separate, shorter period
          * SCRUM-40 fixes at 90 days and which is not editable here. The
          * spec's own reasoning for saying it out loud: "the two numbers being
          * different is exactly what confuses people."
          */}
        <p className="m-0 mt-2 max-w-[62ch] text-sm leading-[1.6] text-nevo-near-black/70">
          This is about students you deactivate. If you erase a record
          outright, a shorter period applies that we&rsquo;re required to keep.
        </p>
        {school.retentionDays ? (
          <p className="m-0 mt-2 text-[12.5px] text-nevo-near-black/50">
            Currently {school.retentionDays.toLocaleString()} days.
          </p>
        ) : null}

        <SaveRow phase={general} onSave={saveGeneral} />
      </SettingsSection>

      {/* --------------------------------------------------- ACADEMIC YEAR */}
      <SettingsSection
        title="Academic year"
        note="Your terms decide what 'this half-term' means everywhere in Nevo."
      >
        <div className="flex gap-4 max-lg:flex-col">
          <div className="flex-1">
            <label htmlFor="set-ystart" className={S_LABEL}>
              Year starts
            </label>
            <input
              id="set-ystart"
              type="date"
              value={academic.yearStart ?? ""}
              onChange={(e) =>
                setAcademic((a) => ({ ...a, yearStart: e.target.value }))
              }
              className={S_FIELD}
            />
          </div>
          <div className="flex-1">
            <label htmlFor="set-yend" className={S_LABEL}>
              Year ends
            </label>
            <input
              id="set-yend"
              type="date"
              value={academic.yearEnd ?? ""}
              onChange={(e) =>
                setAcademic((a) => ({ ...a, yearEnd: e.target.value }))
              }
              className={S_FIELD}
            />
          </div>
        </div>
        <p className="m-0 mt-2 text-[12.5px] text-nevo-near-black/50">
          The year label comes from these dates, so it can never disagree with
          them.
        </p>

        <div className="mt-6">
          <p className={S_LABEL}>Terms</p>
          <div className="flex flex-col gap-3">
            {terms.map((t, i) => (
              <div
                key={t.id}
                className="rounded-[10px] border border-nevo-near-black/12 px-4 py-3.5"
              >
                <div className="flex items-center gap-3">
                  <input
                    value={t.name}
                    onChange={(e) =>
                      setTerms(
                        terms.map((x, j) =>
                          j === i ? { ...x, name: e.target.value } : x,
                        ),
                      )
                    }
                    aria-label={`Term ${i + 1} name`}
                    className={cn(S_FIELD, "flex-1")}
                  />
                  <button
                    type="button"
                    onClick={() => setTerms(terms.filter((_, j) => j !== i))}
                    className="flex-none cursor-pointer text-[13px] font-semibold text-nevo-navy hover:opacity-75"
                  >
                    Remove
                  </button>
                </div>
                <div className="mt-3 flex gap-3 max-lg:flex-col">
                  <input
                    type="date"
                    value={t.start}
                    onChange={(e) =>
                      setTerms(
                        terms.map((x, j) =>
                          j === i ? { ...x, start: e.target.value } : x,
                        ),
                      )
                    }
                    aria-label={`Term ${i + 1} starts`}
                    className={cn(S_FIELD, "flex-1")}
                  />
                  <input
                    type="date"
                    value={t.end}
                    onChange={(e) =>
                      setTerms(
                        terms.map((x, j) =>
                          j === i ? { ...x, end: e.target.value } : x,
                        ),
                      )
                    }
                    aria-label={`Term ${i + 1} ends`}
                    className={cn(S_FIELD, "flex-1")}
                  />
                </div>

                {/* SCRUM-99's term row is "term name, start date, end date,
                    and an optional half-term break with its own two dates".
                    The pair had no fields at all - the type carried a dead
                    `halfTermBreak?: boolean` that nothing wrote and nothing
                    read, so a school could say a break existed but never
                    when, on the screen whose whole job is to say when. */}
                <div className="mt-3 flex gap-3 max-xl:flex-col">
                  <div className="flex-1">
                    <label
                      htmlFor={`half-start-${t.id}`}
                      className="mb-1 block text-[12.5px] text-nevo-near-black/55"
                    >
                      Half-term break starts (optional)
                    </label>
                    <input
                      id={`half-start-${t.id}`}
                      type="date"
                      value={t.halfTermStart ?? ""}
                      onChange={(e) =>
                        setTerms(
                          terms.map((x, j) =>
                            j === i
                              ? { ...x, halfTermStart: e.target.value }
                              : x,
                          ),
                        )
                      }
                      className={cn(S_FIELD, "w-full")}
                    />
                  </div>
                  <div className="flex-1">
                    <label
                      htmlFor={`half-end-${t.id}`}
                      className="mb-1 block text-[12.5px] text-nevo-near-black/55"
                    >
                      Half-term break ends (optional)
                    </label>
                    <input
                      id={`half-end-${t.id}`}
                      type="date"
                      value={t.halfTermEnd ?? ""}
                      onChange={(e) =>
                        setTerms(
                          terms.map((x, j) =>
                            j === i ? { ...x, halfTermEnd: e.target.value } : x,
                          ),
                        )
                      }
                      className={cn(S_FIELD, "w-full")}
                    />
                  </div>
                </div>

                {/* "A plain line under the offending row ... in navy not red."
                    No red anywhere in this console, and a term calendar being
                    half-entered is not an alarm. */}
                {issueFor(i) ? (
                  <p className="m-0 mt-2.5 text-[13px] leading-[1.5] text-nevo-navy">
                    {issueFor(i)!.message}
                  </p>
                ) : null}
              </div>
            ))}
          </div>

          {/*
            * CAPPED AT THREE, AND SAYING SO RATHER THAN JUST STOPPING.
            *
            * SCRUM-99 called this "a quiet action for schools running four
            * terms", and it was offered without limit - so a school added a
            * fourth term, filled in its date, pressed Save and was told it had
            * saved. `termStartDatesFrom` then cut the fourth date off before
            * the request was built.
            *
            * The cap is not ours to negotiate here (backend, 22 Sep: billing
            * issues one invoice per term start, so a fourth date is a fourth
            * invoice and a four-term calendar is a pricing decision). What IS
            * ours is not pretending the control exists and then quietly
            * undoing it. The schema advertises `maxItems: 3` precisely so the
            * inputs can stop before anyone submits.
            *
            * A LINE, NOT A DISABLED BUTTON. A control that can never re-enable
            * is not a state of the control, it is the absence of one - the
            * same reasoning `ConsoleSessionExpired` uses for a paused account.
            */}
          {terms.length < TERM_STARTS_STORED ? (
            <button
              type="button"
              onClick={() =>
                setTerms([
                  ...terms,
                  {
                    id: `term-${terms.length + 1}-${terms.length}`,
                    name: `Term ${terms.length + 1}`,
                    start: "",
                    end: "",
                  },
                ])
              }
              className="mt-3 cursor-pointer text-sm font-semibold text-nevo-navy hover:opacity-75"
            >
              Add a term
            </button>
          ) : (
            <p className="m-0 mt-3 max-w-[54ch] text-[12.5px] leading-[1.55] text-nevo-near-black/55">
              Nevo stores three term starts. Each one begins a billing period,
              so a fourth is a pricing change rather than a calendar setting -
              talk to us and we&rsquo;ll sort it out with you.
            </p>
          )}
          <p className="m-0 mt-2 text-[12.5px] text-nevo-near-black/50">
            {terms.length === 0
              ? "No terms set yet."
              : `${terms.length} ${terms.length === 1 ? "term" : "terms"} in your year.`}
          </p>
        </div>

        {unresolved ? (
          <p className="m-0 mt-5 text-[13px] font-medium text-nevo-navy">
            {unresolved}
          </p>
        ) : null}
        <SaveRow
          failureNote={calendarNote}
          phase={calendar}
          onSave={saveCalendar}
          disabled={issues.length > 0}
        />
      </SettingsSection>

      {/* ----------------------------------------------------------- TAXONOMY */}
      <SettingsSection
        title="What year groups are called"
        note="These are only the names you see. The underlying year groups never change, so student records and comparisons across schools stay exactly as they are."
      >
        <div className="flex flex-col gap-2.5">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.id)}
              aria-pressed={preset === p.id}
              className={cn(
                "cursor-pointer rounded-xl px-4 py-3.5 text-left transition-colors",
                preset === p.id
                  ? "border-2 border-nevo-navy bg-nevo-navy/[0.06]"
                  : "border border-nevo-near-black/12",
              )}
            >
              <span className="block text-[15px] font-semibold text-nevo-near-black">
                {p.name}
              </span>
              <span className="mt-0.5 block text-[13px] text-nevo-near-black/60">
                {p.examples.join(" · ")}
              </span>
            </button>
          ))}

          {/* CUSTOM IS A CARD, NOT AN ABSENCE. SCRUM-99's done-criterion is
              "Editing a label moves the preset to Custom rather than lying" -
              and with three cards and no fourth, a school that renamed one
              level went on being described as British while its labels were
              no longer British. It is not selectable: a school arrives here by
              editing, not by choosing. */}
          {preset === "custom" ? (
            <div className="rounded-xl border-2 border-nevo-navy bg-nevo-navy/[0.06] px-4 py-3.5">
              <span className="block text-[15px] font-semibold text-nevo-near-black">
                Custom
              </span>
              <span className="mt-0.5 block text-[13px] text-nevo-near-black/60">
                Your own names, edited below.
              </span>
            </div>
          ) : null}
        </div>

        {preset === "custom" ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p className="m-0 text-[13px] text-nevo-near-black/62">
              You&rsquo;ve edited a label, so this is a custom set now.
            </p>
            <button
              type="button"
              onClick={() => applyPreset("nigerian")}
              className="cursor-pointer text-[13px] font-semibold text-nevo-navy hover:opacity-75"
            >
              Back to Nigerian
            </button>
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-2">
          {YEAR_GROUPS.map((yg) => (
            <div key={yg} className="flex items-center gap-3">
              <span className="w-16 flex-none font-mono text-[12px] uppercase text-nevo-near-black/45">
                {yg}
              </span>
              <input
                value={labels[yg] ?? defaultYearGroupLabel(yg)}
                onChange={(e) => {
                  const v = e.target.value;
                  setLabels((prev) => {
                    const next = { ...prev };
                    if (!v.trim() || v === defaultYearGroupLabel(yg)) delete next[yg];
                    else next[yg] = v;
                    return next;
                  });
                }}
                aria-label={`Label for ${yg}`}
                className={cn(S_FIELD, "flex-1")}
              />
            </div>
          ))}
        </div>
        <p className="m-0 mt-3 text-[12.5px] leading-[1.5] text-nevo-near-black/50">
          These labels appear on classes, student records, reports, and in the
          teacher and parent views.
        </p>

        <SaveRow phase={taxonomy} onSave={saveTaxonomy} />
      </SettingsSection>

      {/* ---------------------------------------------------------- PROMOTION */}
      <SettingsSection title="Moving everyone up a year">
        <NotBuiltNote>
          Promotion isn&rsquo;t available yet. It needs to move every year group
          up together, retire the leavers, and stay undoable for a week
          afterwards - and none of that is built on our side yet, so
          there&rsquo;s nothing here that would half-work. We&rsquo;ll tell you
          when it lands.
        </NotBuiltNote>
      </SettingsSection>
      {/* "Share feedback" moved to the foot of SettingsView - see there. */}
    </>
  );
}
