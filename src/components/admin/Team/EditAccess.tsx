"use client";

import { Fragment, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { teamApi, type TeamMember } from "@/lib/api/team";
import { holderFor, type LearningSupportHolders } from "@/lib/api/learningSupport";
import { getSession } from "@/lib/auth/session";
import { LearningSupportLine } from "../LearningSupport/LearningSupportLine";
import { AdminLevelLine } from "./AdminLevelLine";
import type { PermissionScope } from "@/lib/constants/permissions";
import { cn } from "@/lib/utils";
import { FOUNDING_LOCK_LINE, SCOPE_CATALOGUE } from "./adminScopes";

/**
 * The areas an admin can hold, one checkbox each. Shared by the invite sheet
 * and the edit sheet, because SCRUM-39 says editing is "the same sheet": two
 * copies of this list would disagree the first time a scope was added.
 *
 * A scope no longer granted shows only to someone who held it when the sheet
 * opened, so it can be taken away and never given. Fixed at open, so unticking
 * it does not make the row vanish under the pointer.
 *
 * A LOCKED scope stays ticked and cannot be changed, with its reason under it -
 * the founder's General Oversight (SCRUM-39: "Founder cannot remove their own
 * Oversight through any path, and the lock states why").
 */
export function ScopeChecklist({
  on,
  setOn,
  disabled,
  locked = [],
  lockedReason,
  replace,
  after,
}: {
  on: Set<PermissionScope>;
  setOn: Dispatch<SetStateAction<Set<PermissionScope>>>;
  disabled: boolean;
  locked?: PermissionScope[];
  lockedReason?: string;
  /** A line drawn in one scope's place - D03b's Learning Support, in senco's. */
  replace?: { scope: PermissionScope; line: ReactNode };
  /** A line drawn after one scope - D03b's administrator level, after Learning Support. */
  after?: { scope: PermissionScope; line: ReactNode };
}) {
  const [heldAtOpen] = useState(() => new Set(on));
  return (
    <div className="mt-2.5 flex flex-col gap-2">
      {SCOPE_CATALOGUE.filter((s) => s.grantable !== false || heldAtOpen.has(s.scope)).map((s) => {
        const tail = after?.scope === s.scope ? after.line : null;
        if (replace?.scope === s.scope) {
          return (
            <Fragment key={s.scope}>
              <div>{replace.line}</div>
              {tail}
            </Fragment>
          );
        }
        const isLocked = locked.includes(s.scope);
        const checked = isLocked || on.has(s.scope);
        return (
          <Fragment key={s.scope}>
          <label
            className="flex cursor-pointer items-center gap-[13px] rounded-[10px] bg-nevo-cream-elevated px-[15px] py-[13px]"
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled || isLocked}
              onChange={() =>
                setOn((prev) => {
                  const next = new Set(prev);
                  if (next.has(s.scope)) next.delete(s.scope);
                  else next.add(s.scope);
                  return next;
                })
              }
              className="sr-only"
            />
            <span
              aria-hidden
              className={cn(
                "flex size-[22px] shrink-0 items-center justify-center rounded-[6px]",
                checked ? "bg-nevo-navy text-nevo-cream" : "border-2 border-nevo-near-black/24",
              )}
            >
              {checked && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              )}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-[14.5px] font-semibold text-nevo-near-black">{s.name}</span>
              <span className="mt-px text-[13px] text-nevo-near-black/58">{s.desc}</span>
              {isLocked && lockedReason ? (
                <span className="mt-1 text-[12.5px] leading-[1.45] text-nevo-navy">{lockedReason}</span>
              ) : null}
            </span>
          </label>
          {tail}
          </Fragment>
        );
      })}
    </div>
  );
}

/**
 * SCRUM-39 D3 "Editing an admin": "Same sheet, pre-filled, titled to the
 * person. Removing the last scope is blocked with a plain line, not a modal:
 * 'An admin needs at least one area.'"
 *
 * `PUT /api/v1/admin/team/{id}/scopes` was deployed and typed with no caller,
 * so an admin's access could be set at invite and never changed after. The
 * code's own note said D03 draws no affordance; the spec does, and the spec
 * beats the frame.
 *
 * NOT FOR YOUR OWN ROW (see `canEdit` in the view): an admin editing
 * themselves could take their own Oversight away and lose the page they are
 * standing on. The FOUNDER'S Oversight is locked here, with D03's reason, now
 * the team response carries `founding` (8 Oct).
 */
