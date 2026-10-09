/**
 * The vendor catalog: which vendors a codebase can show it sends data to, what each is usually
 * engaged for, a guess at the personal data it receives, its DPA and its own sub-processor list.
 *
 * The canonical copy is agentcheck's (apps/agentcheck/src/app/subprocessors/_data/vendors.json),
 * which the /subprocessors pages are built from; `pnpm --filter subprocessors data` copies it here,
 * and src/catalog.test.ts fails while the two differ. It is bundled: the CLI makes no requests.
 */
import bundledJson from "./data/vendors.json" with { type: "json" };

/** `likely`: usually a sub-processor when the code uses it. `tooling`: usually not (CI, sign-in). */
export type Kind = "likely" | "tooling";

/**
 * What finds a vendor in a repository. Every list is optional.
 *
 * - `npm`: a package name, an import specifier (`next-auth/providers/github`), or a prefix ending
 *   in `/` (`@aws-sdk/`).
 * - `pypi`: a PyPI project name, compared normalised (lower case, `_` and `.` as `-`); a name
 *   ending in `-` is a prefix (`google-cloud-`).
 * - `py`: a Python module, matched on dot boundaries (`google.cloud` matches `google.cloud.storage`).
 * - `go`: a Go module path prefix.
 * - `gem`: a RubyGems name; a name ending in `-` is a prefix.
 * - `env`: an environment variable name, or a prefix ending in `_`. Matched after a framework's
 *   public prefix is removed (`NEXT_PUBLIC_STRIPE_KEY` is `STRIPE_KEY`).
 * - `hosts`: a host, or host and path, as written in a string literal (`hooks.slack.com`).
 * - `files`: an infrastructure file by name at any depth (`vercel.json`), a path suffix
 *   (`supabase/config.toml`), or a directory ending in `/` (`.github/workflows/`).
 * - `terraform`: a Terraform provider's local name (`provider "aws"`).
 */
export interface Matchers {
  npm?: string[];
  pypi?: string[];
  py?: string[];
  go?: string[];
  gem?: string[];
  env?: string[];
  hosts?: string[];
  files?: string[];
  terraform?: string[];
}

/** A narrower use of a vendor, with its own purpose: S3 is storage, SES is email. */
export interface Service extends Matchers {
  purpose: string;
}

export interface Vendor {
  id: string;
  name: string;
  category: string;
  kind: Kind;
  /** What the vendor is usually engaged for. */
  purpose: string;
  /** Overrides the category's data guess. */
  data?: string;
  /** The vendor's data processing agreement, or null when none could be found. */
  dpa: string | null;
  /** The vendor's own sub-processor list, or null when none could be found. */
  list: string | null;
  /** The day both links were fetched and answered. */
  seen: string;
  note?: string;
  match: Matchers;
  services?: Service[];
}

export interface Category {
  label: string;
  /** A guess at the personal data a vendor in this category receives. */
  data: string;
}

export interface Catalog {
  updated: string;
  about: string;
  categories: Record<string, Category>;
  vendors: Vendor[];
}

export const CATALOG = bundledJson as unknown as Catalog;

const ID = /^[a-z0-9][a-z0-9-]*$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MATCHER_KEYS = ["npm", "pypi", "py", "go", "gem", "env", "hosts", "files", "terraform"];

/** Every problem with a catalog, or none. The tests hold the bundled one to it. */
export function catalogProblems(c: Catalog): string[] {
  const out: string[] = [];
  if (!DAY.test(c.updated)) out.push(`updated is not a day: ${c.updated}`);
  const ids = new Set<string>();
  for (const v of c.vendors) {
    const at = `vendor ${v.id}`;
    if (!ID.test(v.id)) out.push(`${at}: id is not lower-case-dashed`);
    if (ids.has(v.id)) out.push(`${at}: duplicate id`);
    ids.add(v.id);
    if (!c.categories[v.category]) out.push(`${at}: unknown category ${v.category}`);
    if (v.kind !== "likely" && v.kind !== "tooling") out.push(`${at}: kind is ${String(v.kind)}`);
    if (!v.name || !v.purpose) out.push(`${at}: name and purpose are required`);
    for (const link of [v.dpa, v.list])
      if (link !== null && !/^https:\/\/[^\s]+$/.test(link)) out.push(`${at}: bad link ${link}`);
    if (!DAY.test(v.seen)) out.push(`${at}: seen is not a day`);
    const sets: Matchers[] = [v.match, ...(v.services ?? [])];
    let any = 0;
    for (const m of sets) {
      for (const k of Object.keys(m))
        if (!MATCHER_KEYS.includes(k) && k !== "purpose") out.push(`${at}: unknown matcher ${k}`);
      for (const k of MATCHER_KEYS) {
        const list = (m as Record<string, unknown>)[k];
        if (list === undefined) continue;
        if (!Array.isArray(list) || list.some((s) => typeof s !== "string" || s.length < 2))
          out.push(`${at}: ${k} must be a list of names`);
        else any += list.length;
      }
    }
    if (any === 0) out.push(`${at}: nothing matches it`);
    for (const s of v.services ?? []) if (!s.purpose) out.push(`${at}: a service has no purpose`);
  }
  return out;
}

export function vendorById(id: string, c: Catalog = CATALOG): Vendor | undefined {
  return c.vendors.find((v) => v.id === id);
}

/** The data guess for a vendor: its own, or its category's. */
export function dataGuess(v: Vendor, c: Catalog = CATALOG): string {
  return v.data ?? c.categories[v.category]?.data ?? "";
}
