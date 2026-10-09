/**
 * The files that put subprocessors where people already are: the package manifest, the README and
 * its recorded sample, this package's CHANGELOG, and the repo-root files the sync copies from
 * `distribution/root` (the GitHub Action and the Claude Code plugin marketplace). The public repo
 * has those at its root, so their checks run in the monorepo only; `scripts/sync-oss-repos.sh`
 * re-validates them. Also the two files agentcheck's /subprocessors pages import from here: the
 * install mirror and the demo repo's draft.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fixtureRepo } from "./fixture.js";
import { HANDOFF_LINE } from "./handoff.js";
import { SAMPLE_DATE } from "./index.js";
import { ACTION, INSTALL, ON_NPM, PUBLISHED, REPO, RUN } from "./install.js";
import { listFrom } from "./list.js";
import { main } from "./main.js";
import { TOOLS } from "./mcp.js";
import { evidenceText } from "./render.js";
import { scanDir, scanFiles, type Row } from "./scan.js";

const here = (rel: string): URL => new URL(`../${rel}`, import.meta.url);
const read = (rel: string): string => readFileSync(here(rel), "utf8");
const json = <T>(rel: string): T => JSON.parse(read(rel)) as T;
const pkg = json<{
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  files: string[];
  bin: Record<string, string>;
}>("package.json");
const WRITE = Boolean(process.env["SUBPROCESSORS_WRITE_INSTALL"]);

describe("package", () => {
  it("is subprocessors with no runtime dependencies", () => {
    expect(pkg.name).toBe("subprocessors");
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.dependencies ?? {}).toEqual({});
    expect(pkg.bin).toEqual({ subprocessors: "./dist/cli.js" });
    expect(pkg.files).toEqual(
      expect.arrayContaining(["dist", "examples/demo-repo", "README.md", "CHANGELOG.md"]),
    );
  });

  it("CHANGELOG has a section for this version", () => {
    expect(read("CHANGELOG.md")).toMatch(
      new RegExp(`^## ${pkg.version.replace(/\./g, "\\.")} `, "m"),
    );
  });
});

describe("README", () => {
  const readme = read("README.md");

  it("leads with the one-line use and says it is a draft", () => {
    expect(readme).toContain("```sh\n" + INSTALL + "\n```");
    expect(readme).toContain("**A draft to review, not legal advice.**");
  });

  it("the recorded sample is the CLI's real output on the synthetic demo repo (`node scripts/sample.mjs`)", async () => {
    let out = "";
    await main(["examples/demo-repo"], {
      stdout: (s) => (out += s),
      stderr: () => undefined,
      now: () => new Date(`${SAMPLE_DATE}T12:00:00Z`),
      cwd: fileURLToPath(new URL("..", import.meta.url)),
    });
    expect(readme).toContain("**synthetic**");
    expect(readme).toContain("```text\n" + out.trimEnd() + "\n```");
  });

  it("names the Action and the tools, and says what it never opens", () => {
    expect(readme).toContain(`uses: ${ACTION}`);
    for (const t of TOOLS) expect(readme).toContain(t.name);
    expect(readme).toContain("**A real `.env`, `.env.local` or `.dev.vars` is never opened**");
    expect(read("examples/github-workflow.yml")).toContain(`uses: ${ACTION}`);
  });
});

const root = "distribution/root";
const frontmatter = (text: string): Record<string, string> =>
  Object.fromEntries(
    (text.split("---")[1] ?? "")
      .split("\n")
      .map((l) => /^([a-z-]+):\s*(.*)$/.exec(l))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => [m[1]!, m[2]!.replace(/^"|"$/g, "")]),
  );

describe.skipIf(!existsSync(here(root)))("repo-root files (distribution/root)", () => {
  it("the marketplace's plugin resolves, and versions match this package", () => {
    const marketplace = json<{
      name: string;
      owner: { name: string };
      plugins: { name: string; source: string }[];
    }>(`${root}/.claude-plugin/marketplace.json`);
    expect(marketplace.name).toBe("subprocessors");
    expect(marketplace.owner.name).toBe("agentwares");
    expect(marketplace.plugins).toHaveLength(1);
    for (const entry of marketplace.plugins) {
      expect(entry.source.startsWith("./")).toBe(true);
      const plugin = json<{ name: string; version: string }>(
        `${root}/${entry.source.slice(2)}/.claude-plugin/plugin.json`,
      );
      expect(plugin.name).toBe(entry.name);
      expect(plugin.version).toBe(pkg.version);
    }
  });

  it("plugin.json carries the links a directory listing needs", () => {
    const plugin = json<Record<string, unknown>>(
      `${root}/plugins/subprocessors/.claude-plugin/plugin.json`,
    );
    for (const key of [
      "homepage",
      "documentationUrl",
      "repository",
      "privacyPolicyUrl",
      "termsOfServiceUrl",
      "supportUrl",
    ])
      expect(String(plugin[key])).toMatch(/^https:\/\//);
  });

  it("the skill runs the published CLI and writes nothing before the user agrees", () => {
    const skills = readdirSync(here(`${root}/plugins/subprocessors/skills`));
    expect(skills).toEqual(["subprocessors"]);
    const text = read(`${root}/plugins/subprocessors/skills/subprocessors/SKILL.md`);
    const front = frontmatter(text);
    expect(front.name).toBe("subprocessors");
    expect(front.description!.length).toBeGreaterThan(80);
    expect(front.description!.length).toBeLessThanOrEqual(1024);
    expect(text).toContain(`${RUN} $ARGUMENTS --json`);
    expect(text).toContain("Write nothing before they agree.");
  });

  it("nothing pre-approves a tool: Claude Code asks before every command", () => {
    const walkFiles = (dir: string): string[] =>
      readdirSync(here(dir), { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walkFiles(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
      );
    const files = walkFiles(root);
    for (const f of files.filter((x) => x.endsWith(".md"))) {
      const text = read(f);
      const front = text.startsWith("---") ? (text.split("---")[1] ?? "") : "";
      expect(front, f).not.toMatch(/^\s*(allowed-tools|allowedTools)\s*:/m);
    }
    for (const f of files.filter((x) => x.endsWith(".json")))
      expect(read(f), f).not.toMatch(/allowed-?tools/i);
  });

  it("the listing icon is a 1024 px PNG drawn from distribution/icon.svg (`pnpm icon`)", () => {
    const plugin = json<{ icon?: string }>(
      `${root}/plugins/subprocessors/.claude-plugin/plugin.json`,
    );
    expect(plugin.icon).toBe("./.claude-plugin/icon.png");
    const file = `${root}/plugins/subprocessors/${plugin.icon!.slice(2)}`;
    const png = readFileSync(here(file));
    expect(statSync(here(file)).size).toBeLessThan(2 * 1024 * 1024);
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(png.readUInt32BE(16)).toBe(1024);
    expect(png.readUInt32BE(20)).toBe(1024);
    const key = "subprocessors-icon-source-sha256\0";
    const at = png.indexOf(key, 0, "latin1");
    expect(at, "icon.png carries no source hash: run `pnpm icon`").toBeGreaterThan(0);
    const drawnFrom = png.subarray(at + key.length, at + key.length + 64).toString("latin1");
    const svg = createHash("sha256").update(read("distribution/icon.svg")).digest("hex");
    expect(drawnFrom, "distribution/icon.svg changed: run `pnpm icon`").toBe(svg);
  });

  it("the plugin folder has the README the directory lists it by, naming what it runs", () => {
    const readme = read(`${root}/plugins/subprocessors/README.md`);
    expect(readme).toContain(RUN);
    expect(readme).toContain("pre-approve nothing");
  });
});

/**
 * The Action's script, run as GitHub runs it, against fixture git repositories. The CLI makes no
 * requests; the script fetches the base commit only when the checkout lacks it, which a fixture
 * never does.
 */
