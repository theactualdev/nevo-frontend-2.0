"use client";

import { cn } from "@/lib/utils";

/**
 * SCRUM-152: the bar that says what happened.
 *
 * "Every action in the product currently completes in silence. A person
 * creating a class, importing a roster or assigning a lesson has to infer
 * success from the page changing underneath them."
 *
 * CALLED A SYSTEM MESSAGE, NOT A TOAST OR A NOTIFICATION, and that is a naming
 * rule rather than a preference: `notification` already means something else
 * in this product - the bell, the panel, `notification-preferences` on the
 * wire - and the two must not be confused in code or in copy.
 *
 * NO GREEN, AND NOT BECAUSE OF A PALETTE. Every convention for a success
 * message is a green bar with a tick, and this product has no green. Success
 * is navy; failure is navy at greater weight carrying a quiet violet mark. The
 * distinction is carried by WORDS AND WEIGHT, which is also the accessible
 * answer - a person who cannot separate two hues still reads "rejected".
 *
 * THE BAR SAYS HOW MANY; THE PAGE SAYS WHICH. Design's first governing rule:
 * *"a system message is never the only place a failure is recorded. If an
 * import rejects thirty rows and the only notice is a bar that fades after
 * four seconds, a person who looked away has lost that permanently."* So a
 * partial result carries an action INTO the page that lists the rows, and that
 * page is where the record lives.
 */

/** SM-01 through SM-05, plus SM-07's child variant. */
export type SystemMessageKind =
  | "confirm"
  | "count"
  | "partial"
  | "failed"
  | "progress";

export interface SystemMessageAction {
  label: string;
  onAction: () => void;
}

/**
 * A message on a grown-up's screen.
 *
 * `action` is offered where there is an obvious next step - SM-03 and SM-04
 * both carry one. SM-01 explicitly does not, which is why this is optional
 * rather than required by kind: a confirmation with somewhere to go is a
 * confirmation that is asking for something.
 */
export interface AdultMessage {
  audience?: "adult";
  kind: SystemMessageKind;
  message: string;
  action?: SystemMessageAction;
}

/**
 * A message on a CHILD's screen (SM-07), and the type is the enforcement.
 *
 * Design's second governing rule: *"no celebratory message ever appears on a
 * child's screen. 'Well done, lesson complete' is a reward mechanic and the
 * product has none by decision. A child may see a factual system state. A
 * child never sees praise, a tick, a count or a streak."* That is rule 8 of
 * the architecture, and the most reliable way to keep it is to make the wrong
 * thing unsayable: this shape has no `kind`, no `action` and no count, so a
 * caller on a student screen has nothing to reach for.
 *
 * `state` is the whole vocabulary. Adding to it is a design decision, not a
 * convenience - which is the point of it being a closed set rather than a
 * string.
 *
 * NO "OFFLINE" AND NO "ONLINE" (design, D55). The child's bar carries only
 * what Nevo itself says about the service, and never repeats the offline
 * banner, which already owns the connection on every tab and in the player.
 * Both states were here and were raised by nothing; they are gone so that
 * nothing can. And in v1 nothing raises this bar for a child at all - the
 * student shell mounts no `SystemMessagesProvider` - so on a child's screen it
 * renders nothing, which is the ruling's own answer for that case.
 */
export interface ChildMessage {
  audience: "child";
  state: "saved";
}

export type SystemMessageInput = AdultMessage | ChildMessage;

/**
 * The only thing a child's screen may say here, and it is not praise.
 *
 * A factual system state, in the frame's own register: what happened to their
 * work. No tick, no count, no "well done", nothing a child could read as a
 * score - and nothing about the connection, which is the banner's (D55).
 *
 * ONLY ONCE THE BACKEND HAS CONFIRMED THE SAVE (design D112, 6 Oct): "Yes,
 * if it states something the backend confirmed. If the save is not confirmed,
 * the line does not appear at all, per D88 and D89." So `saved` is raised
 * from a write's success and never from its attempt, a queued retry or a
 * device copy. Nothing raises it today.
 */
