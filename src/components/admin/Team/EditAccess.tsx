"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { teamApi, type TeamMember } from "@/lib/api/team";
import type { PermissionScope } from "@/lib/constants/permissions";
import { cn } from "@/lib/utils";
import { SCOPE_CATALOGUE } from "./adminScopes";

/**
 * The areas an admin can hold, one checkbox each. Shared by the invite sheet
 * and the edit sheet, because SCRUM-39 says editing is "the same sheet": two
 * copies of this list would disagree the first time a scope was added.
 *
 * A scope no longer granted shows only to someone who held it when the sheet
 * opened, so it can be taken away and never given. Fixed at open, so unticking
 * it does not make the row vanish under the pointer.
 */
export function ScopeChecklist({
  on,
  setOn,
  disabled,
}: {
  on: Set<PermissionScope>;
  setOn: Dispatch<SetStateAction<Set<PermissionScope>>>;
  disabled: boolean;
}) {
  const [heldAtOpen] = useState(() => new Set(on));
  return (
    <div className="mt-2.5 flex flex-col gap-2">
      {SCOPE_CATALOGUE.filter((s) => s.grantable !== false || heldAtOpen.has(s.scope)).map((s) => {
        const checked = on.has(s.scope);
        return (
          <label
            key={s.scope}
            className="flex cursor-pointer items-center gap-[13px] rounded-[10px] bg-nevo-cream-elevated px-[15px] py-[13px]"
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
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
            </span>
          </label>
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
 * NOT FOR YOUR OWN ROW (see `canEdit` in the view). The founder's locked
 * Oversight needs a founding flag the team response does not carry, and an
 * admin editing themselves could take their own Oversight away and lose the
 * page they are standing on.
 */
export function EditAccessPanel({
  member,
  name,
  onCancel,
  onSaved,
}: {
  member: TeamMember;
  name: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [on, setOn] = useState<Set<PermissionScope>>(() => new Set(member.scopes));
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const none = on.size === 0;
  const unchanged =
    on.size === member.scopes.length && member.scopes.every((s) => on.has(s));

  const save = () => {
    if (none || unchanged || saving) return;
    setSaving(true);
    setFailed(false);
    teamApi
      .updateScopes(member.userId, [...on])
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
          What can they access?
        </span>
        <ScopeChecklist on={on} setOn={setOn} disabled={saving} />

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
