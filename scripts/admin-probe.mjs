/**
 * What does a real admin account actually unlock?
 *
 *   NEVO_EMAIL=... NEVO_PASSWORD=... node scripts/admin-probe.mjs
 *
 * Signs in once, then does READ-ONLY GETs across the admin surface and reports
 * the SHAPE of what comes back - field names, types, and the distinct values of
 * enum-ish fields like `status` and `role`.
 *
 * It deliberately does not print names, emails or ids. Those belong to real
 * school staff, and the shape is the thing worth knowing: whether `status` is
 * "active"/"invited" as the UI assumes, what `role` really is, and whether the
 * subscription carries a school name. Pass --raw only if you need actual values
 * and are not going to paste them anywhere.
 */
const BASE = process.env.NEVO_API_URL ?? "https://api.nevolearning.com";
const EMAIL = process.env.NEVO_EMAIL;
const PASSWORD = process.env.NEVO_PASSWORD;
const RAW = process.argv.includes("--raw");

if (!EMAIL || !PASSWORD) {
  console.error("Set NEVO_EMAIL and NEVO_PASSWORD in the environment.");
  process.exit(1);
}

const SENSITIVE = /email|name|token|phone|address|contact/i;

/** Field names and types, with values only for enum-ish, non-identifying keys. */
function shape(value, depth = 0) {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    if (!value.length) return "array[0]";
    return `array[${value.length}] of ${shape(value[0], depth + 1)}`;
  }
  if (typeof value === "object") {
    if (depth > 2) return "object";
    const rows = Object.entries(value).map(([k, v]) => {
      if (!RAW && SENSITIVE.test(k)) {
        return `${k}: ${v === null ? "null" : `<${typeof v}, ${String(v).length} chars>`}`;
      }
      if (typeof v === "string" && v.length < 40) return `${k}: "${v}"`;
      return `${k}: ${shape(v, depth + 1)}`;
    });
    return `{ ${rows.join(", ")} }`;
  }
  return typeof value;
}

/** Distinct values of a field across rows - the point of the whole exercise. */
function distinct(rows, key) {
  return [...new Set(rows.map((r) => JSON.stringify(r?.[key])))].join(", ");
}

async function main() {
  const t0 = Date.now();
  const login = await fetch(`${BASE}/api/v1/auth/login/password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const body = await login.json().catch(() => null);
  console.log(`\n=== SIGN IN (${Date.now() - t0}ms) — ${login.status} ===`);
  if (!login.ok) {
    console.log(JSON.stringify(body));
    console.log("\nStopping here.");
    return;
  }
  console.log("  role     :", JSON.stringify(body.role));
  console.log("  userId   :", body.userId ? "<uuid present>" : "MISSING");
  console.log("  expires  :", body.expiresAt);

  const auth = {
    Authorization: `Bearer ${body.accessToken}`,
    Accept: "application/json",
  };

  const GETS = [
    ["permissions", "/api/v1/permissions/me"],
    ["session", "/api/v1/auth/session"],
    ["admin team", "/api/v1/admin/team"],
    ["sso status", "/api/v1/admin/sso/status"],
    ["sso sync history", "/api/v1/admin/sso/roster-sync-history"],
    ["billing subscription", "/api/billing/subscription"],
    ["billing upcoming", "/api/billing/upcoming"],
    ["billing invoices", "/api/billing/invoices"],
    ["compliance audit", "/api/admin/compliance-audit"],
    ["adaptation log", "/api/admin/adaptation-log"],
    ["my classes", "/api/v1/teachers/me/classes"],
  ];

  console.log("\n=== READS ===");
  const seen = {};
  for (const [label, path] of GETS) {
    try {
      const r = await fetch(BASE + path, { headers: auth });
      const b = await r.json().catch(() => null);
      seen[label] = { status: r.status, body: b };
      console.log(`\n${String(r.status).padEnd(4)} ${label}  ${path}`);
      if (!r.ok) {
        console.log("     ", JSON.stringify(b)?.slice(0, 160));
        continue;
      }
      console.log("     ", shape(b));
    } catch (e) {
      console.log(`ERR  ${label} ${path} -> ${String(e).slice(0, 90)}`);
    }
  }

  // The three answers the admin console is actually built on.
  console.log("\n=== WHAT THE UI ASSUMES ===");

  const scopes = seen["permissions"]?.body?.scopes;
  console.log("  scopes held      :", JSON.stringify(scopes));
  console.log("  navigation       :", JSON.stringify(seen["permissions"]?.body?.navigation));

  const team = seen["admin team"]?.body;
  if (Array.isArray(team)) {
    console.log(`  team rows        : ${team.length}`);
    console.log("  distinct status  :", distinct(team, "status"), "  (UI treats anything but 'active' as Invited)");
    console.log("  distinct role    :", distinct(team, "role"));
    console.log(
      "  null identity    :",
      `firstName ${team.filter((m) => m.firstName === null).length}/${team.length},`,
      `lastName ${team.filter((m) => m.lastName === null).length}/${team.length},`,
      `email ${team.filter((m) => m.email === null).length}/${team.length}`,
    );
    console.log("  scopes per row   :", JSON.stringify(team.map((m) => m.scopes)));
  }

  const sub = seen["billing subscription"]?.body;
  if (sub) {
    console.log(
      "  schoolName       :",
      sub.schoolName ? `present (${String(sub.schoolName).length} chars)` : "MISSING or empty",
      " <- would fix the 'this school' placeholder",
    );
  }

  console.log("\nDone. Token discarded.");
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
