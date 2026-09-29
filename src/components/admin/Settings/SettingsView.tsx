"use client";

import { usePermissions, useSetupGate } from "@/hooks";
import { PERMISSION_SCOPES } from "@/lib/constants/permissions";
import { cn } from "@/lib/utils";
import { AccountSettings } from "./AccountSettings";
import { SchoolSettings } from "./SchoolSettings";

/**
 * D12 / D12b / D12c Settings (SCRUM-99), as two stacks on one page.
 *
 * NOT TABS, and that is the spec's word twice over. SCRUM-99's first rule is
 * "'Your school' and 'You' are separate stacks under separate headings, not
 * tabs. An admin should never wonder whether a change affects the school or
 * only themselves", and D12.1 repeats it: "a single scrolling column with a
 * section index, not tabs". This shipped as a tablist on the strength of the
 * frames' breadcrumbs; the spec governs, and the reason is legible - a tab
 * hides half the page, so the one question the division exists to answer
 * ("does this change my school or just me?") gets asked again on every visit.
 *
 * THE SCHOOL HALF IS OVERSIGHT-SCOPED. D12.1: a non-oversight admin sees
 * "'Your school' absent entirely, not greyed", and the done-when is "a
 * billing-only admin sees a coherent page with no empty school section". It
 * previously rendered for everybody.
 *
 * An UNRESOLVED scope list is not an answer about this admin, so nothing is
 * hidden or shown on the strength of one - the same rule the rail follows.
 *
 * WHAT IS BLOCKED, and it is a third of this ticket:
 *
 *   - PROMOTION (D12b, "Move everyone up a year"). No endpoint. It needs a
 *     bulk year-group advance, a leavers pass, and a seven-day undo, and the
 *     API has none of the three - `PATCH /students/{id}/class` moves one
 *     student between classes, which is a different operation entirely.
 *   - TWO-STEP SIGN-IN (D12c). No endpoint anywhere: no enrolment, no secret,
 *     no verify, no recovery codes.
 *   - EMAIL AND ROLE TITLE (D12c). `ProfilePatch` carries neither. The NAME is
 *     editable - this said "there is no write" and `PATCH /api/v1/users/me` has
 *     been live, typed and consumed by the teacher console since 1 Sep.
 *
 * All three are absent rather than mocked. A settings screen that appears to
 * save and does not is worse than one that admits the control is not built -
 * and in the promotion case, a control that appears to move 287 children
 * between year groups and silently does nothing would be genuinely dangerous.
 */

/** The section index, D12.1: text links in a row, desktop only, never tabs. */
const INDEX: { href: string; label: string; school: boolean }[] = [
  { href: "#settings-school", label: "Your school", school: true },
  { href: "#settings-you", label: "You", school: false },
];

function SuperHeading({ id, children }: { id: string; children: string }) {
  return (
    <h3
      id={id}
      className="m-0 mt-10 border-b border-nevo-near-black/10 pb-2.5 text-[19px] font-semibold text-nevo-near-black"
    >
      {children}
    </h3>
  );
}

