import { describe, expect, it } from "vitest";
import { bandForRoster } from "./bands";

/**
 * The roster's closed `AgeBand` (B5, 1 Oct) onto the four tiers here. Each
 * names the same school stage as one tier, so the map is one to one; anything
 * else is no band, and the caller asks rather than assumes.
 */

describe("bandForRoster", () => {
  it("maps each school stage onto its tier", () => {
    expect(bandForRoster("early_primary")).toBe("p13");
    expect(bandForRoster("upper_primary")).toBe("p46");
    expect(bandForRoster("junior_secondary")).toBe("jss");
    expect(bandForRoster("senior_secondary")).toBe("ss");
  });

  it("gives no band for a row with none", () => {
    expect(bandForRoster(null)).toBeNull();
    expect(bandForRoster(undefined)).toBeNull();
  });

  it("does not guess at a value outside the closed set", () => {
    // The free-text values from before 1 Oct convert on read server-side;
    // anything still arriving like this is not ours to interpret.
    expect(bandForRoster("Year 4")).toBeNull();
    expect(bandForRoster("12")).toBeNull();
  });
});
