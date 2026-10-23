import type { Metadata } from "next";
import Link from "next/link";
import { API_ORIGIN } from "@/lib/api/upstream";
import inventory from "@/lib/legal/thirdPartyLicences.json";

export const metadata: Metadata = {
  title: "Third-party licences - Nevo",
};

/**
 * Third-party licences - the page the EULA promises (Lydia, 23 Oct), and
 * which did not exist.
 *
 * The list is generated from the lockfile by `scripts/third-party-licences.mjs`,
 * and a unit test fails the build if a dependency changes without it being
 * regenerated, so the page cannot drift from what production installs. The
 * full licence and notice texts are a plain-text file beside it, and the
 * backend publishes its own list (Teslim, e798dc1), linked rather than copied.
 *
 * Laid out like the Privacy and Terms pages (`LegalDoc`), without their draft
 * badge: nothing here is wording waiting on counsel.
 */
type Entry = (typeof inventory.packages)[number];

const NOTICES_HREF = "/legal/third-party-notices.txt";
const BACKEND_HREF = `${API_ORIGIN}/legal/third-party-licenses`;

const linkClass = "cursor-pointer text-nevo-navy underline underline-offset-2";

function byLicence(packages: Entry[]): [string, Entry[]][] {
  const groups = new Map<string, Entry[]>();
  for (const entry of packages) {
    groups.set(entry.licence, [...(groups.get(entry.licence) ?? []), entry]);
  }
  return [...groups].sort(
    ([a, left], [b, right]) => right.length - left.length || a.localeCompare(b),
  );
}

export default function ThirdPartyLicencesPage() {
  return (
    <div className="mx-auto w-full max-w-[720px] px-6 py-12 text-nevo-near-black">
      <Link
        href="/"
        className="inline-flex cursor-pointer items-center gap-[7px] text-sm text-nevo-near-black/60 transition-transform active:scale-[0.99]"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M15 6l-6 6 6 6" />
        </svg>
        Back
      </Link>

      <h1 className="mt-6 text-[34px] leading-[1.15] font-semibold tracking-[-0.02em]">
        Third-party licences
      </h1>
      <p className="mt-3 text-[15px] leading-[1.65] text-nevo-near-black/62">
        The Nevo app is built with open-source software. These are the packages it runs,
        each with the licence it is used under.
      </p>
      <p className="mt-3 text-[15px] leading-[1.65] text-nevo-near-black/62">
        The full licence and notice texts are in{" "}
        <a href={NOTICES_HREF} className={linkClass}>
          one text file
        </a>
        . The software that runs Nevo&apos;s servers has{" "}
        <a href={BACKEND_HREF} className={linkClass}>
          its own list
        </a>
        .
      </p>

      <div className="mt-8 flex flex-col gap-7">
        <section>
          <h2 className="text-[20px] font-semibold tracking-[-0.01em]">Typeface</h2>
          <p className="mt-2.5 text-[15px] leading-[1.7] text-nevo-near-black/72">
            <a href="https://github.com/rsms/inter" className={linkClass}>
              Inter
            </a>
            , by The Inter Project Authors, used under the{" "}
            <a href="https://openfontlicense.org" className={linkClass}>
              SIL Open Font License 1.1
            </a>
            .
          </p>
        </section>

        {byLicence(inventory.packages).map(([licence, entries]) => (
          <section key={licence}>
            <h2 className="text-[20px] font-semibold tracking-[-0.01em]">
              {licence}{" "}
              <span className="text-[15px] font-normal text-nevo-near-black/50">
                ({entries.length})
              </span>
            </h2>
            <ul className="mt-2.5 flex flex-col gap-1 text-[14px] leading-[1.6] text-nevo-near-black/72">
              {entries.map((entry) => (
                <li key={`${entry.name}@${entry.version}`}>
                  <a href={entry.url} className={linkClass}>
                    {entry.name}
                  </a>{" "}
                  <span className="text-nevo-near-black/50 tabular-nums">{entry.version}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
