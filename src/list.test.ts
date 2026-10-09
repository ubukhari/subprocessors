import { describe, expect, it } from "vitest";
import { CliError } from "./errors.js";
import { DUTY, checkAgainstBase, checkAgainstList, listFrom, parseList } from "./list.js";
import { scanFiles } from "./scan.js";

const NOW = new Date("2026-10-09T12:00:00Z");
const report = (deps: Record<string, string>, extra: Record<string, string> = {}) =>
  scanFiles(
    [
      { path: "package.json", text: JSON.stringify({ dependencies: deps }, null, 2) },
      ...Object.entries(extra).map(([path, text]) => ({ path, text })),
    ],
    { shown: ".", now: NOW },
  );

describe("listFrom", () => {
  it("drafts every sub-processor and sets the rest aside with a reason", () => {
    const list = listFrom(
      report({ stripe: "1", "@neondatabase/serverless": "1" }, { ".github/workflows/ci.yml": "" }),
    );
    expect(list.updated).toBe("2026-10-09");
    expect(list.about).toMatch(/not legal advice/);
    expect(list.subprocessors.map((e) => [e.id, e.status, e.since])).toEqual([
      ["neon", "draft", "2026-10-09"],
      ["stripe", "draft", "2026-10-09"],
    ]);
    expect(list.subprocessors[1]).toMatchObject({
      name: "Stripe",
      dpa: "https://stripe.com/legal/dpa",
      region: "not in code: check your Stripe settings",
      detected_from: ["package.json:3"],
    });
    expect(list.not_subprocessors).toEqual([
      {
        id: "github",
        name: "GitHub",
        reason: expect.stringMatching(/Usually not a sub-processor/),
      },
    ]);
  });
});

describe("parseList", () => {
  it("accepts what init writes", () => {
    const list = listFrom(report({ stripe: "1" }));
    expect(parseList(JSON.stringify(list), "subprocessors.json")).toEqual(list);
  });

  it("names the file and the problem", () => {
    const bad = (text: string) => {
      try {
        parseList(text, "subprocessors.json");
      } catch (e) {
        expect(e).toBeInstanceOf(CliError);
        return (e as CliError).cause;
      }
      return "no error";
    };
    expect(bad("{")).toMatch(/^subprocessors\.json: not JSON/);
    expect(bad("[]")).toBe("subprocessors.json: not an object");
    expect(bad("{}")).toBe("subprocessors.json: `subprocessors` is not a list");
    expect(bad('{"subprocessors":[],"not_subprocessors":{}}')).toBe(
      "subprocessors.json: `not_subprocessors` is not a list",
    );
    expect(bad('{"subprocessors":[{"name":"x"}]}')).toBe(
      "subprocessors.json: entry 1 has no lower-case-dashed `id`",
    );
    expect(bad('{"subprocessors":[{"id":"a"},{"id":"a"}]}')).toBe(
      "subprocessors.json: `a` is listed twice",
    );
  });
});

describe("checkAgainstList", () => {
  const committed = listFrom(report({ stripe: "1" }, { ".github/workflows/ci.yml": "" }));
  committed.subprocessors.push({
    id: "google-workspace",
    name: "Google Workspace",
    purpose: "Email and documents",
    data: "Customer emails",
    region: "EU",
    dpa: null,
    status: "confirmed",
    since: "2026-01-01",
  });

  it("a vendor the code now uses and the list lacks is added; the duty is stated", () => {
    const c = checkAgainstList(
      report({ stripe: "1", "@anthropic-ai/sdk": "1" }, { ".github/workflows/ci.yml": "" }),
      committed,
      "subprocessors.json",
    );
    expect(c.added.map((r) => r.id)).toEqual(["anthropic"]);
    expect(c.added_probably_not).toEqual([]);
    expect(c.removed).toEqual([]);
    expect(c.duty).toBe(DUTY);
    expect(c.against).toEqual({ kind: "list", file: "subprocessors.json" });
  });

  it("a listed catalog vendor no longer in the code is removed; a hand-added one never is", () => {
    const c = checkAgainstList(report({}), committed, "subprocessors.json");
    expect(c.added).toEqual([]);
    expect(c.removed).toEqual([{ id: "stripe", name: "Stripe" }]);
  });

  it("a new vendor that is usually not a sub-processor is shown apart", () => {
    const c = checkAgainstList(
      report({ stripe: "1" }, { ".github/workflows/ci.yml": "" }),
      { ...committed, not_subprocessors: [] },
      "subprocessors.json",
    );
    expect(c.added).toEqual([]);
    expect(c.added_probably_not.map((r) => r.id)).toEqual(["github"]);
  });
});

describe("checkAgainstBase", () => {
  it("compares two drafts of the same directory", () => {
    const c = checkAgainstBase(
      report({ stripe: "1", resend: "1" }),
      report({ stripe: "1", "@sentry/node": "1" }),
      "origin/main",
    );
    expect(c.added.map((r) => r.id)).toEqual(["resend"]);
    expect(c.added_named).toEqual([]);
    expect(c.removed).toEqual([{ id: "sentry", name: "Sentry" }]);
  });

  it("a vendor the change only names is shown to confirm, not counted", () => {
    const c = checkAgainstBase(
      report(
        { stripe: "1" },
        { "src/hosts.ts": '["api.groq.com"]', ".env.example": "SLACK_URL=\n" },
      ),
      report({ stripe: "1" }),
      "origin/main",
    );
    expect(c.added).toEqual([]);
    expect(c.added_named.map((r) => r.id)).toEqual(["groq", "slack"]);
    expect(c.against).toEqual({ kind: "base", ref: "origin/main" });
  });
});
