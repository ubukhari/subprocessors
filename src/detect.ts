/**
 * The detectors: from the files a walk read, every place the code shows it uses a catalog vendor,
 * as file, line, kind and what was seen. Each one reads names only: package names, import
 * specifiers, API hosts, env variable names (never values), infrastructure file names, Terraform
 * providers, and the regions those files set.
 */
import { CATALOG, type Catalog, type Matchers, type Vendor } from "./catalog.js";
import { isExampleEnv, type RepoFile } from "./walk.js";

/**
 * `host` is an API host inside a URL (`https://api.resend.com/emails`): a call. `mention` is the
 * same host as a bare string (`"api.openai.com"` in a list of hosts): named, not shown to be called.
 */
export type EvidenceKind =
  "dependency" | "dev-dependency" | "import" | "host" | "mention" | "env" | "config" | "terraform";

export interface Evidence {
  file: string;
  line: number;
  kind: EvidenceKind;
  /** What was seen there: a package, an import, a host, an env variable name, a file. */
  what: string;
}

export interface Hit {
  vendor: string;
  /** A service's own purpose, when the hit came from a service matcher. */
  purpose?: string;
  evidence: Evidence;
}

export interface RegionHint {
  vendor: string;
  region: string;
  file: string;
  line: number;
}

export interface Detection {
  hits: Hit[];
  regions: RegionHint[];
}

interface Target {
  vendor: Vendor;
  purpose?: string;
}

type MatchKey = keyof Matchers;

/** Lookup tables for one catalog, built once. */
export class Index {
  private readonly exact = new Map<string, Target[]>();
  private readonly prefix: { key: MatchKey; value: string; target: Target }[] = [];
  readonly hostPattern: RegExp | null;
  private readonly hostTargets = new Map<string, Target[]>();
  readonly files: { pattern: string; target: Target }[] = [];

  constructor(readonly catalog: Catalog = CATALOG) {
    const hosts: string[] = [];
    for (const vendor of catalog.vendors) {
      const sets: [Matchers, string | undefined][] = [
        [vendor.match, undefined],
        ...(vendor.services ?? []).map((s): [Matchers, string] => [s, s.purpose]),
      ];
      for (const [m, purpose] of sets) {
        const target: Target = { vendor, purpose };
        for (const key of ["npm", "pypi", "py", "go", "gem", "env", "terraform"] as const) {
          for (const raw of m[key] ?? []) {
            const value = key === "pypi" ? normPypi(raw) : raw;
            if (isPrefix(key, value)) this.prefix.push({ key, value, target });
            else push(this.exact, `${key}:${value}`, target);
          }
        }
        for (const h of m.hosts ?? []) {
          hosts.push(h);
          push(this.hostTargets, h, target);
        }
        for (const f of m.files ?? []) this.files.push({ pattern: f, target });
      }
    }
    hosts.sort((a, b) => b.length - a.length);
    this.hostPattern = hosts.length
      ? new RegExp(`(?<![\\w.-])(${hosts.map(escape).join("|")})(?!\\.?[\\w-])`, "g")
      : null;
  }

  /** Every target a name of this kind hits; a service's hit replaces its vendor's plain one. */
  lookup(key: MatchKey, name: string): Target[] {
    const value = key === "pypi" ? normPypi(name) : name;
    const found = [...(this.exact.get(`${key}:${value}`) ?? [])];
    for (const p of this.prefix) {
      if (p.key !== key) continue;
      if (prefixHit(key, p.value, value)) found.push(p.target);
    }
    return preferServices(found);
  }

  hostTargetsOf(host: string): Target[] {
    return this.hostTargets.get(host) ?? [];
  }
}

function push<K, V>(map: Map<K, V[]>, k: K, v: V) {
  const list = map.get(k);
  if (list) list.push(v);
  else map.set(k, [v]);
}

function isPrefix(key: MatchKey, value: string): boolean {
  if (key === "npm") return value.endsWith("/");
  if (key === "env") return value.endsWith("_");
  if (key === "pypi" || key === "gem") return value.endsWith("-");
  return key === "py" || key === "go";
}

function prefixHit(key: MatchKey, p: string, value: string): boolean {
  if (key === "py") return value === p || value.startsWith(`${p}.`);
  if (key === "go") return value === p || value.startsWith(`${p}/`);
  return value.startsWith(p) && value.length > p.length;
}

