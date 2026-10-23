#!/usr/bin/env node
/**
 * The inventory behind /legal/third-party-licences.
 *
 * The EULA promises a page naming the third-party software in Nevo and the
 * licence each is used under (Lydia, 23 Oct). This builds it from the
 * lockfile, so it lists what production installs rather than a hand-kept list
 * that drifts:
 *
 * - `src/lib/legal/thirdPartyLicences.json` - every production package, its
 *   version, licence and project address. The page renders this.
 * - `public/legal/third-party-notices.txt` - the licence and notice files the
 *   packages ship, verbatim, each distinct text printed once.
 *
 * Platform builds of one native package (sharp's libvips, Next's compiler)
 * are listed once as a family: which build installs depends on the machine,
 * and they share a licence.
 *
 *   node scripts/third-party-licences.mjs          write both files
 *   node scripts/third-party-licences.mjs --check  exit 1 if the list is stale
 *
 * The backend publishes its own list (Teslim, e798dc1), which the page links.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIST = "src/lib/legal/thirdPartyLicences.json";
const NOTICES = "public/legal/third-party-notices.txt";

const PLATFORM =
  /-(darwin|linux|linuxmusl|win32|freebsd|openbsd|netbsd|sunos|android|wasm32)(-[a-z0-9]+)*$/;
const NOTICE_FILE = /^(licen[cs]e|copying|notice|third[-_]party[-_]notices)(\.[a-z0-9]+)?$/i;

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

function licenceOf(meta, entry) {
  const licence = meta?.license ?? entry.license;
  if (typeof licence === "string") return licence;
  if (licence?.type) return licence.type;
  if (Array.isArray(meta?.licenses)) {
    return meta.licenses.map((l) => l.type ?? l).join(" OR ");
  }
  return "UNKNOWN";
}

/** The project's own address, or its npm page when it names none. */
function urlOf(meta, name) {
  const npm = `https://www.npmjs.com/package/${name}`;
  const repository =
    typeof meta?.repository === "string" ? meta.repository : meta?.repository?.url;
  let url = meta?.homepage || repository;
  if (!url) return npm;
  url = url
    .replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/^ssh:\/\/git@/, "https://")
    .replace(/^git@([^:/]+):/, "https://$1/")
    .replace(/\.git(#.*)?$/, "")
    .replace(/#readme$/, "");
  if (url.startsWith("github:")) url = `https://github.com/${url.slice(7)}`;
  if (/^[\w.-]+\/[\w.-]+$/.test(url)) url = `https://github.com/${url}`;
  if (!/^https?:\/\//.test(url)) return npm;
  return url.replace(/^http:\/\//, "https://");
}

function noticeTexts(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => NOTICE_FILE.test(file))
    .sort()
    .map((file) => readFileSync(join(dir, file), "utf8").replace(/\r\n/g, "\n").trim())
    .filter(Boolean);
}

/**
 * Every production package in the lockfile, platform builds folded into one.
 *
 * The list must come out the same on every machine, or `--check` fails in CI
 * for a file written on a laptop. Which platform build installs varies, so a
 * family's licence comes from the lockfile and its address is the npm page of
 * its first build by name - never from whichever build happens to be here.
 * Only the notice texts, which are not checked, come from the installed one.
 */
export function collect(root = ROOT) {
  const lock = readJson(join(root, "package-lock.json"));
  const packages = new Map();
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (!path.startsWith("node_modules/") || entry.dev || entry.devOptional) continue;
    const name = path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length);
    const dir = join(root, path);
    if (Boolean(entry.os || entry.cpu) && PLATFORM.test(name)) {
      const listed = `${name.replace(PLATFORM, "")}-*`;
      const key = `${listed}@${entry.version}`;
      const known = packages.get(key);
      const first = known && known.first.localeCompare(name) < 0 ? known.first : name;
      packages.set(key, {
        name: listed,
        version: entry.version,
        licence: entry.license ?? "UNKNOWN",
        url: `https://www.npmjs.com/package/${first}`,
        texts: known?.texts.length ? known.texts : noticeTexts(dir),
        first,
      });
      continue;
    }
    // An optional package may install on one machine and not another, so it
    // is described from the lockfile alone, like a platform build.
    const meta =
      !entry.optional && existsSync(join(dir, "package.json"))
        ? readJson(join(dir, "package.json"))
        : null;
    packages.set(`${name}@${entry.version}`, {
      name,
      version: entry.version,
      licence: licenceOf(meta, entry),
      url: urlOf(meta, name),
      texts: noticeTexts(dir),
    });
  }
  return [...packages.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
  );
}

export function render(packages) {
  const list = {
    generatedBy: "scripts/third-party-licences.mjs, from package-lock.json. Do not edit by hand.",
    packages: packages.map(({ name, version, licence, url }) => ({ name, version, licence, url })),
  };

  const byText = new Map();
  const bare = [];
  for (const p of packages) {
    if (!p.texts.length) {
      bare.push(p);
      continue;
    }
    const text = p.texts.join("\n\n");
    if (!byText.has(text)) byText.set(text, []);
    byText.get(text).push(`${p.name} ${p.version}`);
  }
  const rule = "=".repeat(72);
  const parts = [
    "Third-party software notices for the Nevo web app",
    "",
    "The licence and notice files shipped by the open-source packages the Nevo",
    "web app runs in production, reproduced as each package provides them.",
    "Packages that ship the same text are listed together above it.",
    "",
    "Typeface: Inter, by The Inter Project Authors (https://github.com/rsms/inter),",
    "used under the SIL Open Font License 1.1 (https://openfontlicense.org).",
  ];
  for (const [text, names] of byText) {
    parts.push("", rule, ...names, rule, "", text);
  }
  if (bare.length) {
    parts.push(
      "",
      rule,
      "These packages ship no licence file. Each is used under the licence named:",
      rule,
      "",
      ...bare.map((p) => `${p.name} ${p.version}: ${p.licence}`),
    );
  }
  return { json: `${JSON.stringify(list, null, 2)}\n`, txt: `${parts.join("\n")}\n` };
}

function main() {
  const { json, txt } = render(collect());
  const listPath = join(ROOT, LIST);
  if (process.argv.includes("--check")) {
    const current = existsSync(listPath) ? readFileSync(listPath, "utf8").replace(/\r\n/g, "\n") : "";
    if (current !== json) {
      console.error(`${LIST} is out of date. Run: node scripts/third-party-licences.mjs`);
      process.exit(1);
    }
    console.log(`${LIST} is up to date.`);
    return;
  }
  mkdirSync(dirname(listPath), { recursive: true });
  mkdirSync(dirname(join(ROOT, NOTICES)), { recursive: true });
  writeFileSync(listPath, json);
  writeFileSync(join(ROOT, NOTICES), txt);
  console.log(`Wrote ${LIST} and ${NOTICES}.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
