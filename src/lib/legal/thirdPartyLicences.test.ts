import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import inventory from "./thirdPartyLicences.json";

/**
 * The third-party licences page is generated from the lockfile. These keep it
 * honest: a dependency added, removed or upgraded without regenerating the
 * list fails here rather than leaving the page the EULA points at out of date.
 */
describe("third-party licences inventory", () => {
  // It reads every installed package's folder, which takes seconds on Windows.
  it("matches what the lockfile installs", () => {
    expect(() =>
      execFileSync(process.execPath, ["scripts/third-party-licences.mjs", "--check"], {
        stdio: "pipe",
      }),
    ).not.toThrow();
  }, 60_000);

  it("names a licence and an https address for every package", () => {
    for (const entry of inventory.packages) {
      expect(entry.licence, entry.name).not.toBe("UNKNOWN");
      expect(entry.url, entry.name).toMatch(/^https:\/\//);
    }
  });

  it("lists the framework at the version production installs", () => {
    const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
    const next = inventory.packages.find((entry) => entry.name === "next");
    expect(next?.version).toBe(lock.packages["node_modules/next"].version);
  });
});
