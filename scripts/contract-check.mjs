/**
 * Fail the build when this client and the deployed contract disagree.
 *
 *   node scripts/contract-check.mjs           # exits 1 on any finding
 *   node scripts/contract-check.mjs --warn    # report, always exit 0
 *
 * A GATE, not a report - `api-audit.mjs` is the report and exits 0 by design.
 *
 * WHY THIS EXISTS. `client.ts` ends in `return (await response.json()) as T`.
 * That is a cast, not a validation, so every hand-written interface in
 * `lib/api` is an assertion the compiler will never check and "TypeScript
 * catches contract drift" is false here by construction. The spec is the only
 * thing that knows the truth, it is published, and it now types 154 of 182
 * operations - so the drift is machine-detectable and simply was not being
 * detected.
 *
 * Two real defects motivate the two checks, and both shipped to users:
 *
 *   REQUEST  the TOSSE form posted `school_name` and `student_count` to an
 *            endpoint whose contract is camelCase, so every booth submission
 *            422'd. A key-level diff finds that in milliseconds.
 *   RESPONSE `POST /join/{token}/accept` returns `loginIdentifier`, and the
 *            client invented its own from the child's name instead - the
 *            server never recognised it, and the child could not sign in.
 *            Nothing on the client could have caught that: the only evidence
 *            was a field in the spec that no client type read.
 *
 * Parsing is done with the TypeScript AST rather than a regex window. The
 * regex version flagged seven call sites and most were false positives, which
 * is how a gate teaches people to ignore it. `typescript` is already a
 * dependency, so this adds nothing to package.json - which matters, because
 * three sessions share this lockfile.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import ts from "typescript";

const BASE = process.env.NEVO_API_URL ?? "https://api.nevolearning.com";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API_DIR = join(ROOT, "src", "lib", "api");
const WARN_ONLY = process.argv.includes("--warn");

const spec = await fetch(`${BASE}/openapi.json`, {
  signal: AbortSignal.timeout(180_000),
}).then((r) => {
  if (!r.ok) throw new Error(`spec fetch failed: ${r.status}`);
  return r.json();
});

const SCHEMAS = spec.components?.schemas ?? {};
const findings = [];
const note = (kind, where, message) => findings.push({ kind, where, message });

/** Follow a $ref to the schema it names. */
function deref(schema, seen = new Set()) {
  if (!schema) return null;
  if (!schema.$ref) return schema;
  const name = schema.$ref.split("/").pop();
  if (seen.has(name)) return null;
  return deref(SCHEMAS[name], new Set([...seen, name]));
}

/**
 * Property names a schema offers, following the anyOf/allOf a nullable field
 * is expressed with. Returns null - meaningfully different from an empty set -
 * when the schema names no properties at all, so a caller can tell "no fields"
 * from "not describable".
 */
function propertiesOf(schema, seen = new Set()) {
  const s = deref(schema, seen);
  if (!s) return null;
  if (s.properties) return s.properties;
  for (const branch of s.allOf ?? s.anyOf ?? s.oneOf ?? []) {
    const found = propertiesOf(branch, seen);
    if (found) return found;
  }
  return null;
}

/** Every operation in the spec, flattened and keyed by normalised path. */
const OPS = [];
/** Every `api.<verb><T>(path)` call, for the response-shape check below. */
const RESPONSE_SITES = [];
for (const [path, methods] of Object.entries(spec.paths ?? {})) {
  for (const [method, op] of Object.entries(methods)) {
    if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
    OPS.push({ path, method, op });
  }
}

/**
 * The client's method names, mapped to HTTP verbs.
 *
 * THIS USED TO BE `["post", "put", "patch"]`, and only inside the body check -
 * so the path of a READ was never compared to the spec at all. 81 of the 159
 * call sites in this layer are `api.get`, and `api.del` was not in the list
 * under any name, so more than half the client could name an endpoint that does
 * not exist and this gate would report "No contract violations".
 *
 * It was not hypothetical: `GET /api/billing/receiving-account` shipped as a
 * provisional path, the endpoint landed under a different name, and the gate
 * that exists to catch exactly that stayed green.
 */
