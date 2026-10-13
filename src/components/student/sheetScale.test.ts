import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE SHELL'S SHEETS AND SYSTEM CARDS STAY ON THE SCALE. Design, 13 Oct:
 * "Sheet and modal radii 20 to 16", "rotate prompt tile 28 to 16", and
 * "Shadows capped at Level 3" (CLAUDE-reference: "Shadows only up to Level 3
 * (0 8px 32px rgba(0,0,0,0.16))"). Each of these surfaces had drifted above
 * one or the other, so this reads their classes and fails on any radius over
 * 16px or any shadow heavier than Level 3.
 */
const SURFACES = [
  "AskNevo/AskNevo.tsx",
  "Lessons/LessonPreviewSheet.tsx",
  "Progress/SessionDetailSheet.tsx",
  "Profile/AvatarPickerSheet.tsx",
  "Profile/SignOutSheet.tsx",
  "Shell/RotatePrompt.tsx",
  "Feedback/StudentFeedbackScreen.tsx",
  "Auth/AccountPauseHost.tsx",
];

/**
 * Not a sheet or a card: the floating Ask Nevo pill, drawn at this value by
 * frame 26. Its 0.22 is darker than Level 3's 0.16, and is raised with design
 * rather than changed here.
 */
const PILL = "shadow-[0_6px_20px_rgba(43,43,47,0.22)]";

const source = (file: string) =>
  readFileSync(join(process.cwd(), "src", "components", "student", file), "utf8");

function oversizedRadii(text: string): string[] {
  const px = [...text.matchAll(/rounded(?:-[a-z]{1,2})?-\[(\d+(?:\.\d+)?)px\]/g)]
    .filter((m) => Number(m[1]) > 16)
    .map((m) => m[0]);
  const named = [...text.matchAll(/rounded(?:-[a-z]{1,2})?-(?:3xl|4xl)\b/g)].map(
    (m) => m[0],
  );
  return [...px, ...named];
}

/** Every shadow past Level 3: further, softer-spread or darker. */
function heavyShadows(text: string): string[] {
  const arbitrary = [...text.matchAll(/shadow-\[([^\]]+)\]/g)].filter((m) => {
    if (m[0] === PILL) return false;
    const [x = "0", y = "0", blur = "0"] = m[1].split("_");
    const alpha = Number(/rgba\([^)]*,\s*([\d.]+)\)/.exec(m[1])?.[1] ?? 0);
    const n = (v: string) => Math.abs(parseFloat(v) || 0);
    return n(x) > 8 || n(y) > 8 || n(blur) > 32 || alpha > 0.16;
  });
  const named = [
    ...text.matchAll(/shadow-(?:lg|xl|2xl|elevation-[4-9])\b/g),
  ];
  return [...arbitrary, ...named].map((m) => m[0]);
}

describe("the shell's sheets and system cards", () => {
  it.each(SURFACES)("%s keeps every radius at 16px or under", (file) => {
    expect(oversizedRadii(source(file))).toEqual([]);
  });

  it.each(SURFACES)("%s keeps every shadow at Level 3 or lighter", (file) => {
    expect(heavyShadows(source(file))).toEqual([]);
  });
});