export function EditAccessPanel({
  member,
  name,
  ls = null,
  onLs,
  viewerSenior = false,
  onLevel,
  onCancel,
  onSaved,
}: {
  member: TeamMember;
  name: string;
  /** Who holds Learning Support; null keeps the old senco checkbox. */
  ls?: LearningSupportHolders | null;
  onLs?: (next: LearningSupportHolders) => void;
  /** Whether the person looking is a senior administrator, as the team read says. */
  viewerSenior?: boolean;
  /** The member as the server has them, after their level changed. */
  onLevel?: (next: TeamMember) => void;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [on, setOn] = useState<Set<PermissionScope>>(() => new Set(member.scopes));
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [me] = useState(() => getSession()?.userId ?? null);
  /*
   * D03b: LEARNING SUPPORT IS ONE LINE AMONG THESE, and it stands where the
   * "SENCo / Learning Support" scope was ticked. The backend gives the senco
   * scope with the role and takes it away with it, so two lines would be two
   * controls for one thing. Its toggle answers at once, as D03b draws it; the
   * scopes still wait for Save.
   *
   * An invitation still open keeps the checkbox: nobody can hold the role
   * before they have joined.
   */
  const asLine = ls !== null && member.status.toLowerCase() !== "invited";
  /** The role as it stands now, if the toggle has moved it in this sheet. */
  const [lsNow, setLsNow] = useState<boolean | null>(null);

  const none = on.size === 0;
  const unchanged =
    on.size === member.scopes.length && member.scopes.every((s) => on.has(s));

  const save = () => {
    if (none || unchanged || saving) return;
    setSaving(true);
    setFailed(false);
    // The senco scope follows the role: a toggle in this sheet has already
    // moved it on the server, and Save must not move it back.
    const scopes = new Set(on);
    if (lsNow === true) scopes.add("senco");
    if (lsNow === false) scopes.delete("senco");
    teamApi
      .updateScopes(member.userId, [...scopes])
      .then(() => onSaved())
      .catch(() => setFailed(true))
      .finally(() => setSaving(false));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-nevo-near-black/28 backdrop-blur-[0.4px] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${name}'s access`}
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-[560px] overflow-y-auto bg-nevo-cream px-[38px] py-[34px] shadow-[0_0_48px_rgba(0,0,0,0.22)] motion-safe:animate-in motion-safe:slide-in-from-right motion-safe:duration-200"
      >
        <h2 className="text-[23px] font-semibold tracking-[-0.015em] text-nevo-near-black xl:text-[26px]">
          {name}&rsquo;s access
        </h2>
        {member.email ? (
          <p className="mt-1.5 text-[15.5px] leading-[1.55] text-nevo-near-black/60">
            {member.email}
          </p>
        ) : null}

        <span className="mt-7 block text-[13px] font-semibold text-nevo-near-black/70">
          {/* D03b's "What she can access" - with no gender sent, the first name. */}
          {`What ${member.firstName?.trim() || name} can access`}
        </span>
        <ScopeChecklist
          on={on}
          setOn={setOn}
          disabled={saving}
          locked={member.founding ? ["oversight"] : []}
          lockedReason={FOUNDING_LOCK_LINE}
          replace={
            asLine && ls
              ? {
                  scope: "senco",
                  line: (
                    <LearningSupportLine
                      className="rounded-[10px] bg-nevo-cream-elevated px-[15px] py-[13px]"
                      person={{ userId: member.userId, name }}
                      holders={ls}
                      you={member.userId === me}
                      me={me}
                      canGive={member.status.toLowerCase() === "active" && !saving}
                      canRemove={!saving}
                      onChange={(next) => {
                        setLsNow(holderFor(next, member.userId) !== null);
                        onLs?.(next);
                      }}
                    />
                  ),
                }
              : undefined
          }
          after={
            // D03b: the level sits with Learning Support, at the same weight.
            // Nobody can hold it before they have joined.
            member.accessLevel && member.status.toLowerCase() !== "invited"
              ? {
                  scope: "senco",
                  line: (
                    <AdminLevelLine
                      className="rounded-[10px] bg-nevo-cream-elevated px-[15px] py-[13px]"
                      person={{ userId: member.userId, name }}
                      level={member.accessLevel}
                      you={member.userId === me}
                      canChange={viewerSenior && member.status.toLowerCase() === "active" && !saving}
                      onChange={(next) => onLevel?.(next)}
                    />
                  ),
                }
              : undefined
          }
        />

        {none ? (
          // SCRUM-39's plain line - not a modal, not an error colour.
          <p className="mt-4 text-[13.5px] text-nevo-near-black/62">
            An admin needs at least one area.
          </p>
        ) : null}
        {failed ? (
          <p className="mt-4 rounded-[10px] bg-nevo-violet/16 px-4 py-3 text-[13.5px] leading-[1.5] text-nevo-near-black/78">
            That didn&rsquo;t save, and nothing changed. The areas you chose
            are still here &ndash; try again in a moment.
          </p>
        ) : null}

        <div className="mt-6 flex items-center gap-3.5">
          <button
            type="button"
            onClick={save}
            disabled={none || unchanged || saving}
            className="flex h-[50px] cursor-pointer items-center justify-center rounded-[10px] bg-nevo-navy px-6 text-[15px] font-semibold text-nevo-cream transition-[filter] hover:brightness-110 disabled:cursor-default disabled:opacity-50 disabled:hover:brightness-100"
          >
            {saving ? "Saving…" : "Save access"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="h-[50px] cursor-pointer rounded-[10px] px-4 text-sm font-medium text-nevo-navy transition-colors hover:bg-nevo-navy/6"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