const VERB = { get: "get", blob: "get", post: "post", put: "put", patch: "patch", del: "delete" };

/** Verbs that carry a JSON body, and therefore have a body to check. */
const BODY_VERBS = new Set(["post", "put", "patch"]);

/** `${lessonId}` and `{lesson_id}` both collapse so the two sides can meet. */
const norm = (p) =>
  p
    .replace(/\$\{[^}]*\}/g, "{}")
    .replace(/\{[^}]+\}/g, "{}")
    .replace(/\/+$/, "");

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const f = join(dir, n);
    return statSync(f).isDirectory() ? walk(f) : [f];
  });
}

/*
 * Tests are NOT part of the client layer.
 *
 * They were being walked with it, which cost both checks. Check 1 read fixture
 * paths in `client.dom.test.ts` as though they were production call sites, and
 * check 2 counted a field named only in a test as a field the client "reads" -
 * so a response field no screen consumes went unreported the moment a test
 * mentioned it.
 */
const FILES = walk(API_DIR).filter(
  (f) => /\.tsx?$/.test(f) && !/\.(test|spec)\.tsx?$/.test(f),
);

/* ------------------------------------------------------------------ *
 * CHECK 1 - request bodies                                            *
 *                                                                     *
 * Find every api.post/put/patch(path, payload) and compare the keys of *
 * the payload object literal against the operation's requestBody.      *
 * ------------------------------------------------------------------ */

/** The literal text of a path argument, whether quoted or a template. */
function pathText(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isTemplateExpression(node)) {
    return (
      node.head.text +
      node.templateSpans.map((s) => "${}" + s.literal.text).join("")
    );
  }
  return null;
}

/**
 * Keys of an object literal, and whether the shape is fully knowable.
 *
 * A spread (`...payload`) means the real keys are decided elsewhere, so the
 * object is reported as UNKNOWABLE rather than as the subset that is visible.
 * Guessing there is how a gate produces false positives and gets ignored.
 */
function literalKeys(node) {
  if (!node || !ts.isObjectLiteralExpression(node)) return null;
  const keys = [];
  for (const prop of node.properties) {
    if (ts.isSpreadAssignment(prop)) return null;
    const name = prop.name;
    if (!name) return null;
    if (ts.isIdentifier(name) || ts.isStringLiteral(name)) keys.push(name.text);
    else return null;
  }
  return keys;
}

