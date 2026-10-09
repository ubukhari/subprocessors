import { describe, expect, it } from "vitest";
import { Index, detect, envKey, normPypi, packageOf, type Hit } from "./detect.js";
import type { RepoFile } from "./walk.js";

const index = new Index();
const run = (files: Record<string, string>) =>
  detect(
    Object.entries(files).map(([path, text]): RepoFile => ({ path, text })),
    index,
  );
const vendors = (hits: Hit[]) => [...new Set(hits.map((h) => h.vendor))].sort();
const brief = (hits: Hit[]) =>
  hits.map(
    (h) =>
      `${h.vendor} ${h.evidence.file}:${h.evidence.line} ${h.evidence.kind} ${h.evidence.what}${h.purpose ? ` [${h.purpose}]` : ""}`,
  );

describe("names", () => {
  it("normalises package names, import specifiers and env names", () => {
    expect(normPypi("Sentry_SDK")).toBe("sentry-sdk");
    expect(normPypi("google.cloud.storage")).toBe("google-cloud-storage");
    expect(packageOf("@scope/pkg/sub/path")).toBe("@scope/pkg");
    expect(packageOf("pkg/sub")).toBe("pkg");
    expect(envKey("NEXT_PUBLIC_STRIPE_KEY")).toBe("STRIPE_KEY");
    expect(envKey("VITE_POSTHOG_KEY")).toBe("POSTHOG_KEY");
    expect(envKey("STRIPE_KEY")).toBe("STRIPE_KEY");
  });

  it("a service's hit replaces its vendor's plain one; prefixes need a name after them", () => {
    expect(index.lookup("npm", "@aws-sdk/client-s3").map((t) => t.purpose)).toEqual([
      "File storage (S3)",
    ]);
    expect(index.lookup("npm", "@aws-sdk/client-ec2").map((t) => [t.vendor.id, t.purpose])).toEqual(
      [["aws", undefined]],
    );
    expect(index.lookup("npm", "@aws-sdk/")).toEqual([]);
    expect(index.lookup("env", "STRIPE_")).toEqual([]);
    expect(index.lookup("env", "STRIPE_SECRET_KEY").map((t) => t.vendor.id)).toEqual(["stripe"]);
    expect(index.lookup("env", "GITHUB_TOKEN").map((t) => t.vendor.id)).toEqual(["github"]);
    expect(index.lookup("env", "DATABASE_URL")).toEqual([]);
    expect(index.lookup("py", "google.cloud.storage").map((t) => t.vendor.id)).toEqual([
      "google-cloud",
    ]);
    expect(index.lookup("py", "googlecloud")).toEqual([]);
    expect(index.lookup("go", "github.com/stripe/stripe-go/v82").map((t) => t.vendor.id)).toEqual([
      "stripe",
    ]);
  });
});

