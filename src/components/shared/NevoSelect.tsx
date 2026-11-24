"use client";

import { Select } from "radix-ui";
import { cn } from "@/lib/utils";

/**
 * ONE DROPDOWN, IN NEVO'S DESIGN LANGUAGE (Olayinka, TO-DO item 2: "All the
 * dropdowns in the Admin console should be properly designed ... built to
 * Nevo's design language"). It replaces the browser's own `<select>` panel,
 * which drew the system's colours and type over a Nevo screen.
 *
 * BUILT ON RADIX SELECT (already in the project as `radix-ui`; no new
 * dependency), because the parts that are easy to get wrong come with it:
 * the combobox and listbox roles, `aria-expanded`, Up / Down / Home / End /
 * Enter / Escape and type-ahead, focus back on the trigger when it closes, and
 * a panel PORTALLED out of whatever it sits in, so a sheet or a scroll area
 * never clips it.
 *
 * THE LOOK IS D13b's MENU (the drawn view menu): a Cream panel, a Navy-tinted
 * row under the pointer, the chosen row Navy and semibold. Radius 10 on the
 * trigger and 12 on the panel, one soft shadow (no higher than level 3), no
 * white and no black, Inter throughout, `cursor-pointer` on every control. A
 * row is at least 44px tall, so it is a target on a tablet too.
 *
 * NATIVE BEHAVIOUR KEPT: the same values and labels, disabled options and a
 * disabled control. None of the selects it replaced sat in a submitted form,
 * so it takes no `name`: a form that needs one adds it here, and maps the
 * empty-value sentinel below back to "" on the way out.
 *
 * AN EMPTY VALUE IS ALLOWED. Radix reserves "" (it means "nothing chosen"),
 * and these screens use "" for "All classes" and the like, so "" is carried
 * across as a sentinel and handed back as "". Callers never see the sentinel.
 */

export interface NevoSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

const EMPTY = "\u0000nevo-empty";
const toRadix = (v: string) => (v === "" ? EMPTY : v);
const fromRadix = (v: string) => (v === EMPTY ? "" : v);

/** The field look, for a select that stands in a form. */
export const SELECT_FIELD =
  "h-[46px] w-full rounded-[10px] border-[1.5px] border-nevo-near-black/16 bg-nevo-cream px-3.5 text-[15px] text-nevo-near-black transition-colors focus:border-nevo-navy";

/**
 * What every trigger shares, whatever its look: the label and the caret on
 * one line, the pointer, a ring a keyboard can see, Navy edge while open, and
 * a prompt ("Choose a class") in a quieter ink than a choice.
 */
const TRIGGER_BASE =
  "group inline-flex min-w-0 cursor-pointer items-center justify-between gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-nevo-navy/45 focus-visible:ring-offset-2 focus-visible:ring-offset-nevo-cream disabled:cursor-not-allowed disabled:opacity-60 data-[state=open]:border-nevo-navy data-[placeholder]:text-nevo-near-black/50";

const SCROLL_ARROW =
  "flex h-7 flex-none cursor-default items-center justify-center text-nevo-near-black/45";

/** D13b's caret: a 15px chevron, in the ink of whatever it sits on. */
function Caret({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function NevoSelect({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  id,
  triggerClassName = SELECT_FIELD,
  contentClassName,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly NevoSelectOption[];
  /** Shown while nothing is chosen. */
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  /** The trigger's own look; the field look when not given. */
  triggerClassName?: string;
  contentClassName?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  const known = options.some((o) => o.value === value);
  /* A placeholder is a prompt, never a row: "Choose a class" is not a class.
     A screen whose "" means something ("All classes") lists it as an
     option, and then it is chosen like any other. */
  return (
    <Select.Root
      /* A value no option carries reads as nothing chosen - the prompt, never
         a stale label. Radix takes "" as "show the placeholder", and keeps
         the control controlled, so an action select ("Add a year group")
         goes back to its prompt after each pick. */
      value={known ? toRadix(value) : ""}
      onValueChange={(v) => onValueChange(fromRadix(v))}
      disabled={disabled}
    >
      <Select.Trigger
        id={id}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        className={cn(TRIGGER_BASE, triggerClassName)}
      >
        <span className="min-w-0 truncate">
          <Select.Value placeholder={placeholder} />
        </span>
        <Select.Icon asChild>
          <Caret className="size-[1.05em] flex-none opacity-55 transition-transform duration-150 group-data-[state=open]:rotate-180" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={6}
          collisionPadding={12}
          /* Escape closes this menu and nothing else: a sheet around it
             listens for Escape on the document and would close too. */
          onEscapeKeyDown={(e) => e.stopPropagation()}
          className={cn(
            "z-[70] max-h-[min(360px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[12px] bg-nevo-cream font-sans shadow-[0_8px_28px_rgba(0,0,0,0.18)] outline-none motion-safe:animate-in motion-safe:fade-in-0",
            contentClassName,
          )}
        >
          {/* A long list (every student in a school) scrolls inside the
              panel; these arrows show there is more, and scroll on hover. */}
          <Select.ScrollUpButton className={SCROLL_ARROW}>
            <Caret className="size-[15px] rotate-180" />
          </Select.ScrollUpButton>
          <Select.Viewport className="flex flex-col gap-0.5 p-1.5">
            {options.map((o) => (
              <Select.Item
                key={o.value}
                value={toRadix(o.value)}
                disabled={o.disabled}
                className="flex min-h-[44px] cursor-pointer items-center rounded-[8px] px-[15px] py-2.5 text-[14px] text-nevo-near-black/80 outline-none select-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45 data-[highlighted]:bg-nevo-navy/[0.06] data-[state=checked]:bg-nevo-navy/[0.08] data-[state=checked]:font-semibold data-[state=checked]:text-nevo-navy"
              >
                <Select.ItemText>{o.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
          <Select.ScrollDownButton className={SCROLL_ARROW}>
            <Caret className="size-[15px]" />
          </Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
