/**
 * Fail the build when the code stops being what the architecture describes.
 *
 *   node scripts/architecture-check.mjs           # exits 1 on any finding
 *   node scripts/architecture-check.mjs --warn    # report, always exit 0
 *
 * A GATE for the rules in `docs/architecture/` that are mechanically checkable.
 * It is a safety net under correct construction, not a substitute for it - most
 * of the ten rules (adaptation felt not seen, absence is an instruction) cannot
 * be checked by a parser and are enforced by reading the document.
 *
 * WHY THIS EXISTS. The shared architecture names the failure mode exactly: "one
 * developer making one reasonable local decision", and "none of that is visible
 * from the code". A stored modality "looks like a small enum". Prose in a doc
 * nobody re-reads does not survive three sessions and a deadline, so the rules
 * that CAN be checked are checked here, on every commit.
 *
 * Two live breaches motivated it, both found the day the v3.0 docs landed:
 *
 *   CLOCK     `useSignals` stamped every interaction event with
 *             `new Date().toISOString()`. Frontend section 2 requires
 *             `performance.now()` because clock skew across devices corrupts
 *             every latency measurement, and latency is the primary signal for
 *             three of the four affective states. There is no way for the
 *             engine to recover precision the client did not send.
 *   CONTRACT  `GET /api/session/state/:student_id`, the single endpoint the
 *             whole frontend document is built on, had zero references in
 *             `src/lib/api`. Not checkable here, but it is why nobody should
 *             trust that reading the document once is enough.
 *
 * Parsing uses the TypeScript AST rather than a regex window, for the reason
 * `contract-check.mjs` gives: the regex version of that gate flagged seven call
 * sites, most were false positives, and that is how a gate teaches people to
 * ignore it. `typescript` is already a dependency, so package.json gains no
 * entry - which matters, because three sessions share this lockfile.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import ts from "typescript";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const WARN_ONLY = process.argv.includes("--warn");

const findings = [];
const add = (kind, file, node, sf, message) => {
  const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  findings.push({ kind, where: `${file}:${line + 1}`, message });
};

/** Every .ts/.tsx under src. Tests included for the Zero-Tag rules: a test
 *  asserting a banned shape still puts that shape in front of a reviewer as
 *  though it were correct. Copy rules skip tests, where fixture prose is fine. */
const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(entry)) files.push(p);
  }
})(SRC);

// ---------------------------------------------------------------- rule 1
// No learner types, modality categories, or learning styles. Anywhere.
// Segment-level modality SWITCHING is correct and expected - the frontend
// document names `ModalitySuggestionPill` itself. What is banned is a modality
// carried BY A CHILD, which is why this matches names, not the word.
const BANNED_NAMES =
  /^(learner_?types?|learning_?styles?|preferred_?modality|modality_?preference|dominant_?modality|student_?modality|child_?modality|visual_?learner|auditory_?learner|kinaesthetic_?learner|kinesthetic_?learner)$/i;

// ---------------------------------------------------------------- rule 2
// A modality property hanging off a person-shaped type is the same bug wearing
// a plainer name. Scoped to the API layer, where a stored field would enter.
const PERSON_TYPE = /(student|child|learner|pupil|profile|baseline|onboarding)/i;
const MODALITY_PROP = /^(modality|modalities)$/i;

// ---------------------------------------------------------------- rule 3
// performance.now(), never Date.now() - for anything timed and sent up.
//
// THREE BLIND SPOTS, closed 1 Oct after an audit found the rule passing every
// timing breach in the lesson player. It needed (1) a file whose PATH said
// "signal", and the player, the solver and the check sheets say no such thing;
// (2) the exact bare name - `duration`, never `durationMs` or
// `responseTimeMs`, which is how every payload here spells it; and (3) the
// wall clock inside the initializer itself, so `const t0 = Date.now()` ...
// `durationMs: performance.now() - t0` sailed through.
//
// So a file is a signal file by what it DOES as well as what it is called,
// a time name may carry its unit, and a name the file set from the wall clock
// counts as the wall clock.
const SIGNAL_FILE = /(signal|telemetry|tracking|interaction|adaptation)/i;
const SIGNAL_CONTENT =
  /\b(trackEvent|useSignals|TrackEvent|signalsApi|useRuntimeAdaptation|onStepAnswered|onAnswered|scaffoldAttemptFor)\b/;
