import { describe, expect, it } from "vitest";
import { densityForAction } from "./densityForAction";
import { DENSITY } from "@/lib/constants";
import {
  ADJUSTMENT_ACTIONS,
  type AdjustmentAction,
} from "@/lib/constants/affect";

/**
 * The join design ruled on 23 Sep: the engine's instruction and the child's
 * chip are the same operation, so they must end in the same value.
 */

describe("the three instructions that are densities", () => {
  it.each([
    [ADJUSTMENT_ACTIONS.SIMPLIFY, DENSITY.SIMPLIFY],
    [ADJUSTMENT_ACTIONS.SLOWER, DENSITY.SLOWER],
    [ADJUSTMENT_ACTIONS.EXPAND, DENSITY.EXPAND],
  ])("%s asks for %s", (action, density) => {
    expect(densityForAction(action)).toBe(density);
  });

  it("maps every value the contract's enum can send in this family", () => {
    // The enum is five; two of them are not densities and are covered below.
    // If a sixth pace instruction is ever published, this is where it lands.
    const contractDensities = [
      ADJUSTMENT_ACTIONS.SIMPLIFY,
      ADJUSTMENT_ACTIONS.SLOWER,
      ADJUSTMENT_ACTIONS.EXPAND,
    ];

    for (const a of contractDensities) expect(densityForAction(a)).not.toBeNull();
  });
});

describe("the instructions that are not densities", () => {
  it.each([
    [ADJUSTMENT_ACTIONS.OFFER_HINT],
    [ADJUSTMENT_ACTIONS.SHOW_SOCRATIC_PANEL],
  ])("%s is null, not a default", (action) => {
    /*
     * These are instructions about the same screen and they are not reshapes.
     * Returning a density for them would silently change what a child is
     * reading because the engine offered them a hint.
     */
    expect(densityForAction(action)).toBeNull();
  });

  it("no_action is null", () => {
    expect(densityForAction(ADJUSTMENT_ACTIONS.NONE)).toBeNull();
  });

  it("null and undefined are null, so the caller keeps what it had", () => {
    expect(densityForAction(null)).toBeNull();
    expect(densityForAction(undefined)).toBeNull();
  });
});

describe("the values the contract does not send", () => {
  it.each([
    [ADJUSTMENT_ACTIONS.OFFER_BREAK],
    // Retired by design on 1 Oct (D28), and a bare string for the same
    // reason `modulate_density` is below.
    ["increase_difficulty" as AdjustmentAction],
    /*
     * `modulate_density` stays in this list as a bare string after design
     * removed it on 1 Oct (SCRUM-180). The NAME says density, which made it
     * the tempting one to fold in here; it was a dim of chrome, never a
     * reshape of the text, and now it is nothing at all.
     */
    ["modulate_density" as AdjustmentAction],
  ])("%s does not become a density by the back door", (action) => {
    expect(densityForAction(action)).toBeNull();
  });
});
