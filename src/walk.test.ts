import { symlinkSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fixtureRepo } from "./fixture.js";
import { envNamesOnly, isEnvFile, isExampleEnv, walk } from "./walk.js";

/** A value shaped like a secret; it must never reach anything the walk returns. */
const SECRET = "sk_live_FIXTUREVALUE0000000000";

describe("env files", () => {
  it("tells example env files from real ones by name", () => {
    for (const n of [
      ".env.example",
      ".env.local.example",
      "env.example",
      ".env.sample",
      ".dev.vars.example",
      "example.env",
      ".env.template",
    ])
      expect(isExampleEnv(n), n).toBe(true);
    for (const n of [
      ".env",
      ".env.local",
      ".env.production",
      ".dev.vars",
      "prod.env",
      ".env.development.local",
    ]) {
      expect(isEnvFile(n), n).toBe(true);
      expect(isExampleEnv(n), n).toBe(false);
    }
    for (const n of ["env.ts", "environment.ts", "package.json"])
      expect(isEnvFile(n), n).toBe(false);
  });

  it("an example file keeps its names and loses every value", () => {
    expect(
      envNamesOnly(
        `# comment\nSTRIPE_SECRET_KEY=${SECRET}\nexport RESEND_API_KEY="x"\n\nnot a line`,
      ),
    ).toBe("\nSTRIPE_SECRET_KEY=\nRESEND_API_KEY=\n\n");
  });

  it("never opens a real env file, lists it as skipped, and drops example values", async () => {
    const root = fixtureRepo({
      ".env": `STRIPE_SECRET_KEY=${SECRET}\n`,
      ".env.local": `ANTHROPIC_API_KEY=${SECRET}\n`,
      "apps/web/.dev.vars": `OPENAI_API_KEY=${SECRET}\n`,
      ".env.example": `STRIPE_SECRET_KEY=${SECRET}\n`,
      "package.json": "{}",
    });
    const w = await walk(root);
    expect(w.skippedEnv).toEqual([".env", ".env.local", "apps/web/.dev.vars"]);
    expect(w.files.map((f) => f.path)).toEqual([".env.example", "package.json"]);
    expect(JSON.stringify(w)).not.toContain(SECRET);
    expect(w.files[0]!.text).toBe("STRIPE_SECRET_KEY=\n");
  });
});

describe("walk", () => {
  it("reads manifests, code, infrastructure and workflows; skips dependencies, builds and dot-folders", async () => {
    const root = fixtureRepo({
      "package.json": "{}",
      "requirements.txt": "stripe\n",
      "requirements-dev.txt": "pytest\n",
      "pyproject.toml": "",
      "go.mod": "",
      Gemfile: "",
      "vercel.json": "{}",
      "wrangler.toml": "",
      "infra/main.tf": "",
      Dockerfile: "",
      "docker/api.Dockerfile": "",
      ".github/workflows/ci.yml": "",
      ".github/dependabot.yml": "",
      "supabase/config.toml": "",
      "src/a.ts": "",
      "src/b.d.ts": "",
      "src/c.py": "",
      "README.md": "",
      "node_modules/stripe/package.json": "{}",
      "dist/index.js": "",
      ".next/server.js": "",
      ".git/config": "",
      ".claude/worktrees/x/package.json": "{}",
      "vendor/lib.rb": "",
    });
    const w = await walk(root);
    expect(w.files.map((f) => f.path)).toEqual([
      ".github/workflows/ci.yml",
      "Dockerfile",
      "Gemfile",
      "docker/api.Dockerfile",
      "go.mod",
      "infra/main.tf",
      "package.json",
      "pyproject.toml",
      "requirements-dev.txt",
      "requirements.txt",
      "src/a.ts",
      "src/c.py",
      "supabase/config.toml",
      "vercel.json",
      "wrangler.toml",
    ]);
  });

  it("skips tests, fixtures and examples below the root unless asked", async () => {
    const root = fixtureRepo({
      "src/a.ts": "",
      "src/a.test.ts": "",
      "src/a.spec.tsx": "",
      "src/__tests__/b.ts": "",
      "test/c.ts": "",
      "fixtures/package.json": "{}",
      "examples/demo/package.json": "{}",
      "pkg/thing_test.go": "",
      "pkg/test_thing.py": "",
      "src/fake-providers.ts": "",
      "src/mocks.ts": "",
    });
    const w = await walk(root);
    expect(w.files.map((f) => f.path)).toEqual(["src/a.ts"]);
    expect(w.skippedTests).toBe(10);
    const all = await walk(root, { includeTests: true });
    expect(all.files).toHaveLength(11);
    expect(all.skippedTests).toBe(0);
  });

  it("skips files over the size limit and symlinks, and stops at the file limit", async () => {
    const root = fixtureRepo({ "a.ts": "x".repeat(2000), "b.ts": "", "c.ts": "", "d.ts": "" });
    symlinkSync(path.join(root, "b.ts"), path.join(root, "link.ts"));
    const w = await walk(root, { maxBytes: 1000 });
    expect(w.skippedLarge).toEqual(["a.ts"]);
    expect(w.files.map((f) => f.path)).toEqual(["b.ts", "c.ts", "d.ts"]);
    const capped = await walk(root, { maxFiles: 2 });
    expect(capped.files).toHaveLength(2);
    expect(capped.truncated).toBe(true);
  });

  it("returns nothing for a missing directory rather than throwing", async () => {
    const w = await walk(path.join(fixtureRepo({}), "nope"));
    expect(w.files).toEqual([]);
  });
});
