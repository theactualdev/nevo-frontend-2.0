/**
 * THE VOCABULARY THE ENGINE SPEAKS, and the only affective vocabulary this
 * codebase is allowed to have.
 *
 * There used to be an `AFFECTIVE_STATES` map here - `anxiety`, `boredom`,
 * `frustration`, `confusion` - and components named after it. It was deleted
 * on 17 Sep, and not for tidiness. Frontend §4: "You receive an instruction
 * and apply it as a change to the active screen. You never decide which state
 * is active." Code named for states teaches the next person that the frontend
 * reasons about states, and that is the drift this codebase has hit four times
 * - the count interpolation, the insights threshold, the modality field, the
 * client-side empty condition. Every one was a reasonable local decision by
 * somebody reading the code rather than the architecture. Names are what the
 * code says out loud.
 */

/**
 * THE ENGINE'S INSTRUCTION - the only affective thing the frontend is told.
 *
 * WHY THIS EXISTS. `AdaptResponse.proactiveAdjustment` has carried an `action`
 * all along and nothing read it - the twelfth field on this wire that the
 * backend writes and the client ignores. Searching the document for
 * "frustration" or "anxiety" found nothing and the conclusion drawn was that
 * there was no affective transport at all. That was the wrong search: §4 says
 * those words must never reach the frontend, so their absence is the design
 * working, not a gap. The transport is `action`.
 *
 * **THE CONTRACT PUBLISHED ITS ENUM ON 23 SEP AND THIS LIST DID NOT MATCH IT.**
 * `action` was a bare `string`; it now `$ref`s `ProactiveAction`, which is
 * `simplify`, `slower`, `expand`, `offer_hint`, `show_socratic_panel`. Only two
 * of those were here, so three live instructions were arriving and resolving to
 * null - silently, because an unrecognised action doing nothing is rule 5
 * working exactly as written, which is why no gate said anything.
 *
 * Design ruled the same day, and the ruling is the general one rather than a
 * fix for this row: **the engine's published vocabulary IS the contract, and
 * design and frontend conform to it.** Where design needs an instruction that
 * does not exist, it is raised as a request to backend and nothing is built
 * against a guessed name.
 *
 * So the five below marked CONTRACT are the enum, exactly. The rest are held,
 * not confirmed, and each says why.
 *
 * Anything unrecognised still resolves to null and the interface does nothing,
 * which is `no_action` and also rule 5: absence is an instruction, do not fill
 * the gap.
 *
 * NEVER RENDERED, and they travel on the same object: `reason`, `confidence`
 * and `triggerSignals`. Frame 38 is explicit - "the learner is never shown any
 * of this reasoning, no score, no label, no 'you seem frustrated'" - and
 * `confidence` is an engine parameter, which rule 3 keeps off every screen.
 */
export const ADJUSTMENT_ACTIONS = {
  /** CONTRACT. The child's Simplify control, decided by the engine instead. */
  SIMPLIFY: "simplify",
  /** CONTRACT. */
  SLOWER: "slower",
  /** CONTRACT. */
  EXPAND: "expand",
  /** CONTRACT. */
  OFFER_HINT: "offer_hint",
  /** CONTRACT. */
  SHOW_SOCRATIC_PANEL: "show_socratic_panel",

  /**
   * Not in the enum. Kept because the absence of an instruction is a state the
   * player reasons about, not a value the engine sends.
   */
  NONE: "no_action",
  /*
   * `modulate_density` WAS HERE, and design ruled it out on 1 Oct (SCRUM-180).
   *
   * It was held from 23 Sep on design's "do not declare it dead yet", while the
   * question went back to them: there is no separate affective channel for it
   * to arrive on - `proactiveAdjustment` IS that channel, and its enum has no
   * such value - so it could never fire. Design's answer was to remove it: the
   * "dim the screen" state is gone, and if screen comfort matters later it
   * belongs in the child's device settings, not in an instruction Nevo issues.
   * The attention accommodation's own 30% dim (37c) is a different thing and
   * stays.
   */
  /*
   * `increase_difficulty` WAS HERE, and design retired it on 1 Oct (D28).
   *
   * It was held from 23 Sep on the same "do not declare it dead yet" as
   * `modulate_density`, and drove the "Ready for something harder?" pill. It
   * was never in `ProactiveAction`, so only the signed-out demo could reach
   * it. Design's ruling: "a control nothing can trigger is not a feature".
   * The pill, its per-segment spend and the demo row went with it, and the
   * contract's `step_up_*` signal types are deliberately not emitted - there
   * is no step-up for them to describe.
   */
  /**
   * NOT IN THE ENUM, AND CORRECTLY SO - this one is not a gap.
   *
   * A break is not an adaptation instruction. `simplify`, `slower` and `expand`
   * change the lesson while it continues; a break stops the pushing, which is a
   * different kind of thing. **It already has its own signal** -
   * `AdaptResponse.breakSuggestion`, read by `useRuntimeAdaptation` as
   * `offeredBreak` - so the break works and only this constant is unreachable.
   */
  OFFER_BREAK: "offer_break",
} as const;

export type AdjustmentAction =
  (typeof ADJUSTMENT_ACTIONS)[keyof typeof ADJUSTMENT_ACTIONS];

const KNOWN_ACTIONS = new Set<string>(Object.values(ADJUSTMENT_ACTIONS));

/** The engine's string, or null where it is absent or not one we know. */
export function asAdjustmentAction(
  value: string | null | undefined,
): AdjustmentAction | null {
  if (!value || !KNOWN_ACTIONS.has(value)) return null;
  return value as AdjustmentAction;
}
