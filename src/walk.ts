/**
 * Which files of a repository the scan reads, and which it never opens.
 *
 * It reads manifests, source files, example env files, infrastructure files and workflows. It
 * never opens a real env file (`.env`, `.env.local`, `.dev.vars`): those are listed as skipped,
 * by path only. Dependencies, build output and VCS folders are not entered; tests, fixtures and
 * examples below the scanned root are skipped unless asked for, so a mocked SDK is not a vendor.
 */
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";

export interface RepoFile {
  /** Relative to the scanned root, with `/` separators. */
  path: string;
  text: string;
}

export interface WalkResult {
  files: RepoFile[];
  /** Real env files found and not opened. */
  skippedEnv: string[];
  /** Files over the size limit, not read. */
  skippedLarge: string[];
  /** Test, fixture and example files not read (a count). */
  skippedTests: number;
  /** true when the file limit stopped the walk early. */
  truncated: boolean;
}

export interface WalkOptions {
  includeTests?: boolean;
  /** Bytes; a larger file is not read. */
  maxBytes?: number;
  /** Files read at most. */
  maxFiles?: number;
}

const SKIP_DIRS = new Set([
  "node_modules",
  "bower_components",
  "jspm_packages",
  "dist",
  "build",
  "out",
  "coverage",
  "vendor",
  "target",
  "__pycache__",
  "venv",
  "site-packages",
  "storybook-static",
]);
/** Dot-directories that hold infrastructure files; every other one is skipped (.git, .next, …). */
const DOT_DIRS = new Set([".github", ".do", ".actor"]);
const TEST_DIRS = new Set([
  "test",
  "tests",
  "__tests__",
  "__mocks__",
  "fixtures",
  "__fixtures__",
  "testdata",
  "examples",
  "example",
  "e2e",
  "spec",
  "cypress",
]);

const CODE = /\.(?:[cm]?[jt]sx?|py|go|rb|vue|svelte|astro)$/;
const TEST_FILE =
  /(?:\.(?:test|spec|stories)\.[cm]?[jt]sx?$)|(?:_test\.(?:go|py)$)|(?:^test_[^/]*\.py$)|(?:^(?:fake|mock|stub)s?[-_.])/;
const MANIFESTS = new Set(["package.json", "pyproject.toml", "go.mod", "Gemfile"]);
const REQUIREMENTS = /^requirements[\w.-]*\.txt$/;
const INFRA = new Set([
  "vercel.json",
  "wrangler.toml",
  "wrangler.json",
  "wrangler.jsonc",
  "netlify.toml",
  "fly.toml",
  "render.yaml",
  "railway.json",
  "railway.toml",
  "firebase.json",
  "serverless.yml",
  "serverless.yaml",
  "amplify.yml",
  "samconfig.toml",
  "cdk.json",
  "actor.json",
  "app.yaml",
  "config.toml",
]);

/** A file named like an env file: `.env`, `.env.local`, `env.example`, `.dev.vars`, `prod.env`. */
export function isEnvFile(name: string): boolean {
  if (CODE.test(name)) return false; // env.ts, env.mjs: code that reads env names
  return /^\.?env(?:\.|$)/.test(name) || /^\.dev\.vars(?:\.|$)/.test(name) || /\.env$/.test(name);
}

/** An env file that holds example values: `.env.example`, `.env.local.sample`, `example.env`. */
export function isExampleEnv(name: string): boolean {
  return (
    isEnvFile(name) && /(?:^|[.-])(?:example|sample|template|dist|defaults)(?:[.-]|$)/i.test(name)
  );
}

function wanted(rel: string, name: string): boolean {
  if (MANIFESTS.has(name) || REQUIREMENTS.test(name) || INFRA.has(name)) return true;
  if (/^Dockerfile(?:\.[\w-]+)?$/.test(name) || name.endsWith(".Dockerfile")) return true;
  if (name.endsWith(".tf")) return true;
  if (rel.startsWith(".github/workflows/") && /\.ya?ml$/.test(name)) return true;
  if (CODE.test(name) && !name.endsWith(".d.ts")) return true;
  return isExampleEnv(name);
}

/** Walk `root` and read the files the detectors use. Deterministic: sorted, depth first. */
export async function walk(root: string, opts: WalkOptions = {}): Promise<WalkResult> {
  const maxBytes = opts.maxBytes ?? 1_000_000;
  const maxFiles = opts.maxFiles ?? 50_000;
  const out: WalkResult = {
    files: [],
    skippedEnv: [],
    skippedLarge: [],
    skippedTests: 0,
    truncated: false,
  };
  const stack: string[] = [""];
  while (stack.length) {
    const dirRel = stack.pop()!;
    let entries;
    try {
      entries = await readdir(path.join(root, dirRel), { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
    const files: string[] = [];
    for (const e of entries) {
      const rel = dirRel ? `${dirRel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        if (e.name.startsWith(".") && !DOT_DIRS.has(e.name)) continue;
        if (!opts.includeTests && TEST_DIRS.has(e.name)) {
          out.skippedTests++;
          continue;
        }
        stack.push(rel);
      } else if (e.isFile()) files.push(rel);
    }
    for (const rel of files.reverse()) {
      const name = rel.slice(rel.lastIndexOf("/") + 1);
      if (isEnvFile(name) && !isExampleEnv(name)) {
        out.skippedEnv.push(rel);
        continue;
      }
      if (!wanted(rel, name)) continue;
      if (!opts.includeTests && TEST_FILE.test(name)) {
        out.skippedTests++;
        continue;
      }
      if (out.files.length >= maxFiles) {
        out.truncated = true;
        return finish(out);
      }
      const full = path.join(root, rel);
      const st = await lstat(full).catch(() => null);
      if (!st) continue;
      if (st.size > maxBytes) {
        out.skippedLarge.push(rel);
        continue;
      }
      const text = await readFile(full, "utf8").catch(() => null);
      if (text !== null)
        out.files.push({ path: rel, text: isEnvFile(name) ? envNamesOnly(text) : text });
    }
  }
  return finish(out);
}

/**
 * An example env file reduced to its names, line for line: `NAME=` where the file had
 * `NAME=value`, and an empty line for anything else. Values are dropped here, before any detector
 * sees the text, so no later step can print or keep one.
 */
export function envNamesOnly(text: string): string {
  return text
    .split("\n")
    .map((l) => {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(l);
      return m ? `${m[1]}=` : "";
    })
    .join("\n");
}

function finish(out: WalkResult): WalkResult {
  out.files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  out.skippedEnv.sort();
  out.skippedLarge.sort();
  return out;
}