describe("manifests", () => {
  it("package.json: each field, with the line of the key", () => {
    const d = run({
      "package.json": JSON.stringify(
        {
          dependencies: { stripe: "^19", "@sentry/node": "^10", react: "^19" },
          devDependencies: { wrangler: "^4" },
          peerDependencies: { "@anthropic-ai/sdk": "*" },
        },
        null,
        2,
      ),
    });
    expect(brief(d.hits)).toEqual([
      "stripe package.json:3 dependency stripe",
      "sentry package.json:4 dependency @sentry/node",
      "anthropic package.json:11 dependency @anthropic-ai/sdk",
      "cloudflare package.json:8 dev-dependency wrangler",
    ]);
  });

  it("package.json that is not JSON is skipped", () => {
    expect(run({ "package.json": "{ nope" }).hits).toEqual([]);
  });

  it("requirements, pyproject (PEP 621 and Poetry), go.mod and Gemfile", () => {
    const d = run({
      "requirements.txt": "# deps\nstripe==11.0\n-r other.txt\nsentry-sdk[flask]>=2\nflask\n",
      "pyproject.toml": [
        "[project]",
        'name = "app"',
        "dependencies = [",
        '  "anthropic>=0.70",',
        '  "httpx",',
        "]",
        "[project.optional-dependencies]",
        'ai = ["openai>=2"]',
        "[tool.poetry.dependencies]",
        'python = "^3.12"',
        'boto3 = "^1.35"',
      ].join("\n"),
      "go.mod":
        "module x\n\nrequire (\n\tgithub.com/stripe/stripe-go/v82 v82.1.0\n\tgithub.com/getsentry/sentry-go v0.30.0\n)\n",
      Gemfile: "source 'https://rubygems.org'\ngem 'stripe'\ngem \"twilio-ruby\", '~> 7'\n",
    });
    expect(brief(d.hits)).toEqual([
      "stripe requirements.txt:2 dependency stripe",
      "sentry requirements.txt:4 dependency sentry-sdk",
      "anthropic pyproject.toml:4 dependency anthropic",
      "openai pyproject.toml:8 dependency openai",
      "aws pyproject.toml:11 dependency boto3",
      "stripe go.mod:4 dependency github.com/stripe/stripe-go/v82",
      "sentry go.mod:5 dependency github.com/getsentry/sentry-go",
      "stripe Gemfile:2 dependency stripe",
      "twilio Gemfile:3 dependency twilio-ruby",
    ]);
  });
});

describe("code", () => {
  it("JS and TS imports: static, side-effect, require and dynamic; subpaths; never relative ones", () => {
    const d = run({
      "src/a.ts": [
        'import Stripe from "stripe";',
        "import '@sentry/nextjs';",
        'const { Resend } = require("resend");',
        'const ai = await import("@ai-sdk/anthropic");',
        'import { drizzle } from "drizzle-orm/neon-http";',
        'import { x } from "./stripe";',
        'import { put } from "@vercel/blob";',
        'import GitHub from "next-auth/providers/github";',
      ].join("\n"),
    });
    expect(brief(d.hits)).toEqual([
      "stripe src/a.ts:1 import stripe",
      "sentry src/a.ts:2 import @sentry/nextjs",
      "resend src/a.ts:3 import resend",
      "anthropic src/a.ts:4 import @ai-sdk/anthropic",
      "neon src/a.ts:5 import drizzle-orm/neon-http",
      "vercel src/a.ts:7 import @vercel/blob [File storage (Vercel Blob)]",
      "github src/a.ts:8 import next-auth/providers/github [Sign in with GitHub]",
    ]);
  });

  it("Python and Go imports", () => {
    const d = run({
      "app/main.py":
        "import os, stripe\nfrom sentry_sdk import init\nfrom google.cloud import storage\nimport requests\n",
      "cmd/main.go": 'import (\n\t"fmt"\n\t"github.com/stripe/stripe-go/v82/client"\n)\n',
    });
    expect(brief(d.hits)).toEqual([
      "stripe app/main.py:1 import stripe",
      "sentry app/main.py:2 import sentry_sdk",
      "google-cloud app/main.py:3 import google.cloud",
      "stripe cmd/main.go:3 import github.com/stripe/stripe-go/v82/client",
    ]);
  });

  it("API hosts in string literals, but not in comments or longer hosts", () => {
    const d = run({
      "src/a.ts": [
        'await fetch("https://api.resend.com/emails");',
        "// see https://api.stripe.com/v1 for the docs",
        'const hook = "https://hooks.slack.com/services/T0/B0/x";',
        'const notIt = "https://api.resend.com.evil.example";',
        'const alsoNot = "https://myapi.resend.company";',
        'await fetch("https://discord.com/api/webhooks/1/abc");',
      ].join("\n"),
    });
    expect(brief(d.hits)).toEqual([
      "resend src/a.ts:1 host api.resend.com",
      "slack src/a.ts:3 host hooks.slack.com",
      "discord src/a.ts:6 host discord.com/api/webhooks",
    ]);
  });

  it("a host as a bare string, as in a table of hosts, is a mention, not a call", () => {
    const d = run({
      "src/hosts.ts": 'export const HOSTS = [\n  "api.openai.com",\n  "api.mistral.ai",\n];\n',
    });
    expect(brief(d.hits)).toEqual([
      "openai src/hosts.ts:2 mention api.openai.com",
      "mistral src/hosts.ts:3 mention api.mistral.ai",
    ]);
  });

  it("env names from every common accessor, with public prefixes removed; never a value", () => {
    const d = run({
      "src/a.ts": [
        "const a = process.env.STRIPE_SECRET_KEY;",
        'const b = process.env["RESEND_API_KEY"];',
        "const c = import.meta.env.VITE_POSTHOG_KEY;",
        "const d = env.OPENAI_API_KEY;",
        "const e = process.env.DATABASE_URL;",
        "const f = process.env.NEXT_PUBLIC_SENTRY_DSN;",
      ].join("\n"),
      "app/x.py":
        'os.environ["ANTHROPIC_API_KEY"]\nos.getenv("MISTRAL_API_KEY")\nos.environ.get("GROQ_API_KEY")\n',
      "cmd/x.go": 'key := os.Getenv("TWILIO_AUTH_TOKEN")\n',
      "deno/x.ts": 'Deno.env.get("CLERK_SECRET_KEY")\n',
      "lib/x.rb": "ENV['SENDGRID_API_KEY']\nENV.fetch(\"POSTMARK_API_TOKEN\")\n",
    });
    expect(brief(d.hits)).toEqual([
      "stripe src/a.ts:1 env STRIPE_SECRET_KEY",
      "resend src/a.ts:2 env RESEND_API_KEY",
      "posthog src/a.ts:3 env VITE_POSTHOG_KEY",
      "openai src/a.ts:4 env OPENAI_API_KEY",
      "sentry src/a.ts:6 env NEXT_PUBLIC_SENTRY_DSN",
      "anthropic app/x.py:1 env ANTHROPIC_API_KEY",
      "mistral app/x.py:2 env MISTRAL_API_KEY",
      "groq app/x.py:3 env GROQ_API_KEY",
      "twilio cmd/x.go:1 env TWILIO_AUTH_TOKEN",
      "clerk deno/x.ts:1 env CLERK_SECRET_KEY",
      "sendgrid lib/x.rb:1 env SENDGRID_API_KEY",
      "postmark lib/x.rb:2 env POSTMARK_API_TOKEN",
    ]);
  });

  it("skips minified lines", () => {
    expect(run({ "src/min.js": `${"x".repeat(2100)} require("stripe")` }).hits).toEqual([]);
  });
});