for (const file of FILES) {
  const text = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const where = (node) => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    return `${relative(ROOT, file).replace(/\\/g, "/")}:${line + 1}`;
  };

  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "api"
    ) {
      const method = VERB[node.expression.name.text];
      if (method) {
        const hasBody = BODY_VERBS.has(method);
        const raw = pathText(node.arguments[0]);
        /*
         * A call carrying `baseUrl` targets one of OUR OWN Next route
         * handlers, not the backend - the same-origin proxy the marketing
         * and TOSSE forms post through because the backend serves no CORS
         * headers. Those paths are ours to name and are correctly absent
         * from the backend spec, so checking them against it reports a
         * defect that is not one. This was the gate's first false positive
         * and it is exactly the kind that gets a gate switched off.
         */
        const opts = node.arguments[hasBody ? 2 : 1];
        const sameOrigin = (opts &&
          ts.isObjectLiteralExpression(opts) &&
          opts.properties.some(
            (pr) => pr.name && pr.name.getText(sf).replace(/["']/g, "") === "baseUrl",
          )) || false;
        if (raw && raw.startsWith("/api/") && !sameOrigin) {
          if (node.typeArguments?.length === 1) {
            RESPONSE_SITES.push({
              path: raw,
              method,
              typeText: node.typeArguments[0].getText(sf),
              where: where(node),
            });
          }
          const target = norm(raw);
          const match = OPS.find(
            (o) => norm(o.path) === target && o.method === method,
          );
          if (!match) {
            /*
             * A path that exists under a DIFFERENT verb is a different bug from
             * a path that does not exist, and it has a different fix. Saying
             * which one it is turns a finding into an instruction.
             */
            const otherVerbs = OPS.filter((o) => norm(o.path) === target).map(
              (o) => o.method.toUpperCase(),
            );
            note(
              "unknown-path",
              where(node),
              otherVerbs.length
                ? `${method.toUpperCase()} ${raw} is not in the deployed spec - that path exists, but only as ${otherVerbs.join(", ")}`
                : `${method.toUpperCase()} ${raw} is not in the deployed spec`,
            );
          } else if (hasBody) {
            const body = match.op.requestBody?.content?.["application/json"]?.schema;
            const props = propertiesOf(body);
            const keys = literalKeys(node.arguments[1]);
            if (props && keys) {
              const allowed = new Set(Object.keys(props));
              const required = new Set(
                (deref(body)?.required ?? []).filter((r) => allowed.has(r)),
              );
              for (const k of keys) {
                if (!allowed.has(k)) {
                  note(
                    "unknown-field",
                    where(node),
                    `${method.toUpperCase()} ${match.path} has no field "${k}" — accepts: ${[...allowed].join(", ")}`,
                  );
                }
              }
              for (const r of required) {
                if (!keys.includes(r)) {
                  note(
                    "missing-required",
                    where(node),
                    `${method.toUpperCase()} ${match.path} requires "${r}", not sent`,
                  );
                }
              }
              // Enum literals: a string sent where the spec names a closed set.
              const obj = node.arguments[1];
              for (const prop of obj.properties) {
                if (!ts.isPropertyAssignment(prop)) continue;
                const key = prop.name.getText(sf).replace(/["']/g, "");
                const schema = deref(props[key]);
                const values = schema?.enum;
                if (!values) continue;
                const init = prop.initializer;
                if (!ts.isStringLiteral(init)) continue;
                if (!values.includes(init.text)) {
                  note(
                    "bad-enum",
                    where(prop),
                    `${match.path} field "${key}" = "${init.text}" is not one of ${JSON.stringify(values)}`,
                  );
                }
              }
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

/* ------------------------------------------------------------------ *
 * CHECK 2 - response fields the client never reads                     *
 *                                                                      *
 * This is the check that would have caught the invented login           *
 * identifier: the server was already returning the right answer and     *
 * nothing on the client named it. A field the spec declares and the     *
 * whole client layer never mentions is either dead weight on the wire   *
 * or - the expensive case - something we are recomputing badly.         *
 * ------------------------------------------------------------------ */

const clientText = FILES.map((f) => readFileSync(f, "utf8")).join("\n");
/** Identifiers named anywhere in the API layer, however they are used. */
const named = new Set(clientText.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? []);

/** Paths the client actually calls, so unconsumed endpoints stay quiet. */
const called = new Set();
for (const file of FILES) {
  for (const m of readFileSync(file, "utf8").matchAll(/["'`](\/api\/[^"'`\s]*)["'`]/g)) {
    called.add(norm(m[1]));
  }
}

/** Fields too generic to be evidence of anything. */
const UNREMARKABLE = new Set([
  "id", "status", "type", "name", "title", "url", "message", "detail",
  "count", "total", "data", "items", "results", "value", "label", "code",
]);

const unread = [];
for (const { path, method, op } of OPS) {
  if (!called.has(norm(path))) continue;
  for (const [code, res] of Object.entries(op.responses ?? {})) {
    if (!code.startsWith("2")) continue;
    let schema = res.content?.["application/json"]?.schema;
    const arr = deref(schema);
    if (arr?.type === "array") schema = arr.items;
    const props = propertiesOf(schema);
    if (!props) continue;
    for (const field of Object.keys(props)) {
      if (UNREMARKABLE.has(field)) continue;
      if (!named.has(field)) {
        unread.push(`${method.toUpperCase()} ${path} → "${field}"`);
      }
    }
  }
}


/* ------------------------------------------------------------------ *
 * CHECK 3 - response SHAPES                                           *
 *                                                                     *
 * The check that would have caught the billing break in seconds, and   *
 * the reason it exists.                                                *
 *                                                                     *
 * `GET /api/billing/subscription` answers `SubscriptionResponse`,      *
 * which nests everything a cost sheet needs under `pricing`. The       *
 * client's `Subscription` declared `activeStudentCount`,               *
 * `perStudentAnnualRate` and `currency` at the TOP LEVEL - names the   *
 * spec has never had there. Every one of them read `undefined` at      *
 * runtime, `computeCost` returned null, and EVERY school was told      *
 * "your per-student rate isn't set yet" on the screen whose whole job  *
 * is to say what they pay.                                             *
 *                                                                     *
 * Nothing caught it. `client.ts` ends in `as T`, which is an assertion  *
 * the compiler never checks; check 1 compares PATHS and REQUEST bodies  *
 * and never looks at a response; check 2 only asks whether a spec field *
 * is named ANYWHERE in the client layer, so `currency` on the wrong     *
 * interface satisfies it. 333 unit tests were green, because the        *
 * fixtures were hand-written in the same wrong shape as the type.       *
 *                                                                     *
 * So this compares the client's declared response interface against     *
 * the operation's response schema, property by property.               *
 *                                                                     *
 * IT GATES ON ONE THING ONLY: a property the client DECLARES that the   *
 * response does not have. That is drift with no innocent reading - the  *
 * field is `undefined` at runtime and the code believes otherwise.      *
 * The converse (a response field the interface omits) is NOT an error:  *
 * a screen is entitled to read a subset, and check 2 already reports    *
 * the fields nothing reads at all. Being strict there would produce the *
 * false positives this file's header warns get a gate switched off.     *
 * ------------------------------------------------------------------ */

/** Every interface in the API layer, by name, with its declared members. */
const INTERFACES = new Map();
for (const file of FILES) {
  const sf = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  sf.forEachChild((node) => {
    if (!ts.isInterfaceDeclaration(node)) return;
    const props = [];
    for (const m of node.members) {
      if (!ts.isPropertySignature(m) || !m.name) continue;
      props.push({
        name: m.name.getText(sf).replace(/["']/g, ""),
        optional: Boolean(m.questionToken),
        line: sf.getLineAndCharacterOfPosition(m.getStart(sf)).line + 1,
      });
    }
    INTERFACES.set(node.name.text, {
      props,
      file: relative(ROOT, file).replace(/\\/g, "/"),
      // An interface that extends another inherits members we have not
      // resolved, so its absent-field list is unreliable. Only the
      // declares-what-the-spec-lacks direction is used, which is unaffected.
      extends: node.heritageClauses ? true : false,
    });
  });
}

/**
 * The interface a type argument resolves to, or null when the answer is not
 * knowable. Unwraps `X[]`, `Array<X>` and `Partial<X>`; everything else -
 * unions, intersections, inline object literals, `void`, primitives, generics
 * we do not model - returns null and is skipped rather than guessed at.
 */
function resolveType(text) {
  if (!text) return null;
  let t = text.trim();
  let array = false;
  const partial = /^Partial<(.+)>$/.exec(t);
  if (partial) t = partial[1].trim();
  const arr = /^Array<(.+)>$/.exec(t);
  if (arr) {
    t = arr[1].trim();
    array = true;
  }
  if (t.endsWith("[]")) {
    t = t.slice(0, -2).trim();
    array = true;
  }
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(t)) return null;
  const iface = INTERFACES.get(t);
  return iface ? { name: t, iface, array } : null;
}

/**
 * The 2xx JSON schema an operation answers with, unwrapped through arrays.
 *
 * ANY 2xx, not just 200/201. `POST /admin/sso/roster-sync` answers **202** -
 * it queues a run - and hard-coding the common two skipped it silently, which
 * is the same shape of miss the check exists to prevent.
 */
function responseSchema(op) {
  const codes = Object.keys(op.responses ?? {})
    .filter((c) => /^2\d\d$/.test(c))
    .sort();
  for (const code of codes) {
    const res = op.responses?.[code];
    const schema = res?.content?.["application/json"]?.schema;
    if (!schema) continue;
    const d = deref(schema);
    if (d?.type === "array" && d.items) return { schema: d.items, array: true };
    return { schema, array: false };
  }
  return null;
}

for (const { path, method, typeText, where: siteWhere } of RESPONSE_SITES) {
  const target = resolveType(typeText);
  if (!target) continue;

  const match = OPS.find(
    (o) => norm(o.path) === norm(path) && o.method === method,
  );
  if (!match) continue; // check 1 owns unknown paths

  const res = responseSchema(match.op);
  if (!res) continue;
  const props = propertiesOf(res.schema);
  if (!props) continue; // untyped `object`, or a union we cannot flatten

  const allowed = new Set(Object.keys(props));
  const declared = target.iface.props.filter((p) => !allowed.has(p.name));
  if (declared.length === 0) continue;

  /*
   * A type whose EVERY property is unknown to the schema is usually a
   * different shape entirely rather than drift in one field - a mapped
   * response, or a type reused across two endpoints. Report it as one finding
   * naming the type, instead of one per property, so the message stays
   * readable and the fix is obvious.
   */
  const everyPropUnknown =
    declared.length === target.iface.props.length && target.iface.props.length > 0;

  note(
    "response-shape",
    `${target.iface.file}:${declared[0].line}`,
    everyPropUnknown
      ? `${target.name} shares no property with ${method.toUpperCase()} ${match.path} — the response has ${[...allowed].slice(0, 6).join(", ")}${allowed.size > 6 ? ", …" : ""}. Read at ${siteWhere}.`
      : `${target.name} declares ${declared.map((d) => `"${d.name}"`).join(", ")}, which ${method.toUpperCase()} ${match.path} does not return — it has ${[...allowed].join(", ")}. Read at ${siteWhere}.`,
  );
}

/* ------------------------------------------------------------------ *
 * Report                                                              *
 * ------------------------------------------------------------------ */

console.log(`${spec.info?.title} ${spec.info?.version} — ${BASE}`);
console.log(`${OPS.length} operations, ${called.size} paths called by the client.\n`);

const byKind = {};
for (const f of findings) (byKind[f.kind] ??= []).push(f);

const TITLES = {
  "unknown-path": "Calls a path the spec does not have",
  "unknown-field": "Sends a field the endpoint does not accept",
  "missing-required": "Omits a field the endpoint requires",
  "bad-enum": "Sends a value outside the spec's enum",
  "response-shape": "Reads a field the response does not return",
};

for (const [kind, list] of Object.entries(byKind)) {
  console.log(`## ${TITLES[kind] ?? kind}  (${list.length})`);
  for (const f of list) console.log(`   ${f.where}\n     ${f.message}`);
  console.log();
}

if (unread.length) {
  console.log(`## Declared by the spec, named nowhere in the client  (${unread.length})`);
  console.log("   Advisory. A field here is either dead weight on the wire, or");
  console.log("   something the client is recomputing for itself - which is how");
  console.log("   a child once got a login identifier the server never knew.\n");
  for (const u of unread.slice(0, 40)) console.log(`   ${u}`);
  if (unread.length > 40) console.log(`   … and ${unread.length - 40} more`);
  console.log();
}

if (findings.length === 0) {
  console.log("No contract violations.");
}

// Only the request-side checks gate. The unread-field list is advisory: a
// backend may legitimately return more than any one screen needs, and failing
// on that would train people to pass `--warn` permanently.
process.exit(findings.length > 0 && !WARN_ONLY ? 1 : 0);
