import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CliError } from "./errors.js";
import { fixtureRepo } from "./fixture.js";
import { snapshotAt } from "./git.js";
import { check } from "./main.js";

const NOW = new Date("2026-10-09T12:00:00Z");

/** A throwaway git repo in a temp directory, with one commit; nothing global is configured. */
function gitRepo(files: Record<string, string>): string {
  const root = fixtureRepo(files, "subprocessors-git-");
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
      { cwd: root, stdio: "pipe" },
    );
  git("init", "-q", "-b", "main");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  return root;
}

describe("check --base", () => {
  it("finds the vendor a change adds, against the code at HEAD, and cleans up", async () => {
    const root = gitRepo({
      "package.json": JSON.stringify({ dependencies: { stripe: "1" } }, null, 2),
      "src/a.ts": 'import Stripe from "stripe";\n',
    });
    writeFileSync(path.join(root, "src/ai.ts"), 'import Anthropic from "@anthropic-ai/sdk";\n');
    const c = await check(".", root, NOW, { base: "HEAD" });
    expect(c.added.map((r) => r.id)).toEqual(["anthropic"]);
    expect(c.added[0]!.evidence[0]).toMatchObject({ file: "src/ai.ts", line: 1, kind: "import" });
    expect(c.removed).toEqual([]);
    expect(c.against).toEqual({ kind: "base", ref: "HEAD" });
  });

  it("reads a subdirectory of the repository at the ref", async () => {
    const root = gitRepo({
      "apps/web/package.json": JSON.stringify({ dependencies: { resend: "1" } }),
      "apps/api/package.json": JSON.stringify({ dependencies: { stripe: "1" } }),
    });
    writeFileSync(path.join(root, "apps/web/package.json"), JSON.stringify({ dependencies: {} }));
    const c = await check("apps/web", root, NOW, { base: "HEAD" });
    expect(c.added).toEqual([]);
    expect(c.removed).toEqual([{ id: "resend", name: "Resend" }]);
  });

  it("snapshotAt leaves nothing behind", async () => {
    const root = gitRepo({ "package.json": "{}" });
    const snap = await snapshotAt(root, "HEAD");
    expect(existsSync(path.join(snap.dir, "package.json"))).toBe(true);
    await snap.cleanup();
    expect(existsSync(snap.dir)).toBe(false);
  });

  it("refuses a ref that looks like an option, an unknown ref, and a directory outside git", async () => {
    const root = gitRepo({ "package.json": "{}" });
    const code = async (dir: string, ref: string) =>
      snapshotAt(dir, ref).then(
        () => "ok",
        (e: unknown) => (e instanceof CliError ? `${e.code}: ${e.cause}` : String(e)),
      );
    expect(await code(root, "--output=/tmp/x")).toMatch(
      /^GIT_FAILED: "--output=\/tmp\/x" is not a git ref/,
    );
    expect(await code(root, "no-such-branch")).toBe(
      'GIT_FAILED: git does not know the ref "no-such-branch" here',
    );
    expect(await code(fixtureRepo({}), "HEAD")).toMatch(
      /^GIT_FAILED: .* is not inside a git repository/,
    );
  });
});