const CHILD_COPY: Record<ChildMessage["state"], string> = {
  saved: "Your work is saved.",
};

export function isChild(m: SystemMessageInput): m is ChildMessage {
  return m.audience === "child";
}

/**
 * The number spelled, not badged (SM-02).
 *
 * "Twelve classes created", never "12 classes created" and never a count in a
 * pill. Design's own examples run to fourteen, so the boundary is not the
 * usual spell-to-twelve house style.
 *
 * TWENTY IS MY READING, NOT A RULING - raised on SCRUM-152. Above it a spelled
 * number stops being easier to read than the figure ("one hundred and forty
 * seven classes created" is worse than "147"), and an import of that size is
 * exactly where a person wants the digits. If design wants a different
 * boundary it is this one constant.
 */
const SPELLED = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight",
  "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen",
  "Sixteen", "Seventeen", "Eighteen", "Nineteen", "Twenty",
];

export function spellCount(n: number): string {
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return String(n);
  return n <= 20 ? SPELLED[n] : String(n);
}

const Mark = ({ kind }: { kind: SystemMessageKind }) => {
  if (kind === "progress") {
    return (
      <span
        className="size-[18px] shrink-0 rounded-full border-[2.5px] border-nevo-cream/25 border-t-nevo-cream motion-safe:animate-spin motion-safe:[animation-duration:800ms]"
        aria-hidden
      />
    );
  }
  if (kind === "failed" || kind === "partial") {
    /* A quiet violet dot, never red and never an alarm glyph. The system owns
       the failure - the mark is a marker, not a verdict on the person. */
    return (
      <span className="size-[10px] shrink-0 rounded-full bg-nevo-violet" aria-hidden />
    );
  }
  return (
    <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-nevo-cream/20 text-nevo-cream">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M20 6L9 17l-5-5" />
      </svg>
    </span>
  );
};

export function SystemMessage({
  message,
  onDismiss,
}: {
  message: SystemMessageInput;
  /** Absent when the bar leaves on its own (SM-01, SM-02, SM-05). */
  onDismiss?: () => void;
}) {
  if (isChild(message)) {
    return (
      <div
        role="status"
        className="inline-flex w-max max-w-[420px] items-center gap-[9px] rounded-[12px] bg-nevo-violet/20 px-3.5 py-[9px] motion-safe:animate-nevo-rise"
      >
        {/* The dot and nothing else. No tick - a tick is the shape of a
            reward, and SM-07 rules it out by name. */}
        <span className="size-2 shrink-0 rounded-full bg-nevo-violet" aria-hidden />
        <span className="text-[13px] leading-[1.4] font-medium text-nevo-navy">
          {CHILD_COPY[message.state]}
        </span>
      </div>
    );
  }

  const heavy = message.kind === "failed" || message.kind === "partial";

  return (
    <div
      role="status"
      className="inline-flex w-max max-w-[560px] items-center gap-3 rounded-[12px] bg-nevo-navy py-3.5 pr-4 pl-[15px] shadow-[0_8px_32px_rgba(0,0,0,0.16)] motion-safe:animate-nevo-rise"
    >
      <Mark kind={message.kind} />
      <span
        className={cn(
          "text-[14.5px] leading-[1.4] text-nevo-cream",
          // The weight IS the distinction, with the words. Not a colour.
          heavy ? "font-semibold" : "font-medium",
        )}
      >
        {message.message}
      </span>
      {message.action && (
        <button
          type="button"
          onClick={message.action.onAction}
          className="ml-1 inline-flex h-8 shrink-0 cursor-pointer items-center rounded-lg bg-nevo-cream/16 px-3.5 text-[13.5px] font-semibold text-nevo-cream transition-[filter] hover:brightness-110"
        >
          {message.action.label}
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="ml-0.5 inline-flex shrink-0 cursor-pointer items-center text-nevo-cream/60 transition-colors hover:text-nevo-cream"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </div>
  );
}