describe("config and infrastructure", () => {
  it("example env files: names only", () => {
    const d = run({
      ".env.example": "\nSTRIPE_SECRET_KEY=\nDATABASE_URL=\nNEXT_PUBLIC_POSTHOG_KEY=\n",
    });
    expect(brief(d.hits)).toEqual([
      "stripe .env.example:2 env STRIPE_SECRET_KEY",
      "posthog .env.example:4 env NEXT_PUBLIC_POSTHOG_KEY",
    ]);
  });

  it("vercel.json: the file, its regions and its env names", () => {
    const d = run({
      "vercel.json": JSON.stringify(
        { regions: ["fra1", "zzz9"], env: { RESEND_API_KEY: "@resend" } },
        null,
        2,
      ),
    });
    expect(brief(d.hits)).toEqual([
      "vercel vercel.json:1 config vercel.json",
      "resend vercel.json:7 env RESEND_API_KEY",
    ]);
    expect(d.regions).toEqual([
      { vendor: "vercel", region: "fra1 (Frankfurt)", file: "vercel.json", line: 2 },
      { vendor: "vercel", region: "zzz9", file: "vercel.json", line: 2 },
    ]);
  });

  it("wrangler: the file and its [vars] names", () => {
    const d = run({
      "apps/w/wrangler.toml":
        'name = "w"\n[vars]\nSENTRY_DSN = "x"\nPLAIN = "y"\n[[kv_namespaces]]\nbinding = "KV"\n',
      "apps/v/wrangler.jsonc": '{\n  "name": "v",\n  "vars": { "OPENAI_BASE": "x" }\n}\n',
    });
    expect(brief(d.hits)).toEqual([
      "cloudflare apps/w/wrangler.toml:1 config wrangler.toml",
      "sentry apps/w/wrangler.toml:3 env SENTRY_DSN",
      "cloudflare apps/v/wrangler.jsonc:1 config wrangler.jsonc",
      "openai apps/v/wrangler.jsonc:3 env OPENAI_BASE",
    ]);
  });

  it("Terraform providers with their region, Fly and Render regions, Serverless providers", () => {
    const d = run({
      "infra/main.tf": [
        'provider "aws" {',
        '  region = "eu-west-1"',
        "  default_tags {",
        '    tags = { app = "x" }',
        "  }",
        "}",
        'provider "random" {}',
        'provider "cloudflare" {',
        "}",
        'resource "aws_s3_bucket" "b" {',
        '  region = "us-east-1"',
        "}",
      ].join("\n"),
      "fly.toml": 'app = "x"\nprimary_region = "ams"\n',
      "render.yaml": "services:\n  - type: web\n    region: frankfurt\n",
      "serverless.yml": "service: x\nprovider:\n  name: aws\n  region: eu-central-1\n",
    });
    expect(brief(d.hits)).toEqual([
      'aws infra/main.tf:1 terraform provider "aws"',
      'cloudflare infra/main.tf:8 terraform provider "cloudflare"',
      "fly fly.toml:1 config fly.toml",
      "render render.yaml:1 config render.yaml",
      "aws serverless.yml:2 config provider aws",
    ]);
    expect(d.regions.map((r) => `${r.vendor} ${r.region} ${r.file}:${r.line}`)).toEqual([
      "aws eu-west-1 infra/main.tf:2",
      "fly ams fly.toml:2",
      "render frankfurt render.yaml:3",
      "aws eu-central-1 serverless.yml:4",
    ]);
  });

  it("Dockerfile ENV and ARG names, workflow secrets, and infrastructure files by path", () => {
    const d = run({
      Dockerfile:
        "FROM node:22\nARG SENTRY_AUTH_TOKEN\nENV NODE_ENV=production STRIPE_PUBLISHABLE_KEY=pk\n",
      ".github/workflows/deploy.yml":
        "env:\n  VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}\n  X: ${{ vars.ALGOLIA_APP_ID }}\n",
      ".github/workflows/ci.yml": "on: push\n",
      "supabase/config.toml": 'project_id = "x"\n',
      "apps/api/.actor/actor.json": "{}",
    });
    expect(brief(d.hits)).toEqual([
      "sentry Dockerfile:2 env SENTRY_AUTH_TOKEN",
      "stripe Dockerfile:3 env STRIPE_PUBLISHABLE_KEY",
      "github .github/workflows:0 config .github/workflows",
      "vercel .github/workflows/deploy.yml:2 env VERCEL_TOKEN",
      "algolia .github/workflows/deploy.yml:3 env ALGOLIA_APP_ID",
      "supabase supabase/config.toml:1 config supabase/config.toml",
      "apify apps/api/.actor/actor.json:1 config .actor/actor.json",
    ]);
  });

  it("finds nothing in an unrelated config.toml or app.yaml", () => {
    expect(run({ "config.toml": "x = 1\n", "app.yaml": "runtime: x\n" }).hits).toEqual([]);
  });
});

describe("the whole detection", () => {
  it("counts one piece of evidence once per vendor, file, line and name", () => {
    const d = run({ "src/a.ts": 'import Stripe from "stripe"; import S2 from "stripe";\n' });
    expect(d.hits).toHaveLength(1);
  });

  it("finds every vendor across file kinds", () => {
    const d = run({
      "package.json": '{"dependencies":{"@clerk/nextjs":"^6"}}',
      "src/x.ts": 'import { Pinecone } from "@pinecone-database/pinecone";',
      "app.py": "import langfuse\n",
    });
    expect(vendors(d.hits)).toEqual(["clerk", "langfuse", "pinecone"]);
  });
});
