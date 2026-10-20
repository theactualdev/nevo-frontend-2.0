import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * NOTHING CALLS THE BROWSER'S SPEECH RECOGNITION. Not until v1.5.
 *
 * Lydia, 19 Oct: "Switch the microphone off, and it is SCRUM-256 for v1.5."
 * Ask Nevo's microphone was the browser's own recogniser, and in Chrome that
 * sends a child's voice to Google: a provider nobody chose, that none of our
 * documents name, and that arrived with the browser rather than by anyone's
 * decision. Dictation comes back in v1.5 with a provider we chose, assessed
 * and named, and that change deletes this file on purpose.
 *
 * Until then it must not come back by accident, so the whole tree is read and
 * any mention of the recognition API fails, comments included: a comment
 * naming it is usually the first line of code that uses it. Speech SYNTHESIS
 * (read-aloud, the profiling sentences) is a different API, sends nothing of
 * the child's, and is not touched by this.
 */

const SELF = join(process.cwd(), "src", "lib", "noBrowserDictation.test.ts");
const roots = ["src", "scripts", "e2e"].map((d) => join(process.cwd(), d));
const CODE = /\.(ts|tsx|mjs|cjs|js|jsx)$/;
// SpeechRecognition, webkitSpeechRecognition, SpeechRecognitionEvent, and the
// grammar list that only the recogniser uses.
const RECOGNITION = /SpeechRecognition|SpeechGrammar|webkitSpeech/;

const files = (dir: string): string[] => {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.flatMap((name) => {
    if (name === "node_modules" || name.startsWith(".")) return [];
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return CODE.test(p) && p !== SELF ? [p] : [];
  });
};

describe("source files", () => {
  // The whole tree is read, which takes several seconds on a busy machine.
  it("never reference the browser's speech recognition (SCRUM-256, v1.5)", { timeout: 60_000 }, () => {
    const offenders: string[] = [];
    for (const p of roots.flatMap(files)) {
      const text = readFileSync(p, "utf8");
      if (!RECOGNITION.test(text)) continue;
      text.split("\n").forEach((line, i) => {
        if (RECOGNITION.test(line)) offenders.push(`${relative(process.cwd(), p)}:${i + 1}`);
      });
    }

    expect(offenders).toEqual([]);
  });
});
