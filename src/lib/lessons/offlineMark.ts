import type { LessonQuestionAttemptWrite } from "@/lib/api/lessons";

/**
 * TEST 9B: AN ANSWER MARKED ON THE DEVICE SAYS SO (Lydia, 5 Nov: "offline, the
 * device marks from the package and flags it"; Teslim, 41c2f83, migration
 * 0137).
 *
 * Where no reply can come - no connection, no sitting yet - the screen moves
 * on the lesson package's own key (`verdict.ts`). The answer is held and sent
 * once it can go, and when it does it carries `offlineMarked: true` and the
 * `markingKeyVersion` of the key the device marked it against. The server
 * re-marks it, and refuses one whose key has changed since the lesson was
 * saved (409 `offline_marking_key_changed`).
 *
 * THE VERSION COMES FROM THE OFFLINE PACKAGE ONLY (`markingKeyVersions`, one
 * per question). A lesson opened online carries none, so an answer held from
 * it goes up as a plain answer, which the server marks itself: nothing claims
 * a key the device was never given a version of. The server requires both
 * fields and the answer's `clientAttemptId` together, so it is all three or
 * none.
 */

/** 64 hexadecimal characters: a SHA-256, as `marking_key_version` writes it. */
const VERSION = /^[0-9a-f]{64}$/;

/** Is this a version the server would take, rather than anything else in a package? */
export function isMarkingKeyVersion(value: unknown): value is string {
  return typeof value === "string" && VERSION.test(value);
}

/**
 * The package's key for one answer, exactly as the server builds it
 * (`_offline_package_payload`): `assessment::{question}`,
 * `checkpoint:{segment}:{question}`, and `calculation:{segment}:{problem}` for
 * a step, a mini-step or the solved calculation. Null where the answer has no
 * segment to name.
 */
export function markingKeyFor(
  answer: Pick<LessonQuestionAttemptWrite, "source" | "problemId" | "segmentId">,
): string | null {
  if (answer.source === "assessment") return `assessment::${answer.problemId}`;
  if (!answer.segmentId) return null;
  const kind = answer.source === "calculation" ? "calculation" : "checkpoint";
  return `${kind}:${answer.segmentId}:${answer.problemId}`;
}

/**
 * The held answer, flagged as marked on the device where the package gave a
 * version for it - and unchanged where it did not.
 */
export function asOfflineMarked<
  T extends Pick<
    LessonQuestionAttemptWrite,
    "source" | "problemId" | "segmentId" | "clientAttemptId"
  >,
>(
  answer: T,
  versions: Readonly<Record<string, string>> | undefined,
): T & Pick<LessonQuestionAttemptWrite, "offlineMarked" | "markingKeyVersion"> {
  const key = markingKeyFor(answer);
  const version = key ? versions?.[key] : undefined;
  if (!answer.clientAttemptId || !isMarkingKeyVersion(version)) return answer;
  return { ...answer, offlineMarked: true, markingKeyVersion: version };
}
