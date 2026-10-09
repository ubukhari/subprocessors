/**
 * `subprocessors` — your sub-processor list, drafted from your code.
 *
 *   subprocessors [dir] [--md | --json] [--include-tests]
 *   subprocessors init [dir] [--force]
 *   subprocessors check [dir] [--list <file> | --base <ref>] [--json]
 *   subprocessors vendors [--json]
 *   subprocessors demo [--md | --json]
 *   subprocessors mcp
 *
 * Reads files on this machine and makes no requests. No account, no telemetry, no LLM calls.
 */
import { existsSync } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { CliError, usage } from "./errors.js";
import { execQuiet, snapshotAt, type Exec } from "./git.js";
import { PAGES_URL } from "./handoff.js";
import { INSTALL } from "./install.js";
import {
  LIST_FILE,
  checkAgainstBase,
  checkAgainstList,
  listFrom,
  parseList,
  type CheckResult,
} from "./list.js";
import { serveStdio } from "./mcp.js";
import {
  renderCheck,
  renderError,
  renderJson,
  renderMarkdown,
  renderText,
  renderVendors,
  vendorsJson,
} from "./render.js";
import { scanDir, type Report } from "./scan.js";
import { version } from "./version.js";

export const HELP = `subprocessors ${version()} — your sub-processor list, drafted from your code

Usage
  ${INSTALL} [dir]
      read package.json and other manifests, imports, API hosts, env variable names (never
      values) and infrastructure files (vercel.json, wrangler.toml, Terraform, workflows) under
      dir, default the current directory, and draft the sub-processor list: vendor, purpose, a
      guess at the personal data, the region where the code says it, the DPA and the vendor's
      own list, and the file and line each row was detected from
  ${INSTALL} init [dir]
      write ${LIST_FILE}, every row a draft, to confirm, edit and commit; --force overwrites
  ${INSTALL} check [dir]
      compare what the code uses with ${LIST_FILE} (or --list <file>), or with the code at
      a git ref (--base <ref>); exit 1 when the code uses a vendor the list does not have,
      because adding a sub-processor means telling your customers first
  ${INSTALL} vendors
      the catalog: every vendor it knows, with its DPA
  ${INSTALL} demo
      the draft for a synthetic repo shipped with this package
  ${INSTALL} mcp
      a local MCP server over stdio: subprocessors_scan and subprocessors_check

Options
  --md              the draft as a Markdown table to paste
  --json            the draft, or the check, as JSON
  --include-tests   also read tests, fixtures and examples below dir
  --list <file>     check against this list instead of dir/${LIST_FILE}
  --base <ref>      check against the code at a git ref (read with git archive)
  --force           init: overwrite an existing list

Reads files on this machine only; makes no requests. Real env files (.env, .env.local) are never
opened. A draft to review, not legal advice.
Pages: ${PAGES_URL}
`;

export interface Deps {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  now?: () => Date;
  cwd?: string;
  exec?: Exec;
}

const defaultDeps: Deps = {
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
};

export async function main(argv: string[], deps: Deps = defaultDeps): Promise<number> {
  const json = argv.includes("--json");
  try {
    return await run(argv, deps);
  } catch (e) {
    if (e instanceof CliError) {
      (json ? deps.stdout : deps.stderr)(renderError(e.toJSON(), json));
      return e.exitCode;
    }
    throw e;
  }
}

const COMMANDS = ["scan", "init", "check", "vendors", "demo", "mcp", "help"];

/** The package root: `demo` scans the synthetic repo shipped in it (examples/demo-repo). */
const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));
export const DEMO_DIR = "examples/demo-repo";

