import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fixtureRepo } from "./fixture.js";
import { HANDOFF_LINE } from "./handoff.js";
import { INSTALL } from "./install.js";
import { main } from "./main.js";

const NOW = new Date("2026-10-09T12:00:00Z");

async function cli(argv: string[], cwd: string) {
  let stdout = "";
  let stderr = "";
  const code = await main(argv, {
    stdout: (s) => (stdout += s),
    stderr: (s) => (stderr += s),
    now: () => NOW,
    cwd,
  });
  return { code, stdout, stderr };
}

const app = () =>
  fixtureRepo({
    "package.json": JSON.stringify({ dependencies: { stripe: "1", resend: "1" } }, null, 2),
    ".env.local": "STRIPE_SECRET_KEY=sk_live_FIXTUREVALUE\n",
    ".env.example": "STRIPE_SECRET_KEY=sk_test_PLACEHOLDER\n",
  });

describe("scan", () => {
  it("prints the draft with the notice, what was not read, the next steps and the hand-off", async () => {
    const r = await cli([], app());
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(
      /^subprocessors \d+\.\d+\.\d+: a draft sub-processor list for \., from its code \(9 Oct 2026\)\n/,
    );
    expect(r.stdout).toContain("not legal advice");
    expect(r.stdout).toContain("Likely sub-processors: 2");
    expect(r.stdout).toContain("  Stripe (Payments)\n");
    expect(r.stdout).toContain("Not read: .env.local (env files with real values are never opened");
    expect(r.stdout).toContain(`    ${INSTALL} init\n`);
    expect(r.stdout).toContain(HANDOFF_LINE);
    expect(r.stdout).not.toContain("FIXTUREVALUE");
    expect(r.stdout).not.toContain("PLACEHOLDER");
  });

  it("--json and --md carry the same rows; a directory argument works", async () => {
    const root = app();
    const j = await cli(["--json", "."], root);
    const report = JSON.parse(j.stdout) as { subprocessors: { id: string }[]; root: string };
    expect(report.subprocessors.map((r) => r.id)).toEqual(["stripe", "resend"]);
    const md = await cli(["scan", root, "--md"], "/");
    expect(md.stdout).toContain("| Stripe | Payments and billing |");
    expect(md.stdout).toContain("[DPA](https://resend.com/legal/dpa)");
    expect(JSON.stringify(j) + md.stdout).not.toMatch(/FIXTUREVALUE|PLACEHOLDER/);
  });

  it("a missing directory is an error with a fix; bad options are usage errors", async () => {
    const root = app();
    const missing = await cli(["nope"], root);
    expect(missing.code).toBe(1);
    expect(missing.stderr).toBe(
      `subprocessors: DIR_NOT_FOUND: no directory at nope\n  fix: pass a checkout of your code: \`${INSTALL} .\`\n`,
    );
    const asJson = await cli(["nope", "--json"], root);
    expect(JSON.parse(asJson.stdout)).toEqual({
      error: expect.objectContaining({ code: "DIR_NOT_FOUND", retryable: false }),
    });
    for (const argv of [["--json", "--md"], ["--base", "main"], ["--force"], ["a", "b"], ["--wat"]])
      expect((await cli(argv, root)).code, argv.join(" ")).toBe(2);
  });
});

describe("init and check", () => {
  it("init writes the list, refuses to overwrite, and --force does", async () => {
    const root = app();
    const first = await cli(["init"], root);
    expect(first.code).toBe(0);
    expect(first.stdout).toMatch(
      /^Wrote subprocessors\.json: 2 sub-processors as drafts, 0 set aside/,
    );
    const list = JSON.parse(readFileSync(path.join(root, "subprocessors.json"), "utf8")) as {
      subprocessors: { id: string; status: string }[];
    };
    expect(list.subprocessors.map((e) => `${e.id} ${e.status}`)).toEqual([
      "stripe draft",
      "resend draft",
    ]);
    expect(readFileSync(path.join(root, "subprocessors.json"), "utf8")).not.toMatch(
      /FIXTUREVALUE|PLACEHOLDER/,
    );
    const again = await cli(["init"], root);
    expect(again.code).toBe(1);
    expect(again.stderr).toContain("LIST_EXISTS");
    expect((await cli(["init", "--force"], root)).code).toBe(0);
  });

  it("check passes while the code matches the list, and fails with the duty when a vendor is added", async () => {
    const root = app();
    await cli(["init"], root);
    const same = await cli(["check"], root);
    expect(same.code).toBe(0);
    expect(same.stdout).toContain("No new sub-processors.");
    writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ dependencies: { stripe: "1", resend: "1", openai: "6" } }, null, 2),
    );
    const added = await cli(["check"], root);
    expect(added.code).toBe(1);
    expect(added.stdout).toContain("New sub-processors: 1\n  OpenAI (LLM inference)\n");
    expect(added.stdout).toContain("GDPR Art. 28(2)");
    expect(added.stdout).toContain(HANDOFF_LINE);
    const json = await cli(["check", "--json"], root);
    expect(json.code).toBe(1);
    expect((JSON.parse(json.stdout) as { added: { id: string }[] }).added.map((r) => r.id)).toEqual(
      ["openai"],
    );
  });

  it("check with no list says how to make one; --list reads another file", async () => {
    const root = app();
    const none = await cli(["check"], root);
    expect(none.code).toBe(1);
    expect(none.stderr).toContain("LIST_MISSING: no list at subprocessors.json");
    await cli(["init"], root);
    const moved = path.join(root, "legal.json");
    writeFileSync(moved, readFileSync(path.join(root, "subprocessors.json")));
    expect((await cli(["check", "--list", "legal.json"], root)).code).toBe(0);
    writeFileSync(moved, "{");
    const bad = await cli(["check", "--list", "legal.json"], root);
    expect(bad.code).toBe(1);
    expect(bad.stderr).toContain("LIST_INVALID: legal.json: not JSON");
  });
});

describe("the other commands", () => {
  it("demo, vendors, help and version", async () => {
    const demo = await cli(["demo"], "/");
    expect(demo.stdout).toMatch(/^Synthetic repo, written for this demo: not anyone's code\.\n\n/);
    expect(demo.stdout).toContain("for examples/demo-repo");
    const vendors = await cli(["vendors"], "/");
    expect(vendors.stdout).toContain("Stripe");
    const vj = JSON.parse((await cli(["vendors", "--json"], "/")).stdout) as { vendors: unknown[] };
    expect(vj.vendors.length).toBeGreaterThanOrEqual(60);
    expect((await cli(["--help"], "/")).stdout).toContain(`${INSTALL} check [dir]`);
    expect((await cli(["--version"], "/")).stdout).toMatch(/^\d+\.\d+\.\d+\n$/);
    expect(existsSync(path.join("/", "subprocessors.json"))).toBe(false);
  });
});