const TIME_PROP =
  /^(timestamp|ts|occurred_?at|emitted_?at|started_?at|ended_?at|dwell|latency|duration|elapsed|response_?time|continuous)(_?(ms|millis|seconds|secs|minutes|mins))?$/i;
/** A wall-clock reading. `new Date(x)` from a value is not one. */
const WALL_CLOCK = /Date\.now\(|new Date\(\s*\)/;

/**
 * Does this expression read the wall clock itself - not inside a callback it
 * merely builds? `useCallback(() => Date.now())` makes a function, not a time.
 */
function readsWallClock(node) {
  let found = false;
  const visit = (n) => {
    if (found || ts.isFunctionLike(n)) return;
    if (
      (ts.isCallExpression(n) &&
        ts.isPropertyAccessExpression(n.expression) &&
        n.expression.expression.getText() === "Date" &&
        n.expression.name.text === "now") ||
      (ts.isNewExpression(n) &&
        n.expression.getText() === "Date" &&
        (n.arguments?.length ?? 0) === 0)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

// ---------------------------------------------------------------- rules 4, 5
// Never a score, grade or percentage shown to a child. No reward mechanics.
const CHILD_FACING = /[\\/]components[\\/]student[\\/]/;
// `out of \d+` is deliberately NOT here: it catches "1 out of 4 slices", which
// is a fraction being taught, not a mark being reported.
const SCORE_COPY =
  /\b(your score|score of|you scored|grade of|percentile|percent correct|marks out of|\d+\s*%\s*(correct|right))\b/i;
const REWARD =
  /\b(confetti|streak|trophy|leaderboard|badge earned|points earned|you win)\b/i;

// ---------------------------------------------------------------- rule 3
// "Compute no scores, parameters, or thresholds." Frontend section 6 spells out
// what that forbids: "Never compute a threshold. Not from row counts, not from
// dates, not from array lengths, not from how much data looks like enough."
//
// WHY THIS RULE EXISTS. The gate checked pronouns and wall-clock use and not
// this, and the console decided an engine-owned threshold FOUR times: the count
// interpolation, the stored modality, the insights "still gathering" state, and
// the settled-week conflation. The third shipped, and it tells a class having a
// genuinely good week that we do not have enough data about it.
//
// Two patterns only, both chosen because they are near-unambiguous. Design
// offered to accept false positives; these should produce very few, which is
// worth more than breadth on a gate people have to trust.
//
//   1. An array length compared to a numeric literal. This is the insights bug
//      exactly: `misconceptions.length === 0 && mastery.length === 0` deciding
//      whether the engine has "enough".
//   2. Wall-clock arithmetic compared to a numeric literal - a duration
//      threshold, which is the "not from dates" clause.
//
// THE CLASSIFIER RULE IS NOW IN (design, 17 Sep). It was reserved here
// pending their call, on the grounds that it would flag `band()` in
// useTeacherHome - which it does, and which is why the allowlist below carries
// `band` with its reason written out. Design's framing: it is the
// highest-signal rule available, because the mastery percentages and the
// Demonstrated / Developing tiers are the same error in two registers.
//
// Arithmetic on server numbers reaching render is STILL OUT, and deliberately.
// Design asked for a dry run before it is built; the numbers are in the PR
// that brought this rule in.
//
// Scoped to the surfaces where a threshold becomes a CLAIM about a person.
// `lib/` is exempt: a pure helper handed a threshold by the engine is fine, and
// the decision is made where it is rendered.
//
// ADMIN WAS MISSING until 30 Sep, and it makes claims about children too -
// learner profiles, support flags, cohort analytics. Reports shipped a
// three-period "enough for a trend" count and a 0.15 "reading is the barrier"
// line through the gap. (Neither would have matched the patterns below as
// written - a named constant, a gap - which is why they were fixed by hand;
// the scope is widened so the next one that does match is caught.)
const DECIDES = /[\/](hooks|components[\/](student|teacher|parent|admin))[\/]/;

/**
 * A SUFFICIENCY VERDICT, computed here.
 *
 * The broad version of this rule - any `.length` compared to a number inside a
 * hook or component - produced 159 findings, almost all of them ordinary list
 * handling: `parts.length >= 2` splitting a name into first and last,
 * `queue.current.length === 0` checking whether a batch is empty. It caught the
 * real bug and buried it, and a gate that cries wolf is a gate people stop
 * reading. Breadth is worth less here than being believed.
 *
 * So this matches the SHAPE of the defect instead: a row count or a bare number
 * deciding whether the engine has enough to say something, stored under a name
 * that says so. That is what `useClassInsights` did -
 * `empty: !loading && failures < 3 && misconceptions.length === 0 && ...` - and
 * it is the difference between counting rows (fine) and ruling on sufficiency
 * (the engine's job).
 *
 * It will miss a threshold given an innocuous name. That is accepted: this rule
 * is a net under correct construction, not a substitute for it.
 */
const SUFFICIENCY =
  /^(empty|isEmpty|sparse|gathering|enough|hasEnough|insufficient|hasData|noData|settled|thin|quiet)$/i;
// `ready` was in this list and is deliberately out. Every match was a form
// submit guard - `note.trim().length > 0 && !busy` - which decides whether a
// button is enabled, not whether the engine has enough to say something. Five
// findings, none of them this rule's business.

function sufficiencyVerdict(node, src) {
  let name = null;
  let init = null;
  if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
    name = node.name.text;
    init = node.initializer;
  } else if (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    node.initializer
  ) {
    name = node.name.text;
    init = node.initializer;
  }
  if (!name || !init || !SUFFICIENCY.test(name)) return false;
  const text = init.getText(src);
  // A row count, or a bare numeric comparison, inside the verdict.
  return /\.length\s*(===|!==|==|!=|>=|<=|>|<)\s*\d/.test(text) ||
    /\d\s*(===|!==|==|!=|>=|<=|>|<)\s*\w+\.length/.test(text) ||
    /\w+\s*(>=|<=|>|<)\s*\d/.test(text);
}

/**
 * A NAMED cutoff. The rule matched only a numeric literal, so the client's
 * break timer - `Date.now() - started >= BREAK_TIME_THRESHOLD_MS`, which
 * offered children breaks the engine had not decided - passed it. A constant
 * is the usual way a threshold is written, not a way round the rule.
 */
const NAMED_CUTOFF = /^[A-Z][A-Z0-9_]*$/;

function isCutoff(n) {
  if (ts.isNumericLiteral(n)) return true;
  if (ts.isIdentifier(n)) return NAMED_CUTOFF.test(n.text);
  if (ts.isPropertyAccessExpression(n)) return NAMED_CUTOFF.test(n.name.text);
  return false;
}

/**
 * Elapsed time compared to a cutoff: `Date.now() - x`, a `new Date()`
 * difference or - since a local idle timer is the same breach on a better
 * clock (frontend 5b, "no local timer") - `performance.now() - x`.
 * Returns the cutoff's text, or null.
 */
function clockVsNumber(node, src) {
  if (!ts.isBinaryExpression(node)) return null;
  const rel = new Set([
    ts.SyntaxKind.GreaterThanToken,
    ts.SyntaxKind.GreaterThanEqualsToken,
    ts.SyntaxKind.LessThanToken,
    ts.SyntaxKind.LessThanEqualsToken,
  ]);
  if (!rel.has(node.operatorToken.kind)) return null;
  const cutoff = isCutoff(node.right) ? node.right : isCutoff(node.left) ? node.left : null;
  if (!cutoff) return null;
  const other = cutoff === node.right ? node.left : node.right;
  return /Date\.now\(\)|new Date\(|performance\.now\(\)/.test(other.getText(src))
    ? cutoff.getText(src)
    : null;
}

/**
 * Duration cutoffs that are not about a child, each with its reason - the
 * same two terms as the lists below: every entry says why, and an entry that
 * stops matching is reported stale.
 */
const CLOCK_ALLOWED = new Map([
  [
    "src/hooks/useStagedUpload.ts:SLOW_AFTER_MS",
    "A teacher's upload still parsing after 30s turns on a note about the UPLOAD - that it is taking a while - and decides nothing about a child or anything the engine owns. Permanent: there is no engine threshold to wait for.",
  ],
]);
const clockHits = new Set();

// ---------------------------------------------------------------- rule 6
// Never a gendered pronoun in generated copy. No pronoun is stored for any
// child and there is no field that could make it right.
const PRONOUN = /\b(he|him|his|she|her|hers|himself|herself)\b/i;
const COPY_DIR = /[\\/]components[\\/](student|teacher|parent)[\\/]/;
// Authored assessment and lesson items are exempt. Their narrative characters
// are people in a story, not the child reading it, and the shared architecture
// positively REQUIRES West African names and settings in reading material
// because standard Western texts depress scores through cultural reference.
const AUTHORED_ITEMS = /[\\/](Profiling|Lesson)[\\/].*(Module|Item|Content)\.tsx$/;

// -------------------------------------------------- rule 3, classifier
/**
 * A NUMBER BECOMING A WORD ABOUT A PERSON.
 *
 * The shape: a function that takes a number, tests it against a cutoff, and
 * returns a word. `MasteryDualTrack` did exactly this until 17 Sep -
 * understanding 30 and reading 70 returned "Concept support needed", from
 * cutoffs no contract states - and it rendered on two live surfaces against
 * real children's data. A tier is a number wearing a label, and a named tier
 * is arguably worse than the number, because it reads as a verdict on the
 * child rather than a measurement.
 *
 * DETECTED, not guessed: a function-like node that (a) contains a comparison
 * against a numeric literal or a cutoff-named property, and (b) returns a
 * string or template on some path - or returns a call to a function in the
 * same file that does. The second pass is what catches `band()`, whose own
 * return is `bandLabel(i)`.
 *
 * SCOPED to hooks and the three human-facing component trees, like the
 * sufficiency rule. `lib/` is exempt for the same reason: a pure helper handed
 * a band by the engine is fine, and the decision is made where it renders.
 */
const CUTOFF_PROPS = new Set(["min", "max", "threshold", "cutoff", "floor"]);

/**
 * WHAT THE NUMBER IS ABOUT decides whether the word is a verdict, and this
 * list is where the rule earns its keep.
 *
 * The unnarrowed version produced 18 findings and two of them were real. The
 * other sixteen were a clock turning minutes into "just now", a pluraliser
 * turning 1 into "lesson", a viewport width turning 640 into "mobile", and
 * lesson counts turning 0 into "Needs review". Design's own test for this rule
 * was whether its allowlist would need an entry for every progress bar in the
 * product - sixteen entries for clocks and plurals is that failure, and a gate
 * nobody believes is worse than no gate.
 *
 * So a comparison is ignored when the thing being compared is a duration, a
 * screen size, or a count of rows. What is left is a number about how a person
 * is doing, which is the only kind that can become a verdict about them.
 *
 * KNOWN MISS, stated rather than papered over: a classifier that returns an
 * OBJECT escapes this rule. `strength()` in SetPasswordForm does exactly that
 * - `{ level, label: level <= 1 ? "Weak" : ... }` - and it is not flagged. It
 * is also not about a child, so the miss costs nothing today. A net under
 * correct construction, not a substitute for it.
 */
const NOT_ABOUT_A_PERSON = [
  "min", // minutes, not the cutoff property - see below
  "minute",
  "hour",
  "day",
  "week",
  "month",
  "year",
  "second",
  "sec",
  "ms",
  "elapsed",
  "duration",
  "stamp",
  "date",
  "age",
  "width",
  "height",
  "viewport",
  "count",
  "length",
  "size",
  "total",
  "index",
  // An HTTP status is a number about a REQUEST. `err.status === 0` mapping to
  // "we could not reach the server" is the one shape in this codebase that
  // looks most like a classifier and is least like a judgement about anyone.
  "status",
  "code",
];

/** Is this operand a duration, a size or a row count rather than a metric? */
function notAboutAPerson(text) {
  const t = text.toLowerCase();
  // `b.min` is a band boundary, not minutes. The property form is the cutoff.
  if (t.endsWith(".min") || t.endsWith(".max")) return false;
  // Single letters: the pluraliser's `n`, loop indices, and the viewport
  // width and height in `useSignals`. A metric never arrives under one letter
  // except in the mastery fixtures, where `u` and `r` are left IN on purpose -
  // those two are exactly the numbers the deleted mastery classifier read.
  if (["n", "i", "w", "h", "x", "y"].includes(t)) return true;
  return NOT_ABOUT_A_PERSON.some((w) => t.includes(w));
}
const REL_OPS = new Set([
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
]);

/**
 * ALLOWED, EACH WITH ITS REASON. Two rules about this list, both from design:
 * every entry states why, and the entry is the reminder to remove it. An entry
 * that stops matching anything is reported as stale rather than left to rot -
 * which is how `band` leaves this list the day backend serves the cutoffs.
 *
 * IT IS ALSO THE DETECTOR'S CANARY, which is worth knowing before anyone
 * "tidies" it. The rule currently finds nothing else, so a refactor that
 * quietly broke the detection would look exactly like a clean run - except
 * that `band` would be reported STALE, because nothing matched it. That one
 * line is the difference between a working gate and a decorative one. Verified
 * the other way too: reinstating the deleted `AUTO_FLAG` and adding a
 * `Demonstrated / Developing / Misconception` tier function both flag.
 */
/**
 * THE SUFFICIENCY RULE HAS ONE TOO, on the same two terms: every entry states
 * why, and the entry is the reminder to remove it.
 *
 * `empty` is in the detector's name set because the real defect wore exactly
 * that name - `useClassInsights` decided a class had told Nevo too little from
 * `misconceptions.length === 0 && mastery.length === 0 && flags.length === 0`.
 * Taking the NAME out of the set would have missed it. The discriminator is
 * not the word or the operator, it is WHAT IS BEING COUNTED: three engine
 * readings about a child, versus one list of notifications.
 *
 * That is not something this script can tell apart, and a rule that cannot
 * should say so out loud rather than be quietly loosened until it matches
 * nothing. Hence an entry, printed on every run.
 */
const SUFFICIENCY_ALLOWED = new Map([
  [
    "src/components/teacher/Shell/NotificationsPanel.tsx:empty",
    "`empty = notes.length === 0` is ABSENCE, which rule 5 requires this console to detect and render - \"render the nothing-state, do not fill the gap\". Frontend section 6 is about deciding whether there is enough evidence ABOUT A CHILD; a panel with no notifications in it is not a judgement about anyone. Remove this entry the day `notes` carries anything the engine measured.",
  ],
]);
const sufficiencyHits = new Set();

const CLASSIFIER_ALLOWED = new Map([
  [
    "src/hooks/useTeacherHome.ts:band",
    "Accepted for launch (design, 17 Sep) pending backend serving the cutoffs. The labels are generated FROM the thresholds - \"Above 75%\", not \"Strong\" - so they cannot state an opinion the number does not support. Remove this entry when the engine sends the bands.",
  ],
  // The two below arrived when admin came into scope (30 Sep). Neither is a
  // label about a person, and neither has a cutoff the engine could own.
  [
    "src/components/admin/Overview/notActive.ts:studentsSub",
    "`classes > 0` chooses between \"340 students across 12 classes\" and \"340 students added\" - whether a count exists to mention (rule 5, absence), about a school's uploaded file, not a verdict about any child. Permanent: there is no engine threshold to wait for.",
  ],
  [
    "src/components/admin/Settings/academicCalendar.ts:unresolvedLine",
    "`rows === 1` is English grammar - \"1 term needs\" vs \"2 terms need\" - about the school's own calendar settings. Permanent: pluralisation is not a cutoff.",
  ],
]);
const allowlistHits = new Set();

/** The name a function-like node is known by, or null. */
function functionName(node, sf) {
  if (ts.isFunctionDeclaration(node) && node.name) return node.name.text;
  if (ts.isMethodDeclaration(node) && node.name) return node.name.getText(sf);
  const p = node.parent;
  if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
  if (p && ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) return p.name.text;
  return null;
}

/** Does this expression produce a word on some path? */
function producesWord(n) {
  if (!n) return false;
  if (
    ts.isStringLiteral(n) ||
    ts.isNoSubstitutionTemplateLiteral(n) ||
    ts.isTemplateExpression(n)
  )
    return true;
  if (ts.isConditionalExpression(n))
    return producesWord(n.whenTrue) || producesWord(n.whenFalse);
  if (ts.isBinaryExpression(n)) return producesWord(n.left) || producesWord(n.right);
  if (ts.isParenthesizedExpression(n)) return producesWord(n.expression);
  return false;
}

/** A tailwind class list is not a label about a person. */
function looksLikeStyling(text) {
  return (
    text.includes("-") &&
    (text.includes("[") ||
      text.includes("/") ||
      /^(flex|grid|bg|text|border|rounded|w|h|mt|px|py|gap|absolute|relative|hidden)[-\s]/.test(
        text,
      ))
  );
}

/** The comparison that makes a function a classifier ABOUT A PERSON, or null. */
function cutoffTest(fn, sf) {
  let found = null;
  const visit = (n) => {
    if (found) return;
    if (ts.isBinaryExpression(n) && REL_OPS.has(n.operatorToken.kind)) {
      const sides = [n.left, n.right];
      const cutoff = sides.some(
        (side) =>
          ts.isNumericLiteral(side) ||
          (ts.isPropertyAccessExpression(side) && CUTOFF_PROPS.has(side.name.text)),
      );
      // Both halves have to be about a person. A duration compared to a
      // literal is a clock; a metric compared to one is a verdict.
      const aboutAPerson = sides.every((side) => !notAboutAPerson(side.getText(sf)));
      if (cutoff && aboutAPerson) found = n;
    }
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(fn, visit);
  return found;
}

/** Every word this function can return, and whom it calls on the way. */
function wordReturns(fn, sf) {
  const words = [];
  const calls = new Set();
  const visit = (n) => {
    if (n !== fn && ts.isFunctionLike(n)) return; // a nested closure is its own
    if (ts.isReturnStatement(n) && n.expression) {
      if (producesWord(n.expression)) {
        const text = n.expression.getText(sf);
        if (!looksLikeStyling(text)) words.push({ node: n, text });
      }
      if (ts.isCallExpression(n.expression) && ts.isIdentifier(n.expression.expression))
        calls.add(n.expression.expression.text);
    }
    // An arrow with an expression body returns it.
    if (n === fn && ts.isArrowFunction(n) && n.body && !ts.isBlock(n.body)) {
      if (producesWord(n.body)) {
        const text = n.body.getText(sf);
        if (!looksLikeStyling(text)) words.push({ node: n, text });
      }
      if (ts.isCallExpression(n.body) && ts.isIdentifier(n.body.expression))
        calls.add(n.body.expression.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(fn);
  return { words, calls };
}

for (const abs of files) {
  const file = relative(ROOT, abs).replace(/\\/g, "/");
  const sf = ts.createSourceFile(
    abs,
    readFileSync(abs, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const isTest = /\.(test|spec)\.tsx?$/.test(file);
  const signalFile = SIGNAL_FILE.test(file) || SIGNAL_CONTENT.test(sf.text);

  // Names this file sets from the wall clock - `const t0 = Date.now()`,
  // `startedAt.current = Date.now()` - so a duration built from one later
  // is caught even when the clock call is lines away.
  const wallNames = new Set();
  (function collect(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      readsWallClock(node.initializer)
    )
      wallNames.add(node.name.text);
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      readsWallClock(node.right)
    ) {
      const target = node.left.getText(sf).replace(/\.current$/, "");
      if (/^[A-Za-z_$][\w$]*$/.test(target)) wallNames.add(target);
    }
    ts.forEachChild(node, collect);
  })(sf);
  const usesWallName = (text) =>
    [...wallNames].some((n) => new RegExp(`\\b${n}\\b`).test(text));

  const visit = (node) => {
    // rule 1 - banned names, anywhere, including tests
    if (
      (ts.isIdentifier(node) || ts.isStringLiteral(node)) &&
      BANNED_NAMES.test(node.text)
    ) {
      add(
        "zero-tag",
        file,
        node,
        sf,
        `\`${node.text}\` is a learner type. Shared doc section 1: no child is ever assigned one.`,
      );
    }

    // rule 2 - modality property on a person-shaped type, in the API layer
    if (
      file.startsWith("src/lib/api/") &&
      ts.isPropertySignature(node) &&
      node.name &&
      MODALITY_PROP.test(node.name.getText(sf))
    ) {
      let p = node.parent;
      while (p && !ts.isInterfaceDeclaration(p) && !ts.isTypeAliasDeclaration(p))
        p = p.parent;
      const owner = p?.name?.getText(sf) ?? "";
      if (PERSON_TYPE.test(owner)) {
        add(
          "zero-tag",
          file,
          node,
          sf,
          `\`${owner}.${node.name.getText(sf)}\` gives a child a modality. Segment-level switching is fine; a child carrying one is not.`,
        );
      }
    }

    // rule 3 - wall clock on a value the engine measures from
    if (ts.isPropertyAssignment(node)) {
      const name = node.name.getText(sf).replace(/['"]/g, "");
      const init = node.initializer.getText(sf);
      if (
        TIME_PROP.test(name) &&
        (WALL_CLOCK.test(init) || usesWallName(init)) &&
        signalFile &&
        !isTest // a fixture timestamp is not a measurement
      ) {
        add(
          "clock",
          file,
          node,
          sf,
          `\`${name}\` uses the wall clock. Frontend section 2: performance.now(), or clock skew corrupts every latency measurement.`,
        );
      }
    }

    // rule 3 - thresholds. Expression-level, not string-level: the breach is a
    // comparison, and by the time it reaches copy the decision is already made.
    if (!isTest && DECIDES.test(file)) {
      if (sufficiencyVerdict(node, sf)) {
        const key = `${file}:${node.name.getText(sf)}`;
        if (SUFFICIENCY_ALLOWED.has(key)) sufficiencyHits.add(key);
        else
        add(
          "threshold",
          file,
          node,
          sf,
          `Sufficiency decided here, not by the engine: \`${node.getText(sf).slice(0, 90)}\``,
        );
      }
      const cutoff = clockVsNumber(node, sf);
      const clockKey = `${file}:${cutoff}`;
      if (cutoff && CLOCK_ALLOWED.has(clockKey)) clockHits.add(clockKey);
      else if (cutoff)
        add(
          "threshold",
          file,
          node,
          sf,
          `Duration threshold derived here: \`${node.getText(sf).slice(0, 70)}\``,
        );
    }

    // rules 4, 5, 6 - copy. String literals only: an identifier named `score`
    // is a local decision, a sentence on screen is what a child reads.
    if (
      (ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node)) &&
      !isTest
    ) {
      const s = node.text;
      const words = s.trim().split(/\s+/).length;
      if (CHILD_FACING.test(file) && SCORE_COPY.test(s))
        add("child-score", file, node, sf, `Copy shows a child a result: "${s.slice(0, 60)}"`);
      if (CHILD_FACING.test(file) && REWARD.test(s))
        add("reward", file, node, sf, `Reward mechanic in child-facing copy: "${s.slice(0, 60)}"`);
      if (COPY_DIR.test(file) && !AUTHORED_ITEMS.test(file) && words >= 3 && PRONOUN.test(s))
        add("pronoun", file, node, sf, `Gendered pronoun in copy: "${s.slice(0, 60)}"`);
    }

    ts.forEachChild(node, visit);
  };
  visit(sf);

  // rule 3, classifier - collected per file so the caller pass can see the
  // word-producers it calls.
  if (!isTest && DECIDES.test(file)) {
    const fns = [];
    const collect = (node) => {
      if (ts.isFunctionLike(node)) {
        const name = functionName(node, sf);
        const test = cutoffTest(node, sf);
        const { words, calls } = wordReturns(node, sf);
        fns.push({ node, name, test, words, calls });
      }
      ts.forEachChild(node, collect);
    };
    collect(sf);

    const wordProducers = new Set(
      fns.filter((f) => f.name && f.words.length > 0).map((f) => f.name),
    );
    for (const f of fns) {
      if (!f.test) continue;
      const direct = f.words[0];
      const viaCall = [...f.calls].find((c) => wordProducers.has(c));
      if (!direct && !viaCall) continue;
      const key = `${file}:${f.name ?? "(anonymous)"}`;
      if (CLASSIFIER_ALLOWED.has(key)) {
        allowlistHits.add(key);
        continue;
      }
      const what = direct
        ? `returns ${direct.text.slice(0, 48)}`
        : `returns ${viaCall}(), which writes the words`;
      add(
        "classifier",
        file,
        f.test,
        sf,
        `${f.name ?? "This function"} turns a number into a label: \`${f.test.getText(sf).slice(0, 44)}\` and ${what}. The engine owns the cutoffs and the word.`,
      );
    }
  }
}

const TITLES = {
  "zero-tag": "Zero-Tag breach - a child is being categorised",
  clock: "Wall clock on a signal the engine measures latency from",
  "child-score": "A result shown to a child",
  reward: "Reward mechanics",
  pronoun: "Gendered pronoun in generated copy",
  threshold:
    "Threshold derived in the console - the engine owns this (frontend section 6)",
  classifier:
    "A number turned into a label about a person - the engine owns the cutoff and the word",
};

const byKind = {};
for (const f of findings) (byKind[f.kind] ??= []).push(f);

for (const [kind, list] of Object.entries(byKind)) {
  console.log(`## ${TITLES[kind] ?? kind}  (${list.length})`);
  for (const f of list) console.log(`   ${f.where}\n     ${f.message}`);
  console.log();
}

// The allowlist is printed, never silent: an exception nobody sees is an
// exception nobody removes. A stale entry is reported the same way, because
// the entry is what reminds us the acceptance had a condition on it.
if (CLOCK_ALLOWED.size > 0) {
  console.log(`## Duration cutoffs allowed, with their reasons  (${CLOCK_ALLOWED.size})`);
  for (const [key, why] of CLOCK_ALLOWED) {
    const stale = clockHits.has(key) ? "" : "  [STALE - matched nothing, delete it]";
    console.log(`   ${key}${stale}
     ${why}`);
  }
  console.log("");
}
if (SUFFICIENCY_ALLOWED.size > 0) {
  console.log(`## Sufficiency cases allowed, with their reasons  (${SUFFICIENCY_ALLOWED.size})`);
  for (const [key, why] of SUFFICIENCY_ALLOWED) {
    const stale = sufficiencyHits.has(key) ? "" : "  [STALE - matched nothing]";
    console.log(`   ${key}${stale}
     ${why}`);
  }
  console.log("");
}
if (CLASSIFIER_ALLOWED.size > 0) {
  console.log(`## Classifier cases allowed, with their reasons  (${CLASSIFIER_ALLOWED.size})`);
  for (const [key, why] of CLASSIFIER_ALLOWED) {
    const stale = allowlistHits.has(key) ? "" : "  [STALE - matched nothing, delete it]";
    console.log(`   ${key}${stale}
     ${why}`);
  }
  console.log();
}

if (findings.length === 0) console.log("No architecture violations.");

process.exit(findings.length > 0 && !WARN_ONLY ? 1 : 0);
