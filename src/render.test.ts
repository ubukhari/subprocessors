import { describe, expect, it } from "vitest";
import { checkAgainstBase } from "./list.js";
import {
  annotations,
  evidenceText,
  renderCheck,
  renderMarkdown,
  shortDate,
  weakWhy,
} from "./render.js";
import { scanFiles, type Row } from "./scan.js";

const NOW = new Date("2026-10-09T12:00:00Z");
const report = (files: Record<string, string>) =>
  scanFiles(
    Object.entries(files).map(([path, text]) => ({ path, text })),
    { shown: ".", now: NOW },
  );

describe("render", () => {
  it("dates and evidence", () => {
    expect(shortDate("2026-10-09")).toBe("9 Oct 2026");
    expect(shortDate("2027-01-31")).toBe("31 Jan 2027");
    expect(
      evidenceText({ file: "package.json", line: 3, kind: "dependency", what: "stripe" }),
    ).toBe("package.json:3 (dependency stripe)");
    expect(
      evidenceText({ file: "vercel.json", line: 1, kind: "config", what: "vercel.json" }),
    ).toBe("vercel.json:1 (config)");
    expect(
      evidenceText({
        file: ".github/workflows",
        line: 0,
        kind: "config",
        what: ".github/workflows",
      }),
    ).toBe(".github/workflows (config)");
  });

  it("says why a row is weak", () => {
    const row = (kinds: Row["evidence"][number]["kind"][]) =>
      ({ evidence: kinds.map((kind) => ({ file: "f", line: 1, kind, what: "x" })) }) as Row;
    expect(weakWhy(row(["env"]))).toBe("from env names only: confirm it is used in production");
    expect(weakWhy(row(["dev-dependency"]))).toBe(
      "from a dev dependency only: confirm it is used in production",
    );
    expect(weakWhy(row(["env", "dev-dependency", "mention"]))).toBe(
      "from env names, a dev dependency and a host named without a call only: confirm it is used in production",
    );
  });

  it("Markdown escapes pipes and marks what to remove before publishing", () => {
    const r = report({ "package.json": '{"dependencies":{"stripe":"1"}}' });
    r.subprocessors[0]!.purpose = "Payments | billing";
    const md = renderMarkdown(r);
    expect(md).toContain("| Stripe | Payments \\| billing |");
    expect(md).toContain("Detected from (remove this part before publishing):");
    expect(md.startsWith("<!-- Drafted by subprocessors")).toBe(true);
  });

  it("a check's text names what was added and removed", () => {
    const c = checkAgainstBase(
      report({ "package.json": '{"dependencies":{"resend":"1"}}' }),
      report({ "package.json": '{"dependencies":{"@sentry/node":"1"}}' }),
      "origin/main",
    );
    const text = renderCheck(c);
    expect(text).toMatch(
      /^subprocessors \S+ check: \. against the code at origin\/main \(9 Oct 2026\)/,
    );
    expect(text).toContain("New sub-processors: 1\n  Resend (Transactional email)\n");
    expect(text).toContain("No longer seen in the code: Sentry.");
    const named = renderCheck(
      checkAgainstBase(report({ "src/h.ts": '["api.groq.com"]' }), report({}), "HEAD"),
    );
    expect(named).toContain("No new sub-processors.");
    expect(named.replace(/\s+/g, " ")).toContain(
      "New, named in the code but not shown to be used (confirm; not counted): Groq (src/h.ts:1 (host named api.groq.com))",
    );
  });
});

describe("annotations", () => {
  it("a warning (or an error) on the line that brought each new vendor in, escaped", () => {
    const c = checkAgainstBase(
      report({ "src/a,b.ts": 'import Stripe from "stripe";' }),
      report({}),
      "HEAD",
    );
    const [line] = annotations(c, { prefix: "apps/web", fail: false });
    expect(line).toMatch(
      /^::warning file=apps\/web\/src\/a%2Cb\.ts,line=1,title=New sub-processor%3A Stripe::Stripe \(Payments and billing\) is a new sub-processor\./,
    );
    expect(annotations(c, { prefix: ".", fail: true })[0]).toMatch(
      /^::error file=src\/a%2Cb\.ts,line=1,/,
    );
  });

  it("a directory has no line", () => {
    const c = checkAgainstBase(
      report({ ".github/workflows/x.yml": "", "package.json": '{"dependencies":{"stripe":"1"}}' }),
      report({}),
      "HEAD",
    );
    expect(c.added_probably_not[0]!.evidence[0]!.line).toBe(0);
  });
});