describe.skipIf(!existsSync(here("dist/cli.js")) || !existsSync(here(`${root}/action.yml`)))(
  "the GitHub Action",
  () => {
    // vitest runs a skipped block's body while collecting, so read only where the file exists
    const action = existsSync(here(`${root}/action.yml`)) ? read(`${root}/action.yml`) : "run: |\n";
    const script = /run: \|\n([\s\S]*)$/.exec(action)![1]!.replace(/^ {8}/gm, "");

    function gitRepo(files: Record<string, string>): string {
      const dir = fixtureRepo(files, "subprocessors-action-");
      const git = (...args: string[]) =>
        execFileSync(
          "git",
          [
            "-c",
            "user.name=fixture",
            "-c",
            "user.email=fixture@example.invalid",
            "-c",
            "commit.gpgsign=false",
            ...args,
          ],
          { cwd: dir, stdio: "pipe" },
        );
      git("init", "-q", "-b", "main");
      git("add", "-A");
      git("commit", "-q", "-m", "base");
      return dir;
    }

    function runAction(workspace: string, env: Record<string, string>) {
      const dir = mkdtempSync(path.join(tmpdir(), "subprocessors-runner-"));
      const summary = path.join(dir, "summary.md");
      const outputs = path.join(dir, "outputs.txt");
      writeFileSync(summary, "");
      writeFileSync(outputs, "");
      let status = 0;
      let stdout: string;
      try {
        stdout = execFileSync("bash", ["-c", script], {
          cwd: workspace,
          env: {
            PATH: process.env["PATH"],
            GITHUB_ACTION_PATH: here(".").pathname,
            RUNNER_TEMP: dir,
            GITHUB_STEP_SUMMARY: summary,
            GITHUB_OUTPUT: outputs,
            SP_PATH: ".",
            SP_LIST: "",
            SP_BASE: "",
            SP_FAIL: "false",
            ...env,
          },
          encoding: "utf8",
        });
      } catch (e) {
        status = (e as { status: number }).status;
        stdout = String((e as { stdout: unknown }).stdout ?? "");
      }
      return {
        status,
        stdout,
        summary: readFileSync(summary, "utf8"),
        outputs: Object.fromEntries(
          readFileSync(outputs, "utf8")
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((l) => l.split(/=(.*)/s).slice(0, 2) as [string, string]),
        ),
      };
    }

    it("against the base commit: warns on the line that added a vendor, and fails only when asked", () => {
      const repo = gitRepo({
        "apps/web/package.json": JSON.stringify({ dependencies: { stripe: "1" } }, null, 2),
      });
      writeFileSync(
        path.join(repo, "apps/web/package.json"),
        JSON.stringify({ dependencies: { stripe: "1", "@anthropic-ai/sdk": "1" } }, null, 2),
      );
      const warn = runAction(repo, { SP_PATH: "apps/web", SP_BASE: "HEAD" });
      expect(warn.status).toBe(0);
      expect(warn.stdout).toMatch(
        /^::warning file=apps\/web\/package\.json,line=4,title=New sub-processor%3A Anthropic::/m,
      );
      expect(warn.summary).toContain("New sub-processors: 1");
      expect(warn.outputs).toMatchObject({ added: "anthropic", removed: "" });
      expect(warn.outputs["report"]).toMatch(/subprocessors-check\.json$/);
      const fail = runAction(repo, { SP_PATH: "apps/web", SP_BASE: "HEAD", SP_FAIL: "true" });
      expect(fail.status).toBe(1);
      expect(fail.stdout).toMatch(/^::error file=apps\/web\/package\.json,line=4,/m);
    });

    it("against a committed list: quiet when nothing was added; refuses a bad input", () => {
      const pkgJson = JSON.stringify({ dependencies: { resend: "1" } }, null, 2);
      const list = listFrom(
        scanFiles([{ path: "package.json", text: pkgJson }], { shown: ".", now: new Date() }),
      );
      const repo = gitRepo({
        "package.json": pkgJson,
        "subprocessors.json": JSON.stringify(list, null, 2),
      });
      const r = runAction(repo, { SP_BASE: "HEAD" });
      expect(r.status).toBe(0);
      expect(r.stdout).not.toMatch(/^::(error|warning)/m);
      expect(r.stdout).toContain("against subprocessors.json");
      expect(r.outputs).toMatchObject({ added: "", removed: "" });
      expect(runAction(repo, { SP_FAIL: "maybe" }).status).toBe(2);
    });

    it("says what to do when there is nothing to compare with, and reports a broken list", () => {
      const repo = gitRepo({ "package.json": "{}" });
      const none = runAction(repo, {});
      expect(none.status).toBe(2);
      expect(none.stdout).toContain("nothing to compare with");
      writeFileSync(path.join(repo, "subprocessors.json"), "{");
      const broken = runAction(repo, {});
      expect(broken.status).toBe(1);
      expect(broken.stdout).toContain("LIST_INVALID");
    });
  },
);

