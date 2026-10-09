import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CATALOG, catalogProblems, dataGuess, vendorById, type Catalog } from "./catalog.js";

const canonical = new URL(
  "../../agentcheck/src/app/subprocessors/_data/vendors.json",
  import.meta.url,
);

describe("the bundled catalog", () => {
  it("has no problems", () => {
    expect(catalogProblems(CATALOG)).toEqual([]);
  });

  // agentcheck's copy exists only in the monorepo; the public repo has no agentcheck beside it
  it.skipIf(!existsSync(canonical))(
    "is the copy agentcheck's pages are built from (`pnpm --filter subprocessors data`)",
    () => {
      expect(JSON.parse(readFileSync(canonical, "utf8"))).toEqual(CATALOG);
    },
  );

  it("covers the stacks the door is for, and links most DPAs", () => {
    expect(CATALOG.vendors.length).toBeGreaterThanOrEqual(60);
    for (const id of [
      "vercel",
      "cloudflare",
      "aws",
      "neon",
      "supabase",
      "stripe",
      "resend",
      "anthropic",
      "openai",
      "sentry",
      "posthog",
      "clerk",
      "github",
    ])
      expect(vendorById(id), id).toBeDefined();
    const linked = CATALOG.vendors.filter((v) => v.dpa).length;
    expect(linked / CATALOG.vendors.length).toBeGreaterThan(0.6);
  });

  it("every category is used and has a data guess", () => {
    for (const [id, c] of Object.entries(CATALOG.categories)) {
      expect(c.data.length, id).toBeGreaterThan(10);
      expect(
        CATALOG.vendors.some((v) => v.category === id),
        id,
      ).toBe(true);
    }
    for (const v of CATALOG.vendors) expect(dataGuess(v).length, v.id).toBeGreaterThan(10);
  });

  it("only GitHub is set apart as usually not a sub-processor, with the reason", () => {
    const tooling = CATALOG.vendors.filter((v) => v.kind === "tooling");
    expect(tooling.map((v) => v.id)).toEqual(["github"]);
    expect(tooling[0]!.note).toMatch(/Usually not a sub-processor/);
  });

  it("a vendor that changed hands says so (read 9 Oct 2026)", () => {
    expect(vendorById("neon")!.note).toMatch(/Databricks/);
    expect(vendorById("langfuse")!.note).toMatch(/ClickHouse/);
  });
});

describe("catalogProblems", () => {
  const base = (): Catalog => ({
    updated: "2026-10-09",
    about: "",
    categories: { x: { label: "X", data: "some data here" } },
    vendors: [
      {
        id: "a",
        name: "A",
        category: "x",
        kind: "likely",
        purpose: "p",
        dpa: "https://a.example/dpa",
        list: null,
        seen: "2026-10-09",
        match: { npm: ["aa"] },
      },
    ],
  });

  it("names each problem", () => {
    expect(catalogProblems(base())).toEqual([]);
    const c = base();
    c.vendors.push({ ...c.vendors[0]!, category: "nope", dpa: "http://insecure", match: {} });
    c.vendors.push({ ...c.vendors[0]!, id: "B_bad", match: { npm: ["xx"], wat: ["y"] } as never });
    const problems = catalogProblems(c);
    expect(problems).toContain("vendor a: duplicate id");
    expect(problems).toContain("vendor a: unknown category nope");
    expect(problems).toContain("vendor a: bad link http://insecure");
    expect(problems).toContain("vendor a: nothing matches it");
    expect(problems).toContain("vendor B_bad: id is not lower-case-dashed");
    expect(problems).toContain("vendor B_bad: unknown matcher wat");
  });
});
