/**
 * What shape do the untyped endpoints actually return?
 *
 *   NEVO_EMAIL=... NEVO_PASSWORD=... node scripts/shape-probe.mjs
 *
 * 55 of the 77 endpoints added by the 30 Aug backend deploy declare their
 * response as a bare `{"type": "object", "additionalProperties": true}` - the
 * OpenAPI spec names no fields at all. The teacher dashboard, the class list,
 * the student reads and the whole upload pipeline are all in that group, so
 * they cannot be typed from the spec: the only way to learn the contract is to
 * call it and look.
 *
 * Read-only by construction - it refuses to issue anything but GET, so it
 * cannot alter a shared demo account.
 *
 * It prints the SHAPE and not the data: field names, types, array lengths, and
 * the values of short non-identifying strings. Names, emails, tokens and
 * addresses come back as `<string, 14 chars>`, because these are real school
 * staff and children and the field names are the part worth knowing. Output is
 * safe to paste back into a chat or a ticket; `--raw` disables the redaction
 * and should not be.
 *
 * Delete this script once the backend types its responses - at which point
 * `scripts/api-audit.mjs` tells you everything this does.
 */
const BASE = process.env.NEVO_API_URL ?? "https://api.nevolearning.com";
const EMAIL = process.env.NEVO_EMAIL;
const PASSWORD = process.env.NEVO_PASSWORD;
const RAW = process.argv.includes("--raw");

if (!EMAIL || !PASSWORD) {
  console.error(
    "Set NEVO_EMAIL and NEVO_PASSWORD in the environment - not as arguments,\n" +
      "which land in your shell history.",
  );
  process.exit(1);
}

const SENSITIVE = /email|name|token|phone|address|contact|identifier|pin/i;

function shape(value, depth = 0) {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    if (!value.length) return "array[0]";
    return `array[${value.length}] of ${shape(value[0], depth + 1)}`;
  }
  if (typeof value === "object") {
    if (depth > 3) return "object";
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

let token = null;

/** GET only. The guard is the point: this must not mutate a shared account. */
async function get(path) {
  const res = await fetch(`${BASE}${path}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 120);
  }
  return { status: res.status, body };
}

async function report(label, path) {
  const { status, body } = await get(path);
  if (status !== 200) {
    const detail =
      typeof body === "object" && body?.detail ? ` - ${JSON.stringify(body.detail)}` : "";
    console.log(`\n## ${label}\n   ${path}\n   ${status}${detail}`);
    return null;
  }
  console.log(`\n## ${label}\n   ${path}\n   200  ${shape(body)}`);
  return body;
}

async function main() {
  const login = await fetch(`${BASE}/api/v1/auth/login/password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!login.ok) {
    console.error(`Sign-in failed: ${login.status}`);
    process.exit(1);
  }
  const session = await login.json();
  token = session.access_token;
  console.log(`Signed in as role=${session.role} against ${BASE}`);
  if (RAW) console.log("!! --raw: real values below. Do not paste this anywhere.");

  // A class id and a student id, so the by-id reads have something to ask for.
  const classes = await report("Teacher's classes (typed - sanity check)", "/api/v1/teachers/me/classes");
  const classId = Array.isArray(classes) && classes[0]?.class_id;
  const roster = classId
    ? await report("Class roster (typed - confirms the mixed-case fields)", `/api/v1/classes/${classId}/students`)
    : null;
  const studentId = Array.isArray(roster) && roster[0]?.student_id;

  console.log("\n" + "=".repeat(64));
  console.log("UNTYPED ENDPOINTS - the reason this script exists");
  console.log("=".repeat(64));

  await report("Teacher dashboard", "/api/v1/teachers/me/dashboard");
  await report("Intelligence flags", "/api/intelligence/flags");
  await report("Class list", "/api/v1/classes");
  if (classId) await report("Class detail", `/api/v1/classes/${classId}`);
  await report("Student list", "/api/v1/students");
  if (studentId) {
    await report("Student detail", `/api/v1/students/${studentId}`);
    await report("Student profile", `/api/v1/students/${studentId}/profile`);
    await report("Intelligence profile", `/api/intelligence/profile/${studentId}`);
    await report("Recommendations", `/api/intelligence/recommendations/${studentId}`);
  }
  await report("Lesson library (v1 alias)", "/api/v1/lessons");
  await report("Assignments", "/api/v1/assignments");
  await report("Settings", "/api/v1/settings/me");
  await report("Notification preferences", "/api/v1/notification-preferences");
  await report("Unread exists", "/api/v1/notifications/unread-exists");
  await report("School", "/api/v1/school");
  await report("School overview", "/api/v1/school/overview");
  await report("Teachers", "/api/v1/teachers");
  await report("Invitations", "/api/v1/invites");
  await report("Active sessions", "/api/v1/auth/sessions");

  console.log("\nDone. Redacted unless --raw was passed.");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
