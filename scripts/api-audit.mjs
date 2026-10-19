/**
 * Live audit of the Nevo backend contract, cross-referenced against what this
 * frontend actually calls. Fetches the spec fresh every run, so it cannot go
 * stale the way a checked-in copy would.
 *
 *   node scripts/api-audit.mjs                  # inventory + usage
 *   node scripts/api-audit.mjs --detail mastery # request/response shapes
 *   node scripts/api-audit.mjs --json           # raw spec to stdout
 *
 * The backend ships without notice - 20 endpoints appeared between two runs on
 * 27 Aug 2026 - so check here before assuming something is missing.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE =
  process.env.NEVO_API_URL ?? "https://api.nevolearning.com";
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

const spec = await fetch(`${BASE}/openapi.json`, {
  signal: AbortSignal.timeout(180_000),
}).then((r) => {
  if (!r.ok) throw new Error(`spec fetch failed: ${r.status}`);
  return r.json();
});

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(spec, null, 1));
  process.exit(0);
}

const S = spec.components?.schemas ?? {};

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const f = join(dir, n);
    return statSync(f).isDirectory() ? walk(f) : [f];
  });
}

/**
 * Paths referenced anywhere in the API client layer.
 *
 * Read with fs rather than shelling out to grep: every parameterised call is a
 * BACKTICK template (`/api/v1/lessons/${id}/class-progress`), and the old
 * double-quote-only pattern matched none of them - so every path with an id in
 * it was reported unconsumed no matter how thoroughly it was wired, and the
 * headline count read far lower than the truth.
 */
const used = new Set();
for (const f of walk(join(SRC, "lib", "api"))) {
  if (!/\.tsx?$/.test(f)) continue;
  for (const m of readFileSync(f, "utf8").matchAll(
    /["'`](\/api\/[^"'`\s]*)["'`]/g,
  )) {
    used.add(m[1]);
  }
}
/** `${lessonId}` and `{lesson_id}` both collapse to `{}` so the two sides meet. */
const norm = (p) =>
  p
    .replace(/\$\{[^}]*\}/g, "{}")
    .replace(/\{[^}]+\}/g, "{}")
    .replace(/\/$/, "");
const usedNorm = new Set([...used].map(norm));

const groups = {};
for (const p of Object.keys(spec.paths).sort()) {
  const seg = p.split("/").filter(Boolean);
  const key = seg[0] === "api" ? (seg[1] === "v1" ? seg[2] : seg[1]) : seg[0];
  (groups[key] ??= []).push(p);
}

console.log(`${spec.info?.title} ${spec.info?.version} — ${BASE}`);
let total = 0;
let consumed = 0;
for (const [g, paths] of Object.entries(groups).sort()) {
  console.log(`\n## ${g}`);
  for (const p of paths) {
    for (const m of Object.keys(spec.paths[p])) {
      if (!["get", "post", "put", "patch", "delete"].includes(m)) continue;
      total += 1;
      const hit = usedNorm.has(norm(p));
      if (hit) consumed += 1;
      console.log(`  ${hit ? "[USED]" : "[    ]"} ${m.toUpperCase().padEnd(6)} ${p}`);
    }
  }
}
console.log(`\n${consumed}/${total} operations consumed by the frontend.`);

const at = process.argv.indexOf("--detail");
if (at === -1) process.exit(0);

const needle = process.argv[at + 1] ?? "";
const shape = (sch, ind = 5, seen = new Set()) => {
  if (!sch) return `${" ".repeat(ind)}(none)`;
  if (sch.$ref) {
    const n = sch.$ref.split("/").pop();
    if (seen.has(n)) return `${" ".repeat(ind)}${n} (recursive)`;
    return shape(S[n], ind, new Set([...seen, n]));
  }
  if (sch.enum) return `${" ".repeat(ind)}enum ${JSON.stringify(sch.enum)}`;
  if (sch.type === "array")
    return `${" ".repeat(ind)}array of\n${shape(sch.items, ind + 2, seen)}`;
  const req = new Set(sch.required ?? []);
  const rows = Object.entries(sch.properties ?? {}).map(([k, v]) => {
    let t =
      v.type ??
      v.$ref?.split("/").pop() ??
      (v.anyOf
        ? v.anyOf.map((o) => o.type ?? o.$ref?.split("/").pop()).join("|")
        : "any");
    if (v.type === "array")
      t = `array<${v.items?.type ?? v.items?.$ref?.split("/").pop() ?? "any"}>`;
    return `${" ".repeat(ind)}${req.has(k) ? "*" : " "}${k}: ${t}${v.format ? `(${v.format})` : ""}`;
  });
  return rows.join("\n") || `${" ".repeat(ind)}(no properties)`;
};

console.log(`\n\n=== DETAIL: paths matching "${needle}" ===`);
for (const p of Object.keys(spec.paths).sort()) {
  if (!p.includes(needle)) continue;
  for (const [m, op] of Object.entries(spec.paths[p])) {
    if (!["get", "post", "put", "patch", "delete"].includes(m)) continue;
    console.log(`\n${m.toUpperCase()} ${p}`);
    const params = (op.parameters ?? []).map(
      (x) => `${x.name}(${x.in}${x.required ? ", required" : ""})`,
    );
    if (params.length) console.log("  params:", params.join(", "));
    const rb = op.requestBody?.content?.["application/json"]?.schema;
    if (rb) {
      console.log("  REQUEST:");
      console.log(shape(rb));
    }
    for (const [code, r] of Object.entries(op.responses ?? {})) {
      if (!code.startsWith("2")) continue;
      const sc = r.content?.["application/json"]?.schema;
      console.log(`  RESPONSE ${code}:`);
      console.log(shape(sc));
    }
  }
}