function preferServices(found: Target[]): Target[] {
  const withService = new Set(found.filter((t) => t.purpose).map((t) => t.vendor.id));
  const seen = new Set<string>();
  return found.filter((t) => {
    if (!t.purpose && withService.has(t.vendor.id)) return false;
    const k = `${t.vendor.id}\0${t.purpose ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

export function normPypi(name: string): string {
  return name.toLowerCase().replace(/[_.]+/g, "-");
}

/** A framework's public prefix, removed before an env name is matched. */
const PUBLIC_PREFIX =
  /^(?:NEXT_PUBLIC_|VITE_|PUBLIC_|REACT_APP_|EXPO_PUBLIC_|NUXT_PUBLIC_|GATSBY_)/;

export function envKey(name: string): string {
  return name.replace(PUBLIC_PREFIX, "");
}

/** The package an import specifier names: `@scope/pkg/sub` → `@scope/pkg`, `pkg/sub` → `pkg`. */
export function packageOf(spec: string): string {
  const parts = spec.split("/");
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
}

const JS_FILE = /\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/;
const JS_IMPORTS = [
  /\bfrom\s*["']([^"'\s]+)["']/g,
  /\bimport\s*["']([^"'\s]+)["']/g,
  /\brequire\(\s*["']([^"'\s]+)["']\s*\)/g,
  /\bimport\(\s*["']([^"'\s]+)["']\s*\)/g,
];
const ENV_REFS = [
  /process\.env\.([A-Z][A-Z0-9_]*)/g,
  /process\.env\[\s*["'`]([A-Z][A-Z0-9_]*)["'`]\s*\]/g,
  /import\.meta\.env\.([A-Z][A-Z0-9_]*)/g,
  /(?<![\w.])env\.([A-Z][A-Z0-9_]{2,})\b/g,
  /os\.environ(?:\.get)?\(\s*["']([A-Z][A-Z0-9_]*)["']/g,
  /os\.environ\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]/g,
  /os\.getenv\(\s*["']([A-Z][A-Z0-9_]*)["']/g,
  /os\.Getenv\(\s*"([A-Z][A-Z0-9_]*)"/g,
  /Deno\.env\.get\(\s*["']([A-Z][A-Z0-9_]*)["']/g,
  /\bENV(?:\.fetch\(|\[)\s*["']([A-Z][A-Z0-9_]*)["']/g,
];
const COMMENT = /^\s*(?:\/\/|\/\*|\*|#)/;
const DEP_FIELDS = [
  ["dependencies", "dependency"],
  ["peerDependencies", "dependency"],
  ["optionalDependencies", "dependency"],
  ["devDependencies", "dev-dependency"],
] as const;

/** Vercel's region codes (vercel.com/docs/regions), as the region column shows them. */
export const VERCEL_REGIONS: Record<string, string> = {
  arn1: "Stockholm",
  bom1: "Mumbai",
  cdg1: "Paris",
  cle1: "Cleveland",
  cpt1: "Cape Town",
  dub1: "Dublin",
  fra1: "Frankfurt",
  gru1: "São Paulo",
  hkg1: "Hong Kong",
  hnd1: "Tokyo",
  iad1: "Washington, D.C.",
  icn1: "Seoul",
  kix1: "Osaka",
  lhr1: "London",
  pdx1: "Portland",
  sfo1: "San Francisco",
  sin1: "Singapore",
  syd1: "Sydney",
};

/** Serverless Framework provider names → catalog vendors. */
const SERVERLESS_PROVIDERS: Record<string, string> = {
  aws: "aws",
  google: "google-cloud",
  azure: "azure",
};

class Collector {
  readonly hits: Hit[] = [];
  readonly regions: RegionHint[] = [];
  private readonly seen = new Set<string>();

  add(targets: Target[], evidence: Evidence) {
    for (const t of targets) {
      const key = `${t.vendor.id}\0${evidence.file}\0${evidence.line}\0${evidence.what}`;
      if (this.seen.has(key)) continue;
      this.seen.add(key);
      this.hits.push({ vendor: t.vendor.id, purpose: t.purpose, evidence });
    }
  }

  region(vendor: string, region: string, file: string, line: number) {
    this.regions.push({ vendor, region, file, line });
  }
}

/** The 1-based line of the first match of `re` in `text`, or 1. */
function lineOf(text: string, re: RegExp): number {
  const m = re.exec(text);
  return m ? text.slice(0, m.index).split("\n").length : 1;
}

export function detect(files: readonly RepoFile[], index: Index = new Index()): Detection {
  const c = new Collector();
  for (const f of files) {
    const name = f.path.slice(f.path.lastIndexOf("/") + 1);
    fileMatches(f, index, c);
    if (name === "package.json") packageJson(f, index, c);
    else if (/^requirements[\w.-]*\.txt$/.test(name)) requirements(f, index, c);
    else if (name === "pyproject.toml") pyproject(f, index, c);
    else if (name === "go.mod") goMod(f, index, c);
    else if (name === "Gemfile") gemfile(f, index, c);
    else if (isExampleEnv(name)) envExample(f, index, c);
    else if (name === "vercel.json") vercelJson(f, index, c);
    else if (/^wrangler\.(?:toml|jsonc?)$/.test(name)) wrangler(f, index, c);
    else if (name === "fly.toml")
      simpleRegion(f, "fly", /^\s*primary_region\s*=\s*["']([\w-]+)["']/m, c);
    else if (name === "render.yaml") simpleRegion(f, "render", /^\s*region:\s*["']?([\w-]+)/m, c);
    else if (/^serverless\.ya?ml$/.test(name)) serverless(f, index, c);
    else if (name.endsWith(".tf")) terraform(f, index, c);
    else if (/^Dockerfile(?:\.[\w-]+)?$/.test(name) || name.endsWith(".Dockerfile"))
      dockerfile(f, index, c);
    else if (f.path.startsWith(".github/workflows/") || f.path.includes("/.github/workflows/"))
      workflow(f, index, c);
    else if (/\.(?:[cm]?[jt]sx?|py|go|rb|vue|svelte|astro)$/.test(name)) code(f, index, c);
  }
  return { hits: c.hits, regions: c.regions };
}

function fileMatches(f: RepoFile, index: Index, c: Collector) {
  for (const { pattern, target } of index.files) {
    // a directory pattern ends in `/`; a name or path suffix matches at any depth
    const dir = pattern.endsWith("/");
    const hit = dir
      ? f.path.startsWith(pattern) || f.path.includes(`/${pattern}`)
      : f.path === pattern || f.path.endsWith(`/${pattern}`);
    if (hit) {
      const what = dir ? pattern.replace(/\/$/, "") : pattern;
      // a directory has no line: 0, which the renderers leave out
      c.add([target], {
        file: dir ? dirOf(f.path, pattern) : f.path,
        line: dir ? 0 : 1,
        kind: "config",
        what,
      });
    }
  }
}

/** For a directory pattern, the directory itself: `.github/workflows`. */
function dirOf(file: string, pattern: string): string {
  const at = file.startsWith(pattern) ? 0 : file.indexOf(`/${pattern}`) + 1;
  return file.slice(0, at + pattern.length - 1);
}

function packageJson(f: RepoFile, index: Index, c: Collector) {
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(f.text) as Record<string, unknown>;
  } catch {
    return;
  }
  for (const [field, kind] of DEP_FIELDS) {
    const deps = pkg[field];
    if (!deps || typeof deps !== "object") continue;
    for (const dep of Object.keys(deps)) {
      const targets = index.lookup("npm", dep);
      if (!targets.length) continue;
      c.add(targets, {
        file: f.path,
        line: lineOf(f.text, new RegExp(`"${escape(dep)}"\\s*:`)),
        kind,
        what: dep,
      });
    }
  }
}

function requirements(f: RepoFile, index: Index, c: Collector) {
  f.text.split("\n").forEach((l, i) => {
    const m = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(l.replace(/#.*/, ""));
    if (!m || l.trim().startsWith("-")) return;
    const targets = index.lookup("pypi", m[1]!);
    if (targets.length)
      c.add(targets, { file: f.path, line: i + 1, kind: "dependency", what: m[1]! });
  });
}

function pyproject(f: RepoFile, index: Index, c: Collector) {
  let section = "";
  let inDeps = false;
  f.text.split("\n").forEach((l, i) => {
    const header = /^\s*\[{1,2}([^\]]+)\]{1,2}\s*$/.exec(l);
    if (header) {
      section = header[1]!.trim();
      inDeps = false;
      return;
    }
    const names: string[] = [];
    if (/^tool\.poetry(?:\.group\.[^.]+)?\.(?:dev-)?dependencies$/.test(section)) {
      const m = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*=/.exec(l);
      if (m && m[1] !== "python") names.push(m[1]!);
    } else {
      const arrayStart = /^\s*(?:dependencies|requires)\s*=\s*\[/.test(l);
      const anyArray =
        section === "project.optional-dependencies" || section === "dependency-groups";
      if (section === "project" && arrayStart) inDeps = true;
      if (inDeps || anyArray)
        for (const m of l.matchAll(/["']([A-Za-z0-9][A-Za-z0-9._-]*)/g)) names.push(m[1]!);
      if (inDeps && l.includes("]")) inDeps = false;
    }
    for (const n of names) {
      const targets = index.lookup("pypi", n);
      if (targets.length)
        c.add(targets, { file: f.path, line: i + 1, kind: "dependency", what: n });
    }
  });
}

function goMod(f: RepoFile, index: Index, c: Collector) {
  f.text.split("\n").forEach((l, i) => {
    const m = /^\s*(?:require\s+)?([a-z0-9.-]+\.[a-z]{2,}\/\S+)\s+v\d/.exec(l);
    if (!m) return;
    const targets = index.lookup("go", m[1]!);
    if (targets.length)
      c.add(targets, { file: f.path, line: i + 1, kind: "dependency", what: m[1]! });
  });
}

function gemfile(f: RepoFile, index: Index, c: Collector) {
  f.text.split("\n").forEach((l, i) => {
    const m = /^\s*gem\s+["']([^"']+)["']/.exec(l);
    if (!m) return;
    const targets = index.lookup("gem", m[1]!);
    if (targets.length)
      c.add(targets, { file: f.path, line: i + 1, kind: "dependency", what: m[1]! });
  });
}

function env(name: string, index: Index): Target[] {
  return index.lookup("env", envKey(name));
}

function addEnv(f: RepoFile, i: number, name: string, index: Index, c: Collector) {
  const targets = env(name, index);
  if (targets.length) c.add(targets, { file: f.path, line: i + 1, kind: "env", what: name });
}

/** An example env file, already reduced to `NAME=` lines by the walk. */
function envExample(f: RepoFile, index: Index, c: Collector) {
  f.text.split("\n").forEach((l, i) => {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(l);
    if (m) addEnv(f, i, m[1]!, index, c);
  });
}

function vercelJson(f: RepoFile, index: Index, c: Collector) {
  let cfg: { regions?: unknown; env?: unknown; build?: { env?: unknown } };
  try {
    cfg = JSON.parse(f.text) as typeof cfg;
  } catch {
    return;
  }
  if (Array.isArray(cfg.regions)) {
    const line = lineOf(f.text, /"regions"\s*:/);
    for (const r of cfg.regions)
      if (typeof r === "string") {
        const city = VERCEL_REGIONS[r];
        c.region("vercel", city ? `${r} (${city})` : r, f.path, line);
      }
  }
  for (const block of [cfg.env, cfg.build?.env])
    if (block && typeof block === "object")
      for (const k of Object.keys(block))
        addEnv(f, lineOf(f.text, new RegExp(`"${escape(k)}"\\s*:`)) - 1, k, index, c);
}

function wrangler(f: RepoFile, index: Index, c: Collector) {
  if (f.path.endsWith(".toml")) {
    let inVars = false;
    f.text.split("\n").forEach((l, i) => {
      const header = /^\s*\[{1,2}([^\]]+)\]{1,2}\s*$/.exec(l);
      if (header) {
        inVars = /(?:^|\.)vars$/.test(header[1]!.trim());
        return;
      }
      const m = inVars ? /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(l) : null;
      if (m) addEnv(f, i, m[1]!, index, c);
    });
  } else {
    const vars = /"vars"\s*:\s*\{([^}]*)\}/.exec(f.text);
    if (vars)
      for (const m of vars[1]!.matchAll(/"([A-Za-z_][A-Za-z0-9_]*)"\s*:/g))
        addEnv(f, lineOf(f.text, new RegExp(`"${m[1]}"\\s*:`)) - 1, m[1]!, index, c);
  }
}

function simpleRegion(f: RepoFile, vendor: string, re: RegExp, c: Collector) {
  const m = re.exec(f.text);
  if (m) c.region(vendor, m[1]!, f.path, lineOf(f.text, re));
}

function serverless(f: RepoFile, index: Index, c: Collector) {
  const provider = /^\s*provider:\s*\n(?:\s+.*\n)*?\s+name:\s*["']?(\w+)/m.exec(f.text);
  const vendorId = provider ? SERVERLESS_PROVIDERS[provider[1]!] : undefined;
  const vendor = vendorId ? index.catalog.vendors.find((v) => v.id === vendorId) : undefined;
  if (!vendor) return;
  const line = lineOf(f.text, /^\s*provider:/m);
  c.add([{ vendor }], { file: f.path, line, kind: "config", what: `provider ${provider![1]}` });
  simpleRegion(f, vendor.id, /^\s+region:\s*["']?([\w-]+)/m, c);
}

function terraform(f: RepoFile, index: Index, c: Collector) {
  const lines = f.text.split("\n");
  lines.forEach((l, i) => {
    const m = /^\s*provider\s+"([\w-]+)"\s*\{/.exec(l);
    if (!m) return;
    const targets = index.lookup("terraform", m[1]!);
    if (!targets.length) return;
    c.add(targets, { file: f.path, line: i + 1, kind: "terraform", what: `provider "${m[1]}"` });
    let depth = 0;
    for (let j = i; j < lines.length; j++) {
      const line = lines[j]!;
      depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
      const r = /^\s*region\s*=\s*"([\w-]+)"/.exec(line);
      if (r) for (const t of targets) c.region(t.vendor.id, r[1]!, f.path, j + 1);
      if (depth <= 0 && j > i) break;
    }
  });
}

function dockerfile(f: RepoFile, index: Index, c: Collector) {
  f.text.split("\n").forEach((l, i) => {
    const m = /^\s*(ENV|ARG)\s+(.*)$/i.exec(l);
    if (!m) return;
    const rest = m[2]!;
    const names = rest.includes("=")
      ? [...rest.matchAll(/([A-Za-z_][A-Za-z0-9_]*)=/g)].map((x) => x[1]!)
      : [/^([A-Za-z_][A-Za-z0-9_]*)/.exec(rest)?.[1]].filter((x): x is string => !!x);
    for (const n of names) addEnv(f, i, n, index, c);
  });
}

function workflow(f: RepoFile, index: Index, c: Collector) {
  f.text.split("\n").forEach((l, i) => {
    for (const m of l.matchAll(/\$\{\{\s*(?:secrets|vars)\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g))
      addEnv(f, i, m[1]!, index, c);
  });
}

function code(f: RepoFile, index: Index, c: Collector) {
  const js = JS_FILE.test(f.path);
  const py = f.path.endsWith(".py");
  const go = f.path.endsWith(".go");
  f.text.split("\n").forEach((l, i) => {
    if (l.length > 2000) return; // minified or generated
    const comment = COMMENT.test(l);
    if (js && !comment)
      for (const re of JS_IMPORTS)
        for (const m of l.matchAll(re)) {
          const spec = m[1]!;
          if (spec.startsWith(".") || spec.startsWith("/")) continue;
          const targets = [...index.lookup("npm", spec)];
          if (packageOf(spec) !== spec) targets.push(...index.lookup("npm", packageOf(spec)));
          if (targets.length)
            c.add(preferServices(targets), {
              file: f.path,
              line: i + 1,
              kind: "import",
              what: spec,
            });
        }
    if (py && !comment) {
      const imp = /^\s*import\s+([\w.]+(?:\s*,\s*[\w.]+)*)/.exec(l);
      const from = /^\s*from\s+([\w.]+)\s+import\b/.exec(l);
      const mods = imp ? imp[1]!.split(/\s*,\s*/) : from ? [from[1]!] : [];
      for (const mod of mods) {
        const targets = index.lookup("py", mod);
        if (targets.length)
          c.add(targets, { file: f.path, line: i + 1, kind: "import", what: mod });
      }
    }
    if (go && !comment)
      for (const m of l.matchAll(/"([a-z0-9.-]+\.[a-z]{2,}\/[^"\s]+)"/g)) {
        const targets = index.lookup("go", m[1]!);
        if (targets.length)
          c.add(targets, { file: f.path, line: i + 1, kind: "import", what: m[1]! });
      }
    for (const re of ENV_REFS) for (const m of l.matchAll(re)) addEnv(f, i, m[1]!, index, c);
    if (!comment && index.hostPattern)
      for (const m of l.matchAll(index.hostPattern)) {
        const inUrl = l.slice(Math.max(0, m.index - 2), m.index) === "//";
        c.add(index.hostTargetsOf(m[1]!), {
          file: f.path,
          line: i + 1,
          kind: inUrl ? "host" : "mention",
          what: m[1]!,
        });
      }
  });
}