export function SettingsView() {
  const { hasScope, resolved, status, refresh } = usePermissions();
  /*
   * Three states, not two - the lesson from the in-flight sweep. `false` is
   * also what `hasScope` says before the read has answered, so gating on it
   * alone would hide a proprietor's own school settings for the length of a
   * request and call it a permission.
   */
  const scopesFailed = status === "failed";
  const showSchool = resolved && hasScope(PERMISSION_SCOPES.GENERAL_OVERSIGHT);

  return (
    <div className="mx-auto w-full max-w-[1040px] px-[38px] py-[34px] xl:px-[52px] xl:py-11">
      <div className="mx-auto max-w-[680px]">
        <h2 className="m-0 text-[28px] font-semibold tracking-[-0.018em] text-nevo-near-black">
          Settings
        </h2>

        {/* Desktop only, per D12.1: "not a sidebar, not tabs". */}
        <nav
          aria-label="Settings sections"
          className="mt-4 hidden flex-wrap gap-[18px] xl:flex"
        >
          {INDEX.filter((i) => !i.school || showSchool).map((i) => (
            <a
              key={i.href}
              href={i.href}
              className="text-[13.5px] font-semibold text-nevo-navy hover:underline"
            >
              {i.label}
            </a>
          ))}
        </nav>

        {scopesFailed ? (
          /* Not "you don't have access" - that would be a claim about this
             admin produced by a broken GET. The rail says the same thing. */
          <div className={cn(SETTINGS_CARD, "mt-6")}>
            <p className="m-0 text-[14.5px] leading-[1.55] text-nevo-near-black/72">
              We couldn&rsquo;t check which parts of Settings you can see, so
              your school&rsquo;s settings aren&rsquo;t shown here yet.
            </p>
            <button
              type="button"
              onClick={refresh}
              className="mt-3.5 cursor-pointer text-[13.5px] font-semibold text-nevo-navy hover:underline"
            >
              Try again
            </button>
          </div>
        ) : null}

        {showSchool ? (
          <>
            <SuperHeading id="settings-school">Your school</SuperHeading>
            <SchoolSettings />
          </>
        ) : null}

        <SuperHeading id="settings-you">You</SuperHeading>
        <AccountSettings />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- shared pieces */

export const SETTINGS_CARD =
  "rounded-xl bg-nevo-cream-elevated px-6 py-[26px] shadow-[0_2px_8px_rgba(0,0,0,0.06)]";

export const S_LABEL = "mb-2 block text-[13px] font-medium text-nevo-near-black/62";

export const S_FIELD =
  "w-full rounded-[10px] border border-nevo-near-black/12 bg-nevo-cream px-4 py-3 text-[15px] text-nevo-near-black outline-none transition-colors focus:border-nevo-navy disabled:cursor-not-allowed disabled:opacity-60";

export function SettingsSection({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn(SETTINGS_CARD, "mt-5")}>
      <h3 className="m-0 text-[17px] font-semibold text-nevo-near-black">{title}</h3>
      {note ? (
        <p className="m-0 mt-1 max-w-[58ch] text-[13px] leading-[1.55] text-nevo-near-black/58">
          {note}
        </p>
      ) : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

/**
 * The "not built yet" note.
 *
 * Violet, never red, and it says what is true rather than teasing a control -
 * SCRUM-39's rule that absence beats disablement applies here too. It names
 * what the section would do so a reader knows what they are missing.
 */
export function NotBuiltNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="m-0 rounded-[10px] bg-nevo-violet/[0.18] px-4 py-3.5 text-[13.5px] leading-[1.55] text-nevo-navy">
      {children}
    </p>
  );
}

/** Save button plus its quiet confirmation. */
export function SaveRow({
  phase,
  onSave,
  disabled,
  savedLabel = "Saved",
  failureNote,
}: {
  phase: "idle" | "saving" | "saved" | "failed";
  onSave: () => void;
  disabled?: boolean;
  savedLabel?: string;
  /**
   * The server's own reason, when it gave one.
   *
   * Optional, so the three savers that have nothing better to say keep the
   * generic line. Where the backend has written a 422 message for the person
   * who has to act on it - the term cap explains that billing issues one
   * invoice per term start - showing "that didn't save" instead throws away
   * the only sentence that would let them fix it.
   */
  failureNote?: string | null;
}) {
  /*
   * D24 / D01b: the school's settings pause while setup is unfinished. Only
   * the school half uses this row - an admin's own name and password (Your
   * account) are theirs, not the school's, and stay editable.
   */
  const { writesPaused, note } = useSetupGate();
  return (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={onSave}
        disabled={disabled || writesPaused || phase === "saving"}
        className="cursor-pointer rounded-[10px] bg-nevo-navy px-5 py-3 text-sm font-semibold text-nevo-cream transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:brightness-100"
      >
        {phase === "saving" ? "Saving…" : "Save changes"}
      </button>
      {writesPaused && note ? (
        <span className="text-[13px] text-nevo-near-black/55">{note}</span>
      ) : null}
      {phase === "saved" ? (
        <span className="text-[13px] font-semibold text-nevo-navy motion-safe:animate-nevo-reveal">
          {savedLabel}
        </span>
      ) : null}
      {phase === "failed" ? (
        <span className="max-w-[46ch] text-[13px] leading-[1.5] text-nevo-navy">
          {failureNote ??
            "That didn’t save. Nothing changed - try again in a moment."}
        </span>
      ) : null}
    </div>
  );
}