/**
 * One install command (src/install.ts), everywhere it is shown. Any form of it found elsewhere must
 * be INSTALL, or RUN where an agent runs it unattended; code and agentcheck's pages import it rather
 * than spell it. After flipping ON_NPM, rewrite the files that cannot import it:
 *
 *   SUBPROCESSORS_WRITE_INSTALL=1 pnpm --filter subprocessors exec vitest run src/distribution
 *
 * which also rewrites the mirror agentcheck's pages import.
 */
const COMMAND =
  /npx (?:-{1,2}[\w-]+(?:=[\w-]+)? )*(?:github:agentwares\/)?subprocessors(?:@latest)?(?![\w./-])/g;
const forms = (text: string): string[] => [...text.matchAll(COMMAND)].map((m) => m[0]);
const walk = (rel: string): string[] =>
  !existsSync(here(rel))
    ? []
    : statSync(here(rel)).isFile()
      ? [rel]
      : readdirSync(here(rel), { withFileTypes: true })
          .filter((e) => !["node_modules", "dist", ".next"].includes(e.name))
          .flatMap((e) => walk(`${rel}/${e.name}`));

/** Re-pad the `# comments` of a shell block that names the command, so its columns line up. */
function realign(text: string): string {
  return text.replace(/```sh\n([\s\S]*?)```/g, (block, body: string) => {
    if (forms(body).length === 0) return block;
    const rows = body.split("\n").map((l) => /^(\S.*?\S)\s{2,}(# .*)$/.exec(l));
    const width = Math.max(0, ...rows.map((m) => (m ? m[1]!.length : 0))) + 2;
    const lines = body.split("\n").map((l, i) => {
      const m = rows[i];
      return m ? m[1]!.padEnd(width) + m[2]! : l;
    });
    return "```sh\n" + lines.join("\n") + "```";
  });
}

describe("the install command", () => {
  it(`is ${INSTALL} while ON_NPM is ${String(ON_NPM)}`, () => {
    expect(INSTALL).toBe(`npx ${ON_NPM ? "" : "--allow-git=root github:agentwares/"}${pkg.name}`);
    expect(RUN).toBe(
      ON_NPM
        ? `npx -y ${pkg.name}@latest`
        : `npx -y --allow-git=root github:agentwares/${pkg.name}`,
    );
    expect(REPO).toBe(`https://github.com/agentwares/${pkg.name}`);
  });

  const docs = [
    "README.md",
    "CHANGELOG.md",
    ...walk("distribution"),
    ...walk(".claude-plugin"),
    ...walk("plugins"),
    ...walk("examples"),
  ].filter((f) => /\.(md|json|ya?ml)$/.test(f));

  it.each(docs)("%s names only INSTALL or RUN", (file) => {
    const text = read(file);
    if (WRITE) {
      const next = realign(
        text.replace(COMMAND, (m) => (/ (?:-y|--yes) /.test(m) ? RUN : INSTALL)),
      );
      if (next !== text) writeFileSync(here(file), next);
    }
    for (const form of forms(read(file))) expect([INSTALL, RUN], file).toContain(form);
  });

  it("code, scripts and tests import it rather than spell it", () => {
    const files = [...walk("src"), ...walk("scripts")].filter((f) => f !== "src/install.ts");
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) expect(forms(read(file)), file).toEqual([]);
  });
});

/** agentcheck's pages import a mirror of src/install.ts, written here; nothing there spells it. */
const AGENTCHECK = "../agentcheck/src";
const MIRROR = `${AGENTCHECK}/app/subprocessors/_lib/install.ts`;
const EXAMPLE = `${AGENTCHECK}/app/subprocessors/_data/example.json`;
describe.skipIf(!existsSync(here(AGENTCHECK)))("agentcheck's /subprocessors pages", () => {
  it("the install mirror its pages import is src/install.ts", () => {
    const text = [
      "/**",
      " * How to run subprocessors, mirrored from apps/subprocessors-cli/src/install.ts, the one",
      " * constant. Written by apps/subprocessors-cli/src/distribution.test.ts, which fails when the two",
      " * differ. While PUBLISHED is false the pages show neither INSTALL nor ACTION, only the grep.",
      " */",
      `export const ON_NPM: boolean = ${String(ON_NPM)};`,
      `export const PUBLISHED: boolean = ${String(PUBLISHED)};`,
      `export const INSTALL = ${JSON.stringify(INSTALL)};`,
      `export const REPO = ${JSON.stringify(REPO)};`,
      `export const ACTION = ${JSON.stringify(ACTION)};`,
      "",
    ].join("\n");
    if (WRITE) writeFileSync(here(MIRROR), text);
    expect(read(MIRROR)).toBe(text);
  });

  it("no other agentcheck file spells the command", () => {
    const files = walk(AGENTCHECK).filter((f) => f !== MIRROR && /\.(tsx?|md|txt|json)$/.test(f));
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) expect(forms(read(file)), file).toEqual([]);
  });

  it("the example page's data is the demo repo's real draft", async () => {
    const report = await scanDir(fileURLToPath(here("examples/demo-repo")), {
      shown: "examples/demo-repo",
      now: new Date(`${SAMPLE_DATE}T12:00:00Z`),
    });
    const row = (r: Row) => ({
      name: r.name,
      purpose: r.purpose,
      data: r.data,
      region: r.region,
      dpa: r.dpa,
      list: r.list,
      confidence: r.confidence,
      evidence: r.evidence.map(evidenceText),
      ...(r.note ? { note: r.note } : {}),
    });
    const example = {
      about:
        "The draft subprocessors writes for its synthetic demo repo (a Next.js app written for the demo, not anyone's code). Written by apps/subprocessors-cli/src/distribution.test.ts.",
      scanned_on: report.scanned_on,
      subprocessors: report.subprocessors.map(row),
      probably_not: report.probably_not.map(row),
    };
    // compared as data: prettier owns the file's layout
    if (WRITE) writeFileSync(here(EXAMPLE), JSON.stringify(example, null, 2) + "\n");
    expect(
      existsSync(here(EXAMPLE)) ? JSON.parse(read(EXAMPLE)) : null,
      "run with SUBPROCESSORS_WRITE_INSTALL=1 to rewrite it",
    ).toEqual(example);
  });

  it("the hand-off line is word for word the one the pages carry, and the README's heading", () => {
    expect(read(`${AGENTCHECK}/app/subprocessors/_lib/ui.tsx`)).toContain(
      JSON.stringify(HANDOFF_LINE),
    );
    expect(read("README.md")).toContain(`## ${HANDOFF_LINE.replace(/\.$/, "")}\n`);
    expect(read("README.md")).toContain(
      "https://agentwares-agentcheck.vercel.app/?ref=subprocessors",
    );
  });
});