async function run(argv: string[], deps: Deps): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        json: { type: "boolean" },
        md: { type: "boolean" },
        "include-tests": { type: "boolean" },
        list: { type: "string" },
        base: { type: "string" },
        force: { type: "boolean" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
    });
  } catch (e) {
    throw usage(
      e instanceof Error ? e.message : String(e),
      `run \`${INSTALL} --help\` for the options`,
    );
  }
  const { values, positionals } = parsed;
  if (values.version) {
    deps.stdout(`${version()}\n`);
    return 0;
  }
  let [command, ...rest] = positionals;
  if (values.help || command === "help") {
    deps.stdout(HELP);
    return 0;
  }
  // a first word that is not a command is the directory: `subprocessors ./app`
  if (command === undefined || !COMMANDS.includes(command)) {
    rest = command === undefined ? [] : [command, ...rest];
    command = "scan";
  }
  if (values.json && values.md) throw usage("--json and --md are one or the other", "drop one");
  if (values.list !== undefined && values.base !== undefined)
    throw usage("--list and --base are one or the other", "compare with a list, or with a ref");
  if ((values.list !== undefined || values.base !== undefined) && command !== "check")
    throw usage(`--list and --base belong to check`, `run \`${INSTALL} check --base <ref>\``);
  if (values.force && command !== "init")
    throw usage("--force belongs to init", `run \`${INSTALL} init --force\``);
  const now = deps.now?.() ?? new Date();
  const cwd = deps.cwd ?? process.cwd();

  if (command === "mcp") {
    if (rest.length) throw usage("mcp takes no arguments", `run \`${INSTALL} mcp\``);
    await serveStdio({ now: deps.now, cwd, exec: deps.exec });
    return 0;
  }
  if (command === "vendors") {
    if (rest.length) throw usage("vendors takes no arguments", `run \`${INSTALL} vendors\``);
    deps.stdout(values.json ? renderJson(vendorsJson()) : renderVendors());
    return 0;
  }
  if (rest.length > 1)
    throw usage(`${command} takes one directory, got ${rest.length}`, `run \`${INSTALL} [dir]\``);

  if (command === "demo") {
    if (rest.length) throw usage("demo takes no arguments", `run \`${INSTALL} demo\``);
    if (!values.json && !values.md)
      deps.stdout("Synthetic repo, written for this demo: not anyone's code.\n\n");
    const report = await scan(DEMO_DIR, PACKAGE_ROOT, now, false);
    deps.stdout(
      values.json ? renderJson(report) : values.md ? renderMarkdown(report) : renderText(report),
    );
    return 0;
  }

  const shown = rest[0] ?? ".";
  const dir = path.resolve(cwd, shown);
  if (command === "scan") {
    const report = await scan(shown, cwd, now, !!values["include-tests"]);
    deps.stdout(
      values.json ? renderJson(report) : values.md ? renderMarkdown(report) : renderText(report),
    );
    return 0;
  }
  if (command === "init") {
    const target = path.join(dir, LIST_FILE);
    if (existsSync(target) && !values.force)
      throw new CliError({
        code: "LIST_EXISTS",
        cause: `${path.join(shown, LIST_FILE)} already exists`,
        fix: `compare with it instead (\`${INSTALL} check\`), or overwrite it with \`${INSTALL} init --force\``,
        retryable: false,
      });
    const report = await scan(shown, cwd, now, !!values["include-tests"]);
    const list = listFrom(report);
    await writeFile(target, JSON.stringify(list, null, 2) + "\n");
    if (values.json) deps.stdout(renderJson({ wrote: path.join(shown, LIST_FILE), list }));
    else
      deps.stdout(
        `Wrote ${path.join(shown, LIST_FILE)}: ${list.subprocessors.length} sub-processors as drafts, ${list.not_subprocessors.length} set aside as probably not.\n` +
          `${report.notice}\n` +
          `Set "status" to "confirmed" on each row you have checked, add vendors outside the code by hand, and commit it. Then \`${INSTALL} check\` in CI flags a pull request that adds a vendor.\n`,
      );
    return 0;
  }
  // check
  const result = await check(shown, cwd, now, {
    list: values.list,
    base: values.base,
    includeTests: !!values["include-tests"],
    exec: deps.exec,
  });
  deps.stdout(values.json ? renderJson(result) : renderCheck(result));
  return result.added.length ? 1 : 0;
}

async function scan(shown: string, cwd: string, now: Date, includeTests: boolean): Promise<Report> {
  const dir = path.resolve(cwd, shown);
  const isDir = await stat(dir).then(
    (s) => s.isDirectory(),
    () => false,
  );
  if (!isDir)
    throw new CliError({
      code: "DIR_NOT_FOUND",
      cause: `no directory at ${shown}`,
      fix: `pass a checkout of your code: \`${INSTALL} .\``,
      retryable: false,
    });
  return scanDir(dir, { shown, now, includeTests });
}

export interface CheckOptions {
  list?: string;
  base?: string;
  includeTests?: boolean;
  exec?: Exec;
}

/** The whole check, for the CLI and the MCP tool alike. */
export async function check(
  shown: string,
  cwd: string,
  now: Date,
  opts: CheckOptions,
): Promise<CheckResult> {
  const head = await scan(shown, cwd, now, !!opts.includeTests);
  const dir = path.resolve(cwd, shown);
  if (opts.base !== undefined) {
    const snap = await snapshotAt(dir, opts.base, opts.exec ?? execQuiet);
    try {
      const base = await scanDir(snap.dir, { shown, now, includeTests: !!opts.includeTests });
      return checkAgainstBase(head, base, opts.base);
    } finally {
      await snap.cleanup();
    }
  }
  const file = opts.list ?? path.join(shown, LIST_FILE);
  const full = path.resolve(cwd, file);
  const text = await readFile(full, "utf8").catch(() => null);
  if (text === null)
    throw new CliError({
      code: "LIST_MISSING",
      cause: `no list at ${file}`,
      fix: `draft one with \`${INSTALL} init\` and commit it, or compare with a git ref: \`${INSTALL} check --base origin/main\``,
      retryable: false,
    });
  return checkAgainstList(head, parseList(text, file), file);
}

export { scan as scanPath };
