import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HANDOFF_LINE } from "./handoff.js";
import { DRAFT_NOTICE, OUTSIDE_CODE, scanDir, scanFiles, vendorIds } from "./scan.js";

const NOW = new Date("2026-10-09T12:00:00Z");
const DEMO = fileURLToPath(new URL("../examples/demo-repo", import.meta.url));

describe("the demo repo's draft", async () => {
  const report = await scanDir(DEMO, { shown: "examples/demo-repo", now: NOW });

  it("lists every vendor its code uses, in catalog order, and sets GitHub apart", () => {
    expect(report.subprocessors.map((r) => r.id)).toEqual([
      "vercel",
      "aws",
      "neon",
      "stripe",
      "resend",
      "anthropic",
      "sentry",
      "posthog",
      "slack",
    ]);
    expect(report.probably_not.map((r) => r.id)).toEqual(["github"]);
  });

  it("does not list a vendor only a skipped test imports", () => {
    expect(vendorIds(report)).not.toContain("openai");
    expect(report.not_read.tests_skipped).toBe(1);
  });

  it("each row: purposes, the region where the code says it, links, and every piece of evidence", () => {
    const by = Object.fromEntries(report.subprocessors.map((r) => [r.id, r]));
    expect(by.vercel).toMatchObject({
      purpose: "Hosting and serverless functions; Web analytics (Vercel Analytics)",
      region: "fra1 (Frankfurt)",
      region_from: "vercel.json:3",
      dpa: "https://vercel.com/legal/dpa",
      confidence: "high",
    });
    expect(by.aws).toMatchObject({
      purpose: "Cloud infrastructure; File storage (S3)",
      region: "eu-central-1",
      region_from: "infra/main.tf:3",
    });
    expect(by.neon!.region).toBeNull();
    expect(by.resend!.evidence.map((e) => `${e.kind} ${e.file}:${e.line}`)).toEqual([
      "host src/lib/email.ts:3",
      "env .env.example:8",
      "env src/lib/email.ts:6",
    ]);
    // Slack is only named by env variables: medium confidence, to confirm
    expect(by.slack!.confidence).toBe("medium");
    expect(by.stripe!.note).toMatch(/30 days/);
  });

  it("says it is a draft, what it cannot see, and the hand-off", () => {
    expect(report.draft).toBe(true);
    expect(report.notice).toBe(DRAFT_NOTICE);
    expect(report.notice).toMatch(/not legal advice/);
    expect(report.outside_code).toBe(OUTSIDE_CODE);
    expect(report.handoff.line).toBe(HANDOFF_LINE);
    expect(report.scanned_on).toBe("2026-10-09");
    expect(report.not_read.env_files).toEqual([]);
  });
});

describe("scanFiles", () => {
  it("an empty repo has no rows", () => {
    const r = scanFiles([{ path: "README.md", text: "# hi" }], { shown: ".", now: NOW });
    expect(r.subprocessors).toEqual([]);
    expect(r.probably_not).toEqual([]);
    expect(r.files_read).toBe(1);
  });

  it("a vendor only named as a bare host has medium confidence", () => {
    const r = scanFiles([{ path: "src/hosts.ts", text: '["api.groq.com"]' }], {
      shown: ".",
      now: NOW,
    });
    expect(r.subprocessors.map((x) => [x.id, x.confidence])).toEqual([["groq", "medium"]]);
  });

  it("a vendor seen only in a dev dependency has medium confidence", () => {
    const r = scanFiles([{ path: "package.json", text: '{"devDependencies":{"openai":"^6"}}' }], {
      shown: ".",
      now: NOW,
    });
    expect(r.subprocessors.map((x) => [x.id, x.confidence])).toEqual([["openai", "medium"]]);
  });
});
