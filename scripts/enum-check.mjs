/**
 * Fail the build when an enum this client matches on has drifted from the
 * deployed contract.
 *
 *   node scripts/enum-check.mjs                    # exits 1 on any failure
 *   node scripts/enum-check.mjs --warn             # report, always exit 0
 *   node scripts/enum-check.mjs --spec spec.json   # a saved spec, no network
 *   node scripts/enum-check.mjs --root ../other    # check another checkout
 *
 * WHY THIS EXISTS. `contract-check.mjs` compares routes and fields, not the
 * VALUES a field can take. On 4 Nov the server's `UploadStage` had become
 * `receiving_file | reading_document | finding_sections |
 * preparing_adaptations | ready_to_assign`, while this client still matched
 * `lessons | structure | adaptations | complete`. Every value fell through:
 * the single-lesson ladder sat on "Reading the document" for the whole wait,
 * and the unit ladder was replaced by a spinner. Every CI run passed (#1002).
 *
 * WHAT IT CHECKS. Every exported string-literal union in `src/` that names a
 * spec enum - by the same name, or by a `@spec SchemaName` tag on the type -
 * is compared with that enum in the deployed spec:
 *
 *   FAIL  a value the client names that the server does not send. Code that
 *         matches on it is matching on nothing.
 *   NOTE  a value the server sends that the client does not name. Printed,
 *         never failing: a client may deliberately handle a subset, and a
 *         union with `(string & {})` says it takes the rest as they come.
 *
 * A value kept on purpose for an older deployment (the deploy-order rule,
 * Lydia 31 Oct: the client works with both) is listed in a `@legacy` tag on
 * the type, and is reported as legacy rather than failing - so it is removed
 * the day the server has moved on, rather than forgotten.
 *
 *   /**
 *    * `UploadStage` in the spec.
 *    * @legacy lessons structure adaptations complete
 *    *\/
 *
 * Parsed with the TypeScript AST, as the contract and architecture checks
 * are. `typescript` is already a dependency.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import ts from "typescript";

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const BASE = process.env.NEVO_API_URL ?? "https://api.nevolearning.com";
const ROOT = arg("--root") ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const WARN_ONLY = process.argv.includes("--warn");
const SPEC_FILE = arg("--spec");

const spec = SPEC_FILE
  ? JSON.parse(readFileSync(SPEC_FILE, "utf8"))
  : await fetch(`${BASE}/openapi.json`, { signal: AbortSignal.timeout(180_000) }).then((r) => {
      if (!r.ok) throw new Error(`spec fetch failed: ${r.status}`);
      return r.json();
    });

/** Every string enum the spec declares, by schema name. */
const ENUMS = new Map(
  Object.entries(spec.components?.schemas ?? {})
    .filter(([, s]) => Array.isArray(s.enum) && s.enum.every((v) => typeof v === "string"))
    .map(([name, s]) => [name, new Set(s.enum)]),
);

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === "node_modules" || name === "mocks") continue;
      yield* files(path);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.|\.d\.ts$/.test(name)) {
      yield path;
    }
  }
}

/** The JSDoc tags on a node, as `tag -> text`. */
function tagsOf(node) {
  const out = new Map();
  for (const tag of ts.getJSDocTags(node)) {
    const text = typeof tag.comment === "string" ? tag.comment : (tag.comment ?? []).map((c) => c.text).join("");
    out.set(tag.tagName.text, text.trim());
  }
  return out;
}

/** The string literals of a union, and whether it is open (`string & {}`). */
function literalsOf(type) {
  const members = ts.isUnionTypeNode(type) ? type.types : [type];
  const values = [];
  let open = false;
  for (const m of members) {
    if (ts.isLiteralTypeNode(m) && ts.isStringLiteral(m.literal)) values.push(m.literal.text);
    else if (ts.isParenthesizedTypeNode(m) || ts.isIntersectionTypeNode(m) || m.kind === ts.SyntaxKind.StringKeyword) open = true;
    else return null; // not a plain string union
  }
  return values.length > 0 ? { values, open } : null;
}

const failures = [];
const notes = [];
const legacy = [];
let checked = 0;

for (const file of files(SRC)) {
  const text = readFileSync(file, "utf8");
  if (!/export\s+type\s+\w+\s*=/.test(text)) continue;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const where = relative(ROOT, file).replace(/\\/g, "/");
  ts.forEachChild(sf, (node) => {
    if (!ts.isTypeAliasDeclaration(node)) return;
    if (!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) return;
    const union = literalsOf(node.type);
    if (!union) return;
    const tags = tagsOf(node);
    const schema = tags.get("spec") || node.name.text;
    const served = ENUMS.get(schema);
    if (!served) return;
    checked += 1;
    const kept = new Set((tags.get("legacy") ?? "").split(/\s+/).filter(Boolean));
    const name = node.name.text === schema ? schema : `${node.name.text} (spec ${schema})`;
    for (const v of union.values) {
      if (served.has(v)) continue;
      if (kept.has(v)) legacy.push(`${where}  ${name}: "${v}" is kept for an older deployment; the server no longer sends it`);
      else failures.push(`${where}  ${name}: "${v}" is not a value the server sends (it sends ${[...served].map((s) => `"${s}"`).join(", ")})`);
    }
    if (!union.open) {
      const named = new Set(union.values);
      const missing = [...served].filter((v) => !named.has(v));
      if (missing.length > 0) {
        notes.push(`${where}  ${name}: the server also sends ${missing.map((s) => `"${s}"`).join(", ")}`);
      }
    }
  });
}

console.log(`Checked ${checked} client enum type(s) against the deployed spec.`);
if (legacy.length > 0) {
  console.log(`\n## Kept for an older deployment (${legacy.length})`);
  for (const l of legacy) console.log(`   ${l}`);
}
if (notes.length > 0) {
  console.log(`\n## Values the server sends that the client does not name - not failing (${notes.length})`);
  for (const n of notes) console.log(`   ${n}`);
}
if (failures.length > 0) {
  console.log(`\n## Values the client matches that the server does not send (${failures.length})`);
  for (const f of failures) console.log(`   ${f}`);
} else {
  console.log("\nNo enum drift.");
}
process.exit(failures.length > 0 && !WARN_ONLY ? 1 : 0);
