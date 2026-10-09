#!/usr/bin/env node

// src/main.ts
import { existsSync } from "fs";
import { readFile as readFile2, stat, writeFile } from "fs/promises";
import path3 from "path";
import { fileURLToPath } from "url";
import { parseArgs } from "util";

// src/errors.ts
var CliError = class extends Error {
  code;
  cause;
  fix;
  retryable;
  /** 2 for a usage mistake, 1 for anything else */
  exitCode;
  constructor(p, exitCode = 1) {
    super(`${p.code}: ${p.cause}`);
    this.name = "CliError";
    this.code = p.code;
    this.cause = p.cause;
    this.fix = p.fix;
    this.retryable = p.retryable;
    this.exitCode = exitCode;
  }
  toJSON() {
    return { code: this.code, cause: this.cause, fix: this.fix, retryable: this.retryable };
  }
};
function usage(cause, fix) {
  return new CliError({ code: "BAD_ARGUMENTS", cause, fix, retryable: false }, 2);
}

// src/git.ts
import { execFile } from "child_process";
import { mkdtemp, mkdir, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
var execQuiet = (cmd, args, cwd) => new Promise((resolve, reject) => {
  execFile(cmd, args, { cwd, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
    if (err) reject(new Error(String(stderr).trim() || err.message));
    else resolve(String(stdout));
  });
});
var REF = /^[A-Za-z0-9_][A-Za-z0-9_./~^@{}-]*$/;
function gitError(cause, fix) {
  return new CliError({ code: "GIT_FAILED", cause, fix, retryable: false });
}
async function snapshotAt(dir, ref, exec = execQuiet) {
  if (!REF.test(ref))
    throw gitError(
      `"${ref}" is not a git ref this command accepts`,
      "pass a branch, tag or commit, e.g. `--base origin/main` or `--base HEAD~1`"
    );
  try {
    await exec("git", ["rev-parse", "--show-prefix"], dir);
  } catch (e) {
    throw gitError(
      `${dir} is not inside a git repository (${e instanceof Error ? e.message : String(e)})`,
      "run `check --base` in a git checkout, or compare with a committed list instead (`check --list subprocessors.json`)"
    );
  }
  try {
    await exec("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], dir);
  } catch {
    throw gitError(
      `git does not know the ref "${ref}" here`,
      "fetch it first (in Actions, `actions/checkout` with `fetch-depth: 0`), or pass a commit sha"
    );
  }
  const tmp = await mkdtemp(path.join(tmpdir(), "subprocessors-base-"));
  const cleanup = () => rm(tmp, { recursive: true, force: true });
  try {
    const tar = path.join(tmp, "base.tar");
    const tree = path.join(tmp, "tree");
    await mkdir(tree);
    await exec("git", ["archive", "--format=tar", "-o", tar, ref], dir);
    await exec("tar", ["-xf", tar, "-C", tree], dir);
    return { dir: tree, cleanup };
  } catch (e) {
    await cleanup();
    throw gitError(
      `could not read ${ref} with git archive (${e instanceof Error ? e.message : String(e)})`,
      "check that the directory existed at that ref, or compare with a committed list instead"
    );
  }
}

// src/handoff.ts
var PAGES_URL = "https://agentwares-agentcheck.vercel.app/subprocessors";
var REF2 = "subprocessors";
var HANDOFF_URL = `${PAGES_URL}?ref=${REF2}#ledger`;
var HANDOFF_LINE = "A hosted, dated sub-processor page that emails your customers each change is not built.";
var HANDOFF_DETAIL = "It would publish the list you approved at a public URL, keep every change with its date, email your subscribers the notice with the day their objection window closes, and record who was told when. agentcheck runs scheduled checks of endpoints today; this is not one of them. If you would pay for it, say so with one click:";

// src/install.ts
var ON_NPM = false;
var NAME = "subprocessors";
var REPO = `https://github.com/agentwares/${NAME}`;
var INSTALL = ON_NPM ? `npx ${NAME}` : `npx --allow-git=root github:agentwares/${NAME}`;
var RUN = ON_NPM ? `npx -y ${NAME}@latest` : `npx -y --allow-git=root github:agentwares/${NAME}`;

// src/data/vendors.json
var vendors_default = {
  updated: "2026-10-09",
  about: "Vendors a codebase can show it sends data to, with what each is usually engaged for, a guess at the personal data it receives, its data processing agreement and its own sub-processor list. Every link was fetched on the day in `seen` and answered or redirected to the vendor's trust center; a link that could not be found is null. A draft aid, not legal advice: whether a vendor is your sub-processor depends on what data you send it and on your contracts.",
  categories: {
    hosting: {
      label: "Hosting",
      data: "Everything your app serves and handles while it runs there, including request logs with IP addresses"
    },
    infrastructure: {
      label: "Cloud infrastructure",
      data: "Depends on the services you use: anything you store or process there"
    },
    database: { label: "Database", data: "All personal data your app stores" },
    cache: {
      label: "Cache and queues",
      data: "Whatever you cache or queue: sessions, rate-limit keys, job payloads"
    },
    storage: { label: "File storage", data: "Files and media your users upload" },
    payments: {
      label: "Payments",
      data: "Customers' names, email and billing addresses; card details, which the vendor holds"
    },
    email: {
      label: "Email delivery",
      data: "Recipients' names and email addresses, and message content"
    },
    sms: { label: "SMS and voice", data: "Phone numbers and message content" },
    llm: {
      label: "LLM inference",
      data: "Prompts and outputs, and any personal data users or your app put in them"
    },
    "ai-media": {
      label: "AI speech and media",
      data: "Audio, images or text you send, and any personal data in them"
    },
    vector: {
      label: "Vector database",
      data: "Embeddings and the metadata you store with them, which may include text from users"
    },
    errors: {
      label: "Error monitoring",
      data: "IP addresses, user IDs or emails attached to errors, and request data in stack traces"
    },
    logging: {
      label: "Logs and observability",
      data: "Log lines and traces, which may hold IP addresses, user IDs, request data and prompts"
    },
    analytics: {
      label: "Product analytics",
      data: "Usage events, device and browser data, IP addresses and user IDs"
    },
    auth: { label: "Authentication", data: "Names, email addresses, login and session data" },
    support: {
      label: "Customer support",
      data: "Names, email addresses and conversation content"
    },
    messaging: {
      label: "Team messaging",
      data: "Whatever your alerts and notifications contain"
    },
    search: { label: "Search", data: "The records you index" },
    jobs: { label: "Background jobs", data: "Job payloads and their results" },
    realtime: {
      label: "Realtime",
      data: "Messages and presence data passed between your users"
    },
    scraping: {
      label: "Automation platform",
      data: "Whatever the jobs you run there collect or receive"
    },
    ci: {
      label: "Code hosting and CI",
      data: "Your code; customer data only if a job reads production data or a user signs in with it"
    }
  },
  vendors: [
    {
      id: "vercel",
      name: "Vercel",
      category: "hosting",
      kind: "likely",
      purpose: "Hosting and serverless functions",
      dpa: "https://vercel.com/legal/dpa",
      list: "https://vercel.com/legal/sub-processors",
      seen: "2026-10-09",
      note: "The list link redirects to Vercel's trust center.",
      match: {
        npm: ["vercel", "@vercel/functions", "@vercel/edge-config", "@vercel/og"],
        env: ["VERCEL_", "EDGE_CONFIG"],
        files: ["vercel.json"]
      },
      services: [
        {
          npm: ["@vercel/blob"],
          env: ["BLOB_READ_WRITE_TOKEN"],
          purpose: "File storage (Vercel Blob)"
        },
        { npm: ["@vercel/analytics"], purpose: "Web analytics (Vercel Analytics)" },
        { npm: ["@vercel/speed-insights"], purpose: "Performance monitoring (Speed Insights)" },
        {
          npm: ["@ai-sdk/gateway"],
          env: ["AI_GATEWAY_API_KEY"],
          purpose: "AI Gateway, which routes prompts to model providers"
        }
      ]
    },
    {
      id: "cloudflare",
      name: "Cloudflare",
      category: "hosting",
      kind: "likely",
      purpose: "Workers hosting and edge network",
      dpa: "https://www.cloudflare.com/cloudflare-customer-dpa/",
      list: "https://www.cloudflare.com/gdpr/subprocessors/cloudflare-services/",
      seen: "2026-10-09",
      match: {
        npm: ["wrangler", "@cloudflare/next-on-pages", "@opennextjs/cloudflare", "cloudflare"],
        env: ["CLOUDFLARE_", "CF_API_TOKEN", "CF_ACCOUNT_ID"],
        files: ["wrangler.toml", "wrangler.json", "wrangler.jsonc"],
        terraform: ["cloudflare"]
      }
    },
    {
      id: "netlify",
      name: "Netlify",
      category: "hosting",
      kind: "likely",
      purpose: "Hosting and serverless functions",
      dpa: "https://www.netlify.com/pdf/netlify-dpa.pdf",
      list: "https://www.netlify.com/legal/subprocessors/",
      seen: "2026-10-09",
      note: "The list link redirects to Netlify's trust center.",
      match: {
        npm: ["netlify-cli", "@netlify/"],
        env: ["NETLIFY_"],
        files: ["netlify.toml"]
      }
    },
    {
      id: "fly",
      name: "Fly.io",
      category: "hosting",
      kind: "likely",
      purpose: "Application hosting",
      dpa: null,
      list: "https://fly.io/legal/sub-processors/",
      seen: "2026-10-09",
      match: { env: ["FLY_API_TOKEN", "FLY_APP_NAME"], files: ["fly.toml"] }
    },
    {
      id: "render",
      name: "Render",
      category: "hosting",
      kind: "likely",
      purpose: "Application hosting",
      dpa: "https://render.com/dpa",
      list: null,
      seen: "2026-10-09",
      match: { env: ["RENDER_API_KEY"], files: ["render.yaml"] }
    },
    {
      id: "railway",
      name: "Railway",
      category: "hosting",
      kind: "likely",
      purpose: "Application hosting",
      dpa: "https://railway.com/legal/dpa",
      list: "https://railway.com/legal/subprocessors",
      seen: "2026-10-09",
      note: "The list link redirects to Railway's trust center.",
      match: {
        env: ["RAILWAY_TOKEN", "RAILWAY_PROJECT_ID"],
        files: ["railway.json", "railway.toml"]
      }
    },
    {
      id: "digitalocean",
      name: "DigitalOcean",
      category: "infrastructure",
      kind: "likely",
      purpose: "Cloud infrastructure",
      dpa: "https://www.digitalocean.com/legal/data-processing-agreement",
      list: "https://www.digitalocean.com/trust/subprocessors",
      seen: "2026-10-09",
      match: {
        env: ["DIGITALOCEAN_"],
        files: [".do/app.yaml"],
        terraform: ["digitalocean"]
      }
    },
    {
      id: "aws",
      name: "Amazon Web Services",
      category: "infrastructure",
      kind: "likely",
      purpose: "Cloud infrastructure",
      dpa: "https://d1.awsstatic.com/legal/aws-dpa/aws-dpa.pdf",
      list: "https://aws.amazon.com/compliance/sub-processors/",
      seen: "2026-10-09",
      match: {
        npm: ["@aws-sdk/", "aws-sdk", "aws-cdk-lib"],
        pypi: ["boto3", "botocore", "aws-cdk-lib"],
        py: ["boto3", "botocore"],
        go: ["github.com/aws/aws-sdk-go"],
        gem: ["aws-sdk"],
        env: ["AWS_"],
        files: ["amplify.yml", "samconfig.toml", "cdk.json"],
        terraform: ["aws"]
      },
      services: [
        {
          npm: ["@aws-sdk/client-s3", "@aws-sdk/lib-storage"],
          purpose: "File storage (S3)"
        },
        { npm: ["@aws-sdk/client-ses", "@aws-sdk/client-sesv2"], purpose: "Email (SES)" },
        {
          npm: ["@aws-sdk/client-dynamodb", "@aws-sdk/lib-dynamodb"],
          purpose: "Database (DynamoDB)"
        },
        { npm: ["@aws-sdk/client-sqs"], purpose: "Queues (SQS)" },
        {
          npm: ["@aws-sdk/client-bedrock-runtime", "@ai-sdk/amazon-bedrock"],
          purpose: "LLM inference (Bedrock)"
        }
      ]
    },
    {
      id: "google-cloud",
      name: "Google Cloud",
      category: "infrastructure",
      kind: "likely",
      purpose: "Cloud infrastructure",
      dpa: "https://cloud.google.com/terms/data-processing-addendum",
      list: "https://cloud.google.com/terms/subprocessors",
      seen: "2026-10-09",
      match: {
        npm: ["@google-cloud/"],
        pypi: ["google-cloud-"],
        py: ["google.cloud"],
        go: ["cloud.google.com/go"],
        env: ["GOOGLE_APPLICATION_CREDENTIALS", "GCP_", "GCLOUD_", "GOOGLE_CLOUD_"],
        terraform: ["google", "google-beta"]
      },
      services: [
        { npm: ["@google-cloud/storage"], purpose: "File storage (Cloud Storage)" },
        {
          npm: ["@google-cloud/vertexai", "@ai-sdk/google-vertex"],
          purpose: "LLM inference (Vertex AI)"
        },
        { npm: ["@google-cloud/bigquery"], purpose: "Data warehouse (BigQuery)" }
      ]
    },
    {
      id: "azure",
      name: "Microsoft Azure",
      category: "infrastructure",
      kind: "likely",
      purpose: "Cloud infrastructure",
      dpa: "https://aka.ms/dpa",
      list: null,
      seen: "2026-10-09",
      note: "The DPA link is Microsoft's Products and Services Data Protection Addendum.",
      match: {
        npm: ["@azure/"],
        pypi: ["azure-"],
        py: ["azure"],
        env: ["AZURE_"],
        terraform: ["azurerm"]
      },
      services: [
        { npm: ["@azure/openai", "@ai-sdk/azure"], purpose: "LLM inference (Azure OpenAI)" },
        { npm: ["@azure/storage-blob"], purpose: "File storage (Blob Storage)" }
      ]
    },
    {
      id: "neon",
      name: "Neon",
      category: "database",
      kind: "likely",
      purpose: "Serverless Postgres database",
      dpa: "https://neon.com/dpa",
      list: "https://neon.com/subprocessors",
      seen: "2026-10-09",
      note: "Neon is part of Databricks: the DPA link leads to Neon's platform terms under the Databricks agreement, and the list link to Databricks' sub-processor list.",
      match: {
        npm: [
          "@neondatabase/",
          "@vercel/postgres",
          "drizzle-orm/neon-http",
          "drizzle-orm/neon-serverless",
          "@prisma/adapter-neon"
        ],
        env: ["NEON_"],
        terraform: ["neon"]
      }
    },
    {
      id: "supabase",
      name: "Supabase",
      category: "database",
      kind: "likely",
      purpose: "Postgres database, auth and storage",
      dpa: "https://supabase.com/legal/dpa",
      list: "https://supabase.com/legal/customer-resources/subprocessor-list",
      seen: "2026-10-09",
      match: {
        npm: ["@supabase/", "supabase"],
        pypi: ["supabase"],
        py: ["supabase"],
        env: ["SUPABASE_"],
        files: ["supabase/config.toml"]
      }
    },
    {
      id: "planetscale",
      name: "PlanetScale",
      category: "database",
      kind: "likely",
      purpose: "MySQL and Postgres database",
      dpa: "https://planetscale.com/legal/dpa",
      list: "https://planetscale.com/legal/subprocessors",
      seen: "2026-10-09",
      match: {
        npm: ["@planetscale/database", "drizzle-orm/planetscale-serverless"],
        env: ["PLANETSCALE_"]
      }
    },
    {
      id: "turso",
      name: "Turso",
      category: "database",
      kind: "likely",
      purpose: "SQLite database",
      dpa: null,
      list: null,
      seen: "2026-10-09",
      match: { npm: ["@libsql/client", "@tursodatabase/"], env: ["TURSO_"] }
    },
    {
      id: "mongodb-atlas",
      name: "MongoDB Atlas",
      category: "database",
      kind: "likely",
      purpose: "Document database",
      dpa: "https://www.mongodb.com/legal/data-processing-agreement",
      list: null,
      seen: "2026-10-09",
      note: "The MongoDB driver also talks to a self-hosted database; this row is a sub-processor only if the database is on Atlas.",
      match: {
        npm: ["mongodb", "mongoose"],
        pypi: ["pymongo", "motor"],
        py: ["pymongo", "motor"],
        env: ["MONGODB_"],
        terraform: ["mongodbatlas"]
      }
    },
    {
      id: "firebase",
      name: "Firebase (Google)",
      category: "database",
      kind: "likely",
      purpose: "Database, auth and hosting",
      dpa: "https://firebase.google.com/terms/data-processing-terms",
      list: "https://firebase.google.com/terms/subprocessors",
      seen: "2026-10-09",
      match: {
        npm: ["firebase", "firebase-admin", "firebase-tools"],
        pypi: ["firebase-admin"],
        py: ["firebase_admin"],
        env: ["FIREBASE_"],
        files: ["firebase.json"]
      }
    },
    {
      id: "upstash",
      name: "Upstash",
      category: "cache",
      kind: "likely",
      purpose: "Redis, rate limiting and message queues",
      dpa: "https://upstash.com/trust/dpa.pdf",
      list: "https://upstash.com/trust/subprocessors.pdf",
      seen: "2026-10-09",
      note: "Vercel KV runs on Upstash.",
      match: {
        npm: ["@upstash/", "@vercel/kv"],
        pypi: ["upstash-redis"],
        env: ["UPSTASH_", "KV_REST_API_", "QSTASH_"]
      }
    },
    {
      id: "pinecone",
      name: "Pinecone",
      category: "vector",
      kind: "likely",
      purpose: "Vector database",
      dpa: "https://www.pinecone.io/legal/data-processing-addendum/",
      list: "https://www.pinecone.io/subprocessors/",
      seen: "2026-10-09",
      note: "The list link redirects to Pinecone's trust center.",
      match: {
        npm: ["@pinecone-database/"],
        pypi: ["pinecone", "pinecone-client"],
        py: ["pinecone"],
        env: ["PINECONE_"]
      }
    },
    {
      id: "stripe",
      name: "Stripe",
      category: "payments",
      kind: "likely",
      purpose: "Payments and billing",
      dpa: "https://stripe.com/legal/dpa",
      list: "https://stripe.com/legal/service-providers",
      seen: "2026-10-09",
      note: "Stripe's DPA gives 30 days to object to a new sub-processor, then deems it accepted (ConductAtlas, read 9 Oct 2026). Stripe is also an independent controller for some payment data.",
      match: {
        npm: ["stripe", "@stripe/"],
        pypi: ["stripe"],
        py: ["stripe"],
        go: ["github.com/stripe/stripe-go"],
        gem: ["stripe"],
        env: ["STRIPE_"],
        hosts: ["api.stripe.com", "js.stripe.com"]
      }
    },
    {
      id: "paddle",
      name: "Paddle",
      category: "payments",
      kind: "likely",
      purpose: "Payments as merchant of record",
      dpa: "https://www.paddle.com/legal/data-processing-addendum",
      list: null,
      seen: "2026-10-09",
      note: "As merchant of record, Paddle sells to your customers itself and is a controller for that sale.",
      match: {
        npm: ["@paddle/"],
        pypi: ["paddle-python-sdk"],
        env: ["PADDLE_"],
        hosts: ["api.paddle.com"]
      }
    },
    {
      id: "lemonsqueezy",
      name: "Lemon Squeezy",
      category: "payments",
      kind: "likely",
      purpose: "Payments as merchant of record",
      dpa: "https://www.lemonsqueezy.com/dpa",
      list: null,
      seen: "2026-10-09",
      match: {
        npm: ["@lemonsqueezy/"],
        env: ["LEMONSQUEEZY_", "LEMON_SQUEEZY_"],
        hosts: ["api.lemonsqueezy.com"]
      }
    },
    {
      id: "resend",
      name: "Resend",
      category: "email",
      kind: "likely",
      purpose: "Transactional email",
      dpa: "https://resend.com/legal/dpa",
      list: "https://resend.com/legal/subprocessors",
      seen: "2026-10-09",
      match: {
        npm: ["resend"],
        pypi: ["resend"],
        py: ["resend"],
        env: ["RESEND_"],
        hosts: ["api.resend.com"]
      }
    },
    {
      id: "sendgrid",
      name: "Twilio SendGrid",
      category: "email",
      kind: "likely",
      purpose: "Transactional and marketing email",
      dpa: "https://www.twilio.com/en-us/legal/data-protection-addendum",
      list: "https://www.twilio.com/en-us/legal/sub-processors",
      seen: "2026-10-09",
      match: {
        npm: ["@sendgrid/"],
        pypi: ["sendgrid"],
        py: ["sendgrid"],
        env: ["SENDGRID_"],
        hosts: ["api.sendgrid.com"]
      }
    },
    {
      id: "postmark",
      name: "Postmark",
      category: "email",
      kind: "likely",
      purpose: "Transactional email",
      dpa: "https://postmarkapp.com/dpa",
      list: null,
      seen: "2026-10-09",
      match: {
        npm: ["postmark"],
        pypi: ["postmarker"],
        env: ["POSTMARK_"],
        hosts: ["api.postmarkapp.com"]
      }
    },
    {
      id: "mailgun",
      name: "Mailgun",
      category: "email",
      kind: "likely",
      purpose: "Transactional email",
      dpa: null,
      list: null,
      seen: "2026-10-09",
      match: {
        npm: ["mailgun.js", "mailgun-js"],
        env: ["MAILGUN_"],
        hosts: ["api.mailgun.net", "api.eu.mailgun.net"]
      }
    },
    {
      id: "loops",
      name: "Loops",
      category: "email",
      kind: "likely",
      purpose: "Product and transactional email",
      dpa: "https://loops.so/dpa",
      list: null,
      seen: "2026-10-09",
      match: { npm: ["loops"], env: ["LOOPS_"], hosts: ["app.loops.so/api"] }
    },
    {
      id: "twilio",
      name: "Twilio",
      category: "sms",
      kind: "likely",
      purpose: "SMS, voice and verification",
      dpa: "https://www.twilio.com/en-us/legal/data-protection-addendum",
      list: "https://www.twilio.com/en-us/legal/sub-processors",
      seen: "2026-10-09",
      match: {
        npm: ["twilio"],
        pypi: ["twilio"],
        py: ["twilio"],
        gem: ["twilio-ruby"],
        env: ["TWILIO_"],
        hosts: ["api.twilio.com"]
      }
    },
    {
      id: "anthropic",
      name: "Anthropic",
      category: "llm",
      kind: "likely",
      purpose: "LLM inference (Claude)",
      dpa: "https://www.anthropic.com/legal/data-processing-addendum",
      list: "https://trust.anthropic.com/subprocessors",
      seen: "2026-10-09",
      match: {
        npm: [
          "@anthropic-ai/sdk",
          "@anthropic-ai/bedrock-sdk",
          "@anthropic-ai/vertex-sdk",
          "@ai-sdk/anthropic",
          "@anthropic-ai/claude-agent-sdk"
        ],
        pypi: ["anthropic"],
        py: ["anthropic"],
        go: ["github.com/anthropics/anthropic-sdk-go"],
        env: ["ANTHROPIC_"],
        hosts: ["api.anthropic.com"]
      }
    },
    {
      id: "openai",
      name: "OpenAI",
      category: "llm",
      kind: "likely",
      purpose: "LLM inference",
      dpa: "https://openai.com/policies/data-processing-addendum/",
      list: "https://openai.com/policies/sub-processor-list/",
      seen: "2026-10-09",
      note: "openai.com refused the automated check on 9 Oct 2026; both links are the ones OpenAI's own pages name.",
      match: {
        npm: ["openai", "@ai-sdk/openai", "@openai/agents"],
        pypi: ["openai"],
        py: ["openai"],
        go: ["github.com/openai/openai-go"],
        env: ["OPENAI_"],
        hosts: ["api.openai.com"]
      }
    },
    {
      id: "gemini",
      name: "Google Gemini API",
      category: "llm",
      kind: "likely",
      purpose: "LLM inference (Gemini)",
      dpa: null,
      list: null,
      seen: "2026-10-09",
      note: "The Gemini API's terms are at https://ai.google.dev/gemini-api/terms; through Vertex AI, Google Cloud's DPA applies (the Google Cloud row).",
      match: {
        npm: ["@google/generative-ai", "@google/genai", "@ai-sdk/google"],
        pypi: ["google-generativeai", "google-genai"],
        py: ["google.generativeai", "google.genai"],
        env: ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_GENAI_API_KEY"],
        hosts: ["generativelanguage.googleapis.com"]
      }
    },
    {
      id: "mistral",
      name: "Mistral AI",
      category: "llm",
      kind: "likely",
      purpose: "LLM inference",
      dpa: "https://legal.mistral.ai/terms/data-processing-addendum/",
      list: "https://trust.mistral.ai/subprocessors",
      seen: "2026-10-09",
      match: {
        npm: ["@mistralai/mistralai", "@ai-sdk/mistral"],
        pypi: ["mistralai"],
        py: ["mistralai"],
        env: ["MISTRAL_"],
        hosts: ["api.mistral.ai"]
      }
    },
    {
      id: "groq",
      name: "Groq",
      category: "llm",
      kind: "likely",
      purpose: "LLM inference",
      dpa: "https://console.groq.com/docs/legal/customer-data-processing-addendum",
      list: null,
      seen: "2026-10-09",
      match: {
        npm: ["groq-sdk", "@ai-sdk/groq"],
        pypi: ["groq"],
        py: ["groq"],
        env: ["GROQ_"],
        hosts: ["api.groq.com"]
      }
    },
    {
      id: "cohere",
      name: "Cohere",
      category: "llm",
      kind: "likely",
      purpose: "LLM inference and embeddings",
      dpa: null,
      list: null,
      seen: "2026-10-09",
      match: {
        npm: ["cohere-ai", "@ai-sdk/cohere"],
        pypi: ["cohere"],
        py: ["cohere"],
        env: ["COHERE_", "CO_API_KEY"],
        hosts: ["api.cohere.com", "api.cohere.ai"]
      }
    },
    {
      id: "xai",
      name: "xAI",
      category: "llm",
      kind: "likely",
      purpose: "LLM inference (Grok)",
      dpa: null,
      list: null,
      seen: "2026-10-09",
      match: { npm: ["@ai-sdk/xai"], env: ["XAI_"], hosts: ["api.x.ai"] }
    },
    {
      id: "openrouter",
      name: "OpenRouter",
      category: "llm",
      kind: "likely",
      purpose: "LLM routing to many model providers",
      dpa: null,
      list: null,
      seen: "2026-10-09",
      note: "OpenRouter forwards prompts to the model's provider, which is a further sub-processor in the chain.",
      match: {
        npm: ["@openrouter/ai-sdk-provider", "@openrouter/sdk"],
        env: ["OPENROUTER_"],
        hosts: ["openrouter.ai/api"]
      }
    },
    {
      id: "together",
      name: "Together AI",
      category: "llm",
      kind: "likely",
      purpose: "LLM inference",
      dpa: null,
      list: null,
      seen: "2026-10-09",
      match: {
        npm: ["together-ai", "@ai-sdk/togetherai"],
        pypi: ["together"],
        env: ["TOGETHER_"],
        hosts: ["api.together.xyz", "api.together.ai"]
      }
    },
    {
      id: "replicate",
      name: "Replicate",
      category: "llm",
      kind: "likely",
      purpose: "Model inference",
      dpa: null,
      list: null,
      seen: "2026-10-09",
      match: {
        npm: ["replicate"],
        pypi: ["replicate"],
        py: ["replicate"],
        env: ["REPLICATE_"],
        hosts: ["api.replicate.com"]
      }
    },
    {
      id: "huggingface",
      name: "Hugging Face",
      category: "llm",
      kind: "likely",
      purpose: "Model inference",
      dpa: null,
      list: null,
      seen: "2026-10-09",
      match: {
        npm: ["@huggingface/inference"],
        pypi: ["huggingface-hub"],
        py: ["huggingface_hub"],
        env: ["HF_TOKEN", "HUGGINGFACE_", "HUGGING_FACE_"],
        hosts: ["api-inference.huggingface.co", "router.huggingface.co"]
      }
    },
    {
      id: "elevenlabs",
      name: "ElevenLabs",
      category: "ai-media",
      kind: "likely",
      purpose: "Speech synthesis",
      dpa: "https://elevenlabs.io/dpa",
      list: null,
      seen: "2026-10-09",
      match: {
        npm: ["elevenlabs", "@elevenlabs/"],
        pypi: ["elevenlabs"],
        py: ["elevenlabs"],
        env: ["ELEVENLABS_", "ELEVEN_LABS_"],
        hosts: ["api.elevenlabs.io"]
      }
    },
    {
      id: "deepgram",
      name: "Deepgram",
      category: "ai-media",
      kind: "likely",
      purpose: "Speech to text",
      dpa: null,
      list: null,
      seen: "2026-10-09",
      match: {
        npm: ["@deepgram/sdk"],
        pypi: ["deepgram-sdk"],
        py: ["deepgram"],
        env: ["DEEPGRAM_"],
        hosts: ["api.deepgram.com"]
      }
    },
    {
      id: "sentry",
      name: "Sentry",
      category: "errors",
      kind: "likely",
      purpose: "Error and performance monitoring",
      dpa: "https://sentry.io/legal/dpa/",
      list: "https://sentry.io/legal/subprocessors/",
      seen: "2026-10-09",
      match: {
        npm: ["@sentry/", "raven-js"],
        pypi: ["sentry-sdk"],
        py: ["sentry_sdk"],
        go: ["github.com/getsentry/sentry-go"],
        gem: ["sentry-ruby", "sentry-rails"],
        env: ["SENTRY_"]
      }
    },
    {
      id: "datadog",
      name: "Datadog",
      category: "logging",
      kind: "likely",
      purpose: "Monitoring, logs and APM",
      dpa: "https://www.datadoghq.com/legal/data-processing-addendum/",
      list: "https://www.datadoghq.com/subprocessors/",
      seen: "2026-10-09",
      match: {
        npm: ["dd-trace", "@datadog/"],
        pypi: ["ddtrace", "datadog"],
        py: ["ddtrace", "datadog"],
        go: ["gopkg.in/DataDog/dd-trace-go", "github.com/DataDog/dd-trace-go"],
        env: ["DD_API_KEY", "DD_SITE", "DATADOG_"],
        terraform: ["datadog"]
      }
    },
    {
      id: "betterstack",
      name: "Better Stack",
      category: "logging",
      kind: "likely",
      purpose: "Logs and uptime monitoring",
      dpa: "https://betterstack.com/dpa",
      list: null,
      seen: "2026-10-09",
      match: {
        npm: ["@logtail/"],
        pypi: ["logtail-python"],
        env: ["LOGTAIL_", "BETTER_STACK_", "BETTERSTACK_"],
        hosts: ["in.logs.betterstack.com", "in.logtail.com"]
      }
    },
    {
      id: "axiom",
      name: "Axiom",
      category: "logging",
      kind: "likely",
      purpose: "Logs and traces",
      dpa: null,
      list: null,
      seen: "2026-10-09",
      match: {
        npm: ["@axiomhq/", "next-axiom"],
        env: ["AXIOM_"],
        hosts: ["api.axiom.co"]
      }
    },
    {
      id: "langfuse",
      name: "Langfuse",
      category: "logging",
      kind: "likely",
      purpose: "LLM tracing and evaluation",
      dpa: "https://langfuse.com/security/dpa",
      list: "https://langfuse.com/security/subprocessors",
      seen: "2026-10-09",
      note: "Langfuse is part of ClickHouse: both links lead to ClickHouse's pages for Langfuse Cloud. Self-hosted Langfuse is not a sub-processor.",
      match: {
        npm: ["langfuse", "@langfuse/", "langfuse-vercel", "langfuse-langchain"],
        pypi: ["langfuse"],
        py: ["langfuse"],
        env: ["LANGFUSE_"],
        hosts: ["cloud.langfuse.com", "us.cloud.langfuse.com"]
      }
    },
    {
      id: "helicone",
      name: "Helicone",
      category: "logging",
      kind: "likely",
      purpose: "LLM request logging",
      dpa: null,
      list: null,
      seen: "2026-10-09",
      match: {
        npm: ["@helicone/"],
        env: ["HELICONE_"],
        hosts: ["oai.helicone.ai", "anthropic.helicone.ai", "ai-gateway.helicone.ai"]
      }
    },
    {
      id: "posthog",
      name: "PostHog",
      category: "analytics",
      kind: "likely",
      purpose: "Product analytics and session replay",
      dpa: "https://posthog.com/dpa",
      list: "https://posthog.com/subprocessors",
      seen: "2026-10-09",
      match: {
        npm: ["posthog-js", "posthog-node", "@posthog/"],
        pypi: ["posthog"],
        py: ["posthog"],
        env: ["POSTHOG_"],
        hosts: ["us.i.posthog.com", "eu.i.posthog.com", "app.posthog.com"]
      }
    },
    {
      id: "mixpanel",
      name: "Mixpanel",
      category: "analytics",
      kind: "likely",
      purpose: "Product analytics",
      dpa: "https://mixpanel.com/legal/dpa/",
      list: "https://mixpanel.com/legal/subprocessors/",
      seen: "2026-10-09",
      match: {
        npm: ["mixpanel", "mixpanel-browser"],
        pypi: ["mixpanel"],
        py: ["mixpanel"],
        env: ["MIXPANEL_"],
        hosts: ["api.mixpanel.com", "api-js.mixpanel.com"]
      }
    },
    {
      id: "amplitude",
      name: "Amplitude",
      category: "analytics",
      kind: "likely",
      purpose: "Product analytics",
      dpa: "https://amplitude.com/dpa",
      list: null,
      seen: "2026-10-09",
      match: {
        npm: ["@amplitude/"],
        pypi: ["amplitude-analytics"],
        env: ["AMPLITUDE_"],
        hosts: ["api2.amplitude.com"]
      }
    },
    {
      id: "segment",
      name: "Twilio Segment",
      category: "analytics",
      kind: "likely",
      purpose: "Customer data pipeline",
      dpa: "https://www.twilio.com/en-us/legal/data-protection-addendum",
      list: "https://www.twilio.com/en-us/legal/sub-processors",
      seen: "2026-10-09",
      note: "Segment forwards events to the destinations you turn on, each a further recipient.",
      match: {
        npm: ["@segment/", "analytics-node"],
        pypi: ["segment-analytics-python"],
        env: ["SEGMENT_"],
        hosts: ["api.segment.io", "cdn.segment.com"]
      }
    },
    {
      id: "google-analytics",
      name: "Google Analytics",
      category: "analytics",
      kind: "likely",
      purpose: "Web analytics",
      dpa: "https://business.safety.google/adsprocessorterms/",
      list: null,
      seen: "2026-10-09",
      note: "The DPA link is Google Ads Data Processing Terms, which cover Google Analytics.",
      match: {
        npm: ["react-ga4", "ga-4-react", "@next/third-parties/google"],
        env: ["GA_MEASUREMENT_ID", "GA_TRACKING_ID", "GOOGLE_ANALYTICS_", "GA4_"],
        hosts: ["www.googletagmanager.com", "www.google-analytics.com"]
      }
    },
    {
      id: "plausible",
      name: "Plausible Analytics",
      category: "analytics",
      kind: "likely",
      purpose: "Web analytics without cookies",
      dpa: "https://plausible.io/dpa",
      list: null,
      seen: "2026-10-09",
      match: {
        npm: ["next-plausible", "plausible-tracker", "@plausible-analytics/tracker"],
        env: ["PLAUSIBLE_"],
        hosts: ["plausible.io/js", "plausible.io/api"]
      }
    },
    {
      id: "clerk",
      name: "Clerk",
      category: "auth",
      kind: "likely",
      purpose: "User authentication",
      dpa: "https://clerk.com/legal/dpa",
      list: "https://clerk.com/legal/subprocessors",
      seen: "2026-10-09",
      match: { npm: ["@clerk/"], pypi: ["clerk-backend-api"], env: ["CLERK_"] }
    },
    {
      id: "auth0",
      name: "Auth0 (Okta)",
      category: "auth",
      kind: "likely",
      purpose: "User authentication",
      dpa: null,
      list: null,
      seen: "2026-10-09",
      note: "Okta's agreements, including its DPA, are listed at https://www.okta.com/legal/.",
      match: {
        npm: ["@auth0/", "auth0", "next-auth/providers/auth0", "@auth/core/providers/auth0"],
        pypi: ["auth0-python"],
        py: ["auth0"],
        env: ["AUTH0_", "AUTH_AUTH0_"]
      }
    },
    {
      id: "workos",
      name: "WorkOS",
      category: "auth",
      kind: "likely",
      purpose: "Enterprise SSO and user management",
      dpa: "https://workos.com/legal/dpa",
      list: "https://workos.com/legal/subprocessors",
      seen: "2026-10-09",
      note: "The list link redirects to WorkOS's trust center.",
      match: {
        npm: ["@workos-inc/"],
        pypi: ["workos"],
        py: ["workos"],
        env: ["WORKOS_"],
        hosts: ["api.workos.com"]
      }
    },
    {
      id: "slack",
      name: "Slack",
      category: "messaging",
      kind: "likely",
      purpose: "Alerts and notifications to Slack",
      dpa: "https://slack.com/terms-of-service/data-processing",
      list: null,
      seen: "2026-10-09",
      match: {
        npm: ["@slack/"],
        pypi: ["slack-sdk", "slack-bolt"],
        py: ["slack_sdk", "slack_bolt"],
        env: ["SLACK_"],
        hosts: ["hooks.slack.com", "slack.com/api"]
      }
    },
    {
      id: "discord",
      name: "Discord",
      category: "messaging",
      kind: "likely",
      purpose: "Alerts and notifications to Discord",
      dpa: null,
      list: null,
      seen: "2026-10-09",
      note: "No DPA for webhooks was found on 9 Oct 2026; check before a notification carries customer data.",
      match: {
        npm: ["discord.js", "@discordjs/"],
        pypi: ["discord-py"],
        env: ["DISCORD_"],
        hosts: ["discord.com/api/webhooks", "discordapp.com/api/webhooks"]
      }
    },
    {
      id: "intercom",
      name: "Intercom",
      category: "support",
      kind: "likely",
      purpose: "Customer messaging and support",
      dpa: "https://www.intercom.com/legal/data-processing-agreement",
      list: "https://www.intercom.com/legal/subprocessors-list",
      seen: "2026-10-09",
      match: {
        npm: ["@intercom/", "intercom-client", "react-use-intercom"],
        env: ["INTERCOM_"],
        hosts: ["api.intercom.io", "widget.intercom.io"]
      }
    },
    {
      id: "crisp",
      name: "Crisp",
      category: "support",
      kind: "likely",
      purpose: "Customer chat",
      dpa: null,
      list: null,
      seen: "2026-10-09",
      match: {
        npm: ["crisp-sdk-web", "crisp-api"],
        env: ["CRISP_"],
        hosts: ["client.crisp.chat"]
      }
    },
    {
      id: "algolia",
      name: "Algolia",
      category: "search",
      kind: "likely",
      purpose: "Hosted search",
      dpa: "https://www.algolia.com/policies/data-processing-addendum",
      list: null,
      seen: "2026-10-09",
      match: {
        npm: ["algoliasearch", "@algolia/", "react-instantsearch"],
        pypi: ["algoliasearch"],
        py: ["algoliasearch"],
        env: ["ALGOLIA_"]
      }
    },
    {
      id: "cloudinary",
      name: "Cloudinary",
      category: "storage",
      kind: "likely",
      purpose: "Image and video hosting",
      dpa: null,
      list: null,
      seen: "2026-10-09",
      match: {
        npm: ["cloudinary", "next-cloudinary", "@cloudinary/"],
        pypi: ["cloudinary"],
        env: ["CLOUDINARY_"],
        hosts: ["api.cloudinary.com", "res.cloudinary.com"]
      }
    },
    {
      id: "uploadthing",
      name: "UploadThing",
      category: "storage",
      kind: "likely",
      purpose: "File uploads",
      dpa: null,
      list: null,
      seen: "2026-10-09",
      match: { npm: ["uploadthing", "@uploadthing/"], env: ["UPLOADTHING_"] }
    },
    {
      id: "mux",
      name: "Mux",
      category: "storage",
      kind: "likely",
      purpose: "Video hosting and streaming",
      dpa: "https://www.mux.com/dpa",
      list: null,
      seen: "2026-10-09",
      match: { npm: ["@mux/"], pypi: ["mux-python"], env: ["MUX_"] }
    },
    {
      id: "trigger-dev",
      name: "Trigger.dev",
      category: "jobs",
      kind: "likely",
      purpose: "Background jobs",
      dpa: "https://trigger.dev/legal/dpa",
      list: "https://trigger.dev/legal/subprocessors",
      seen: "2026-10-09",
      match: {
        npm: ["@trigger.dev/"],
        env: ["TRIGGER_SECRET_KEY", "TRIGGER_API_KEY", "TRIGGER_PROJECT_"],
        files: ["trigger.config.ts"]
      }
    },
    {
      id: "inngest",
      name: "Inngest",
      category: "jobs",
      kind: "likely",
      purpose: "Background jobs and workflows",
      dpa: null,
      list: null,
      seen: "2026-10-09",
      match: { npm: ["inngest"], pypi: ["inngest"], env: ["INNGEST_"] }
    },
    {
      id: "pusher",
      name: "Pusher",
      category: "realtime",
      kind: "likely",
      purpose: "Realtime messaging",
      dpa: null,
      list: null,
      seen: "2026-10-09",
      match: { npm: ["pusher", "pusher-js"], pypi: ["pusher"], env: ["PUSHER_"] }
    },
    {
      id: "ably",
      name: "Ably",
      category: "realtime",
      kind: "likely",
      purpose: "Realtime messaging",
      dpa: "https://ably.com/data-processing-addendum",
      list: null,
      seen: "2026-10-09",
      match: { npm: ["ably"], pypi: ["ably"], env: ["ABLY_"] }
    },
    {
      id: "liveblocks",
      name: "Liveblocks",
      category: "realtime",
      kind: "likely",
      purpose: "Realtime collaboration",
      dpa: "https://liveblocks.io/dpa",
      list: null,
      seen: "2026-10-09",
      match: { npm: ["@liveblocks/"], env: ["LIVEBLOCKS_"] }
    },
    {
      id: "apify",
      name: "Apify",
      category: "scraping",
      kind: "likely",
      purpose: "Hosted scrapers and automation (Actors)",
      dpa: "https://docs.apify.com/legal/data-processing-addendum",
      list: null,
      seen: "2026-10-09",
      match: {
        npm: ["apify", "apify-client", "apify-cli"],
        pypi: ["apify", "apify-client"],
        py: ["apify", "apify_client"],
        env: ["APIFY_"],
        files: [".actor/actor.json"]
      }
    },
    {
      id: "github",
      name: "GitHub",
      category: "ci",
      kind: "tooling",
      purpose: "Code hosting and CI",
      dpa: "https://github.com/customer-terms/github-data-protection-agreement",
      list: "https://docs.github.com/en/site-policy/privacy-policies/github-subprocessors",
      seen: "2026-10-09",
      note: "Usually not a sub-processor: CI runs your code, not your customers' data, and with Sign in with GitHub, GitHub is the controller of its own users' accounts. List it if a job reads production data or you send customer data to its API.",
      match: {
        npm: ["@octokit/", "octokit", "@actions/"],
        pypi: ["pygithub"],
        env: [
          "GITHUB_TOKEN",
          "GH_TOKEN",
          "GITHUB_APP_",
          "GITHUB_PRIVATE_KEY",
          "GITHUB_WEBHOOK_SECRET"
        ],
        files: [".github/workflows/"]
      },
      services: [
        {
          npm: ["next-auth/providers/github", "@auth/core/providers/github"],
          env: [
            "AUTH_GITHUB_",
            "GITHUB_ID",
            "GITHUB_SECRET",
            "GITHUB_CLIENT_ID",
            "GITHUB_CLIENT_SECRET"
          ],
          purpose: "Sign in with GitHub"
        }
      ]
    }
  ]
};

// src/catalog.ts
var CATALOG = vendors_default;
function vendorById(id, c = CATALOG) {
  return c.vendors.find((v) => v.id === id);
}
function dataGuess(v, c = CATALOG) {
  return v.data ?? c.categories[v.category]?.data ?? "";
}

// src/walk.ts
import { lstat, readFile, readdir } from "fs/promises";
import path2 from "path";
var SKIP_DIRS = /* @__PURE__ */ new Set([
  "node_modules",
  "bower_components",
  "jspm_packages",
  "dist",
  "build",
  "out",
  "coverage",
  "vendor",
  "target",
  "__pycache__",
  "venv",
  "site-packages",
  "storybook-static"
]);
var DOT_DIRS = /* @__PURE__ */ new Set([".github", ".do", ".actor"]);
var TEST_DIRS = /* @__PURE__ */ new Set([
  "test",
  "tests",
  "__tests__",
  "__mocks__",
  "fixtures",
  "__fixtures__",
  "testdata",
  "examples",
  "example",
  "e2e",
  "spec",
  "cypress"
]);
var CODE = /\.(?:[cm]?[jt]sx?|py|go|rb|vue|svelte|astro)$/;
var TEST_FILE = /(?:\.(?:test|spec|stories)\.[cm]?[jt]sx?$)|(?:_test\.(?:go|py)$)|(?:^test_[^/]*\.py$)|(?:^(?:fake|mock|stub)s?[-_.])/;
var MANIFESTS = /* @__PURE__ */ new Set(["package.json", "pyproject.toml", "go.mod", "Gemfile"]);
var REQUIREMENTS = /^requirements[\w.-]*\.txt$/;
var INFRA = /* @__PURE__ */ new Set([
  "vercel.json",
  "wrangler.toml",
  "wrangler.json",
  "wrangler.jsonc",
  "netlify.toml",
  "fly.toml",
  "render.yaml",
  "railway.json",
  "railway.toml",
  "firebase.json",
  "serverless.yml",
  "serverless.yaml",
  "amplify.yml",
  "samconfig.toml",
  "cdk.json",
  "actor.json",
  "app.yaml",
  "config.toml"
]);
function isEnvFile(name) {
  if (CODE.test(name)) return false;
  return /^\.?env(?:\.|$)/.test(name) || /^\.dev\.vars(?:\.|$)/.test(name) || /\.env$/.test(name);
}
function isExampleEnv(name) {
  return isEnvFile(name) && /(?:^|[.-])(?:example|sample|template|dist|defaults)(?:[.-]|$)/i.test(name);
}
function wanted(rel, name) {
  if (MANIFESTS.has(name) || REQUIREMENTS.test(name) || INFRA.has(name)) return true;
  if (/^Dockerfile(?:\.[\w-]+)?$/.test(name) || name.endsWith(".Dockerfile")) return true;
  if (name.endsWith(".tf")) return true;
  if (rel.startsWith(".github/workflows/") && /\.ya?ml$/.test(name)) return true;
  if (CODE.test(name) && !name.endsWith(".d.ts")) return true;
  return isExampleEnv(name);
}
async function walk(root, opts = {}) {
  const maxBytes = opts.maxBytes ?? 1e6;
  const maxFiles = opts.maxFiles ?? 5e4;
  const out = {
    files: [],
    skippedEnv: [],
    skippedLarge: [],
    skippedTests: 0,
    truncated: false
  };
  const stack = [""];
  while (stack.length) {
    const dirRel = stack.pop();
    let entries;
    try {
      entries = await readdir(path2.join(root, dirRel), { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => a.name < b.name ? 1 : a.name > b.name ? -1 : 0);
    const files = [];
    for (const e of entries) {
      const rel = dirRel ? `${dirRel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        if (e.name.startsWith(".") && !DOT_DIRS.has(e.name)) continue;
        if (!opts.includeTests && TEST_DIRS.has(e.name)) {
          out.skippedTests++;
          continue;
        }
        stack.push(rel);
      } else if (e.isFile()) files.push(rel);
    }
    for (const rel of files.reverse()) {
      const name = rel.slice(rel.lastIndexOf("/") + 1);
      if (isEnvFile(name) && !isExampleEnv(name)) {
        out.skippedEnv.push(rel);
        continue;
      }
      if (!wanted(rel, name)) continue;
      if (!opts.includeTests && TEST_FILE.test(name)) {
        out.skippedTests++;
        continue;
      }
      if (out.files.length >= maxFiles) {
        out.truncated = true;
        return finish(out);
      }
      const full = path2.join(root, rel);
      const st = await lstat(full).catch(() => null);
      if (!st) continue;
      if (st.size > maxBytes) {
        out.skippedLarge.push(rel);
        continue;
      }
      const text = await readFile(full, "utf8").catch(() => null);
      if (text !== null)
        out.files.push({ path: rel, text: isEnvFile(name) ? envNamesOnly(text) : text });
    }
  }
  return finish(out);
}
function envNamesOnly(text) {
  return text.split("\n").map((l) => {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(l);
    return m ? `${m[1]}=` : "";
  }).join("\n");
}
function finish(out) {
  out.files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  out.skippedEnv.sort();
  out.skippedLarge.sort();
  return out;
}

// src/detect.ts
var Index = class {
  constructor(catalog = CATALOG) {
    this.catalog = catalog;
    const hosts = [];
    for (const vendor of catalog.vendors) {
      const sets = [
        [vendor.match, void 0],
        ...(vendor.services ?? []).map((s) => [s, s.purpose])
      ];
      for (const [m, purpose] of sets) {
        const target = { vendor, purpose };
        for (const key of ["npm", "pypi", "py", "go", "gem", "env", "terraform"]) {
          for (const raw of m[key] ?? []) {
            const value = key === "pypi" ? normPypi(raw) : raw;
            if (isPrefix(key, value)) this.prefix.push({ key, value, target });
            else push(this.exact, `${key}:${value}`, target);
          }
        }
        for (const h of m.hosts ?? []) {
          hosts.push(h);
          push(this.hostTargets, h, target);
        }
        for (const f of m.files ?? []) this.files.push({ pattern: f, target });
      }
    }
    hosts.sort((a, b) => b.length - a.length);
    this.hostPattern = hosts.length ? new RegExp(`(?<![\\w.-])(${hosts.map(escape).join("|")})(?!\\.?[\\w-])`, "g") : null;
  }
  catalog;
  exact = /* @__PURE__ */ new Map();
  prefix = [];
  hostPattern;
  hostTargets = /* @__PURE__ */ new Map();
  files = [];
  /** Every target a name of this kind hits; a service's hit replaces its vendor's plain one. */
  lookup(key, name) {
    const value = key === "pypi" ? normPypi(name) : name;
    const found = [...this.exact.get(`${key}:${value}`) ?? []];
    for (const p of this.prefix) {
      if (p.key !== key) continue;
      if (prefixHit(key, p.value, value)) found.push(p.target);
    }
    return preferServices(found);
  }
  hostTargetsOf(host) {
    return this.hostTargets.get(host) ?? [];
  }
};
function push(map, k, v) {
  const list = map.get(k);
  if (list) list.push(v);
  else map.set(k, [v]);
}
function isPrefix(key, value) {
  if (key === "npm") return value.endsWith("/");
  if (key === "env") return value.endsWith("_");
  if (key === "pypi" || key === "gem") return value.endsWith("-");
  return key === "py" || key === "go";
}
function prefixHit(key, p, value) {
  if (key === "py") return value === p || value.startsWith(`${p}.`);
  if (key === "go") return value === p || value.startsWith(`${p}/`);
  return value.startsWith(p) && value.length > p.length;
}
function preferServices(found) {
  const withService = new Set(found.filter((t) => t.purpose).map((t) => t.vendor.id));
  const seen = /* @__PURE__ */ new Set();
  return found.filter((t) => {
    if (!t.purpose && withService.has(t.vendor.id)) return false;
    const k = `${t.vendor.id}\0${t.purpose ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
function escape(s) {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}
function normPypi(name) {
  return name.toLowerCase().replace(/[_.]+/g, "-");
}
var PUBLIC_PREFIX = /^(?:NEXT_PUBLIC_|VITE_|PUBLIC_|REACT_APP_|EXPO_PUBLIC_|NUXT_PUBLIC_|GATSBY_)/;
function envKey(name) {
  return name.replace(PUBLIC_PREFIX, "");
}
function packageOf(spec) {
  const parts = spec.split("/");
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}
var JS_FILE = /\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/;
var JS_IMPORTS = [
  /\bfrom\s*["']([^"'\s]+)["']/g,
  /\bimport\s*["']([^"'\s]+)["']/g,
  /\brequire\(\s*["']([^"'\s]+)["']\s*\)/g,
  /\bimport\(\s*["']([^"'\s]+)["']\s*\)/g
];
var ENV_REFS = [
  /process\.env\.([A-Z][A-Z0-9_]*)/g,
  /process\.env\[\s*["'`]([A-Z][A-Z0-9_]*)["'`]\s*\]/g,
  /import\.meta\.env\.([A-Z][A-Z0-9_]*)/g,
  /(?<![\w.])env\.([A-Z][A-Z0-9_]{2,})\b/g,
  /os\.environ(?:\.get)?\(\s*["']([A-Z][A-Z0-9_]*)["']/g,
  /os\.environ\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]/g,
  /os\.getenv\(\s*["']([A-Z][A-Z0-9_]*)["']/g,
  /os\.Getenv\(\s*"([A-Z][A-Z0-9_]*)"/g,
  /Deno\.env\.get\(\s*["']([A-Z][A-Z0-9_]*)["']/g,
  /\bENV(?:\.fetch\(|\[)\s*["']([A-Z][A-Z0-9_]*)["']/g
];
var COMMENT = /^\s*(?:\/\/|\/\*|\*|#)/;
var DEP_FIELDS = [
  ["dependencies", "dependency"],
  ["peerDependencies", "dependency"],
  ["optionalDependencies", "dependency"],
  ["devDependencies", "dev-dependency"]
];
var VERCEL_REGIONS = {
  arn1: "Stockholm",
  bom1: "Mumbai",
  cdg1: "Paris",
  cle1: "Cleveland",
  cpt1: "Cape Town",
  dub1: "Dublin",
  fra1: "Frankfurt",
  gru1: "S\xE3o Paulo",
  hkg1: "Hong Kong",
  hnd1: "Tokyo",
  iad1: "Washington, D.C.",
  icn1: "Seoul",
  kix1: "Osaka",
  lhr1: "London",
  pdx1: "Portland",
  sfo1: "San Francisco",
  sin1: "Singapore",
  syd1: "Sydney"
};
var SERVERLESS_PROVIDERS = {
  aws: "aws",
  google: "google-cloud",
  azure: "azure"
};
var Collector = class {
  hits = [];
  regions = [];
  seen = /* @__PURE__ */ new Set();
  add(targets, evidence) {
    for (const t of targets) {
      const key = `${t.vendor.id}\0${evidence.file}\0${evidence.line}\0${evidence.what}`;
      if (this.seen.has(key)) continue;
      this.seen.add(key);
      this.hits.push({ vendor: t.vendor.id, purpose: t.purpose, evidence });
    }
  }
  region(vendor, region, file, line) {
    this.regions.push({ vendor, region, file, line });
  }
};
function lineOf(text, re) {
  const m = re.exec(text);
  return m ? text.slice(0, m.index).split("\n").length : 1;
}
function detect(files, index = new Index()) {
  const c = new Collector();
  for (const f of files) {
    const name = f.path.slice(f.path.lastIndexOf("/") + 1);
    fileMatches(f, index, c);
    if (name === "package.json") packageJson(f, index, c);
    else if (/^requirements[\w.-]*\.txt$/.test(name)) requirements(f, index, c);
    else if (name === "pyproject.toml") pyproject(f, index, c);
    else if (name === "go.mod") goMod(f, index, c);
    else if (name === "Gemfile") gemfile(f, index, c);
    else if (isExampleEnv(name)) envExample(f, index, c);
    else if (name === "vercel.json") vercelJson(f, index, c);
    else if (/^wrangler\.(?:toml|jsonc?)$/.test(name)) wrangler(f, index, c);
    else if (name === "fly.toml")
      simpleRegion(f, "fly", /^\s*primary_region\s*=\s*["']([\w-]+)["']/m, c);
    else if (name === "render.yaml") simpleRegion(f, "render", /^\s*region:\s*["']?([\w-]+)/m, c);
    else if (/^serverless\.ya?ml$/.test(name)) serverless(f, index, c);
    else if (name.endsWith(".tf")) terraform(f, index, c);
    else if (/^Dockerfile(?:\.[\w-]+)?$/.test(name) || name.endsWith(".Dockerfile"))
      dockerfile(f, index, c);
    else if (f.path.startsWith(".github/workflows/") || f.path.includes("/.github/workflows/"))
      workflow(f, index, c);
    else if (/\.(?:[cm]?[jt]sx?|py|go|rb|vue|svelte|astro)$/.test(name)) code(f, index, c);
  }
  return { hits: c.hits, regions: c.regions };
}
function fileMatches(f, index, c) {
  for (const { pattern, target } of index.files) {
    const dir = pattern.endsWith("/");
    const hit = dir ? f.path.startsWith(pattern) || f.path.includes(`/${pattern}`) : f.path === pattern || f.path.endsWith(`/${pattern}`);
    if (hit) {
      const what = dir ? pattern.replace(/\/$/, "") : pattern;
      c.add([target], {
        file: dir ? dirOf(f.path, pattern) : f.path,
        line: dir ? 0 : 1,
        kind: "config",
        what
      });
    }
  }
}
function dirOf(file, pattern) {
  const at2 = file.startsWith(pattern) ? 0 : file.indexOf(`/${pattern}`) + 1;
  return file.slice(0, at2 + pattern.length - 1);
}
function packageJson(f, index, c) {
  let pkg;
  try {
    pkg = JSON.parse(f.text);
  } catch {
    return;
  }
  for (const [field, kind] of DEP_FIELDS) {
    const deps = pkg[field];
    if (!deps || typeof deps !== "object") continue;
    for (const dep of Object.keys(deps)) {
      const targets = index.lookup("npm", dep);
      if (!targets.length) continue;
      c.add(targets, {
        file: f.path,
        line: lineOf(f.text, new RegExp(`"${escape(dep)}"\\s*:`)),
        kind,
        what: dep
      });
    }
  }
}
function requirements(f, index, c) {
  f.text.split("\n").forEach((l, i) => {
    const m = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(l.replace(/#.*/, ""));
    if (!m || l.trim().startsWith("-")) return;
    const targets = index.lookup("pypi", m[1]);
    if (targets.length)
      c.add(targets, { file: f.path, line: i + 1, kind: "dependency", what: m[1] });
  });
}
function pyproject(f, index, c) {
  let section = "";
  let inDeps = false;
  f.text.split("\n").forEach((l, i) => {
    const header = /^\s*\[{1,2}([^\]]+)\]{1,2}\s*$/.exec(l);
    if (header) {
      section = header[1].trim();
      inDeps = false;
      return;
    }
    const names = [];
    if (/^tool\.poetry(?:\.group\.[^.]+)?\.(?:dev-)?dependencies$/.test(section)) {
      const m = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*=/.exec(l);
      if (m && m[1] !== "python") names.push(m[1]);
    } else {
      const arrayStart = /^\s*(?:dependencies|requires)\s*=\s*\[/.test(l);
      const anyArray = section === "project.optional-dependencies" || section === "dependency-groups";
      if (section === "project" && arrayStart) inDeps = true;
      if (inDeps || anyArray)
        for (const m of l.matchAll(/["']([A-Za-z0-9][A-Za-z0-9._-]*)/g)) names.push(m[1]);
      if (inDeps && l.includes("]")) inDeps = false;
    }
    for (const n of names) {
      const targets = index.lookup("pypi", n);
      if (targets.length)
        c.add(targets, { file: f.path, line: i + 1, kind: "dependency", what: n });
    }
  });
}
function goMod(f, index, c) {
  f.text.split("\n").forEach((l, i) => {
    const m = /^\s*(?:require\s+)?([a-z0-9.-]+\.[a-z]{2,}\/\S+)\s+v\d/.exec(l);
    if (!m) return;
    const targets = index.lookup("go", m[1]);
    if (targets.length)
      c.add(targets, { file: f.path, line: i + 1, kind: "dependency", what: m[1] });
  });
}
function gemfile(f, index, c) {
  f.text.split("\n").forEach((l, i) => {
    const m = /^\s*gem\s+["']([^"']+)["']/.exec(l);
    if (!m) return;
    const targets = index.lookup("gem", m[1]);
    if (targets.length)
      c.add(targets, { file: f.path, line: i + 1, kind: "dependency", what: m[1] });
  });
}
function env(name, index) {
  return index.lookup("env", envKey(name));
}
function addEnv(f, i, name, index, c) {
  const targets = env(name, index);
  if (targets.length) c.add(targets, { file: f.path, line: i + 1, kind: "env", what: name });
}
function envExample(f, index, c) {
  f.text.split("\n").forEach((l, i) => {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(l);
    if (m) addEnv(f, i, m[1], index, c);
  });
}
function vercelJson(f, index, c) {
  let cfg;
  try {
    cfg = JSON.parse(f.text);
  } catch {
    return;
  }
  if (Array.isArray(cfg.regions)) {
    const line = lineOf(f.text, /"regions"\s*:/);
    for (const r of cfg.regions)
      if (typeof r === "string") {
        const city = VERCEL_REGIONS[r];
        c.region("vercel", city ? `${r} (${city})` : r, f.path, line);
      }
  }
  for (const block of [cfg.env, cfg.build?.env])
    if (block && typeof block === "object")
      for (const k of Object.keys(block))
        addEnv(f, lineOf(f.text, new RegExp(`"${escape(k)}"\\s*:`)) - 1, k, index, c);
}
function wrangler(f, index, c) {
  if (f.path.endsWith(".toml")) {
    let inVars = false;
    f.text.split("\n").forEach((l, i) => {
      const header = /^\s*\[{1,2}([^\]]+)\]{1,2}\s*$/.exec(l);
      if (header) {
        inVars = /(?:^|\.)vars$/.test(header[1].trim());
        return;
      }
      const m = inVars ? /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(l) : null;
      if (m) addEnv(f, i, m[1], index, c);
    });
  } else {
    const vars = /"vars"\s*:\s*\{([^}]*)\}/.exec(f.text);
    if (vars)
      for (const m of vars[1].matchAll(/"([A-Za-z_][A-Za-z0-9_]*)"\s*:/g))
        addEnv(f, lineOf(f.text, new RegExp(`"${m[1]}"\\s*:`)) - 1, m[1], index, c);
  }
}
function simpleRegion(f, vendor, re, c) {
  const m = re.exec(f.text);
  if (m) c.region(vendor, m[1], f.path, lineOf(f.text, re));
}
function serverless(f, index, c) {
  const provider = /^\s*provider:\s*\n(?:\s+.*\n)*?\s+name:\s*["']?(\w+)/m.exec(f.text);
  const vendorId = provider ? SERVERLESS_PROVIDERS[provider[1]] : void 0;
  const vendor = vendorId ? index.catalog.vendors.find((v) => v.id === vendorId) : void 0;
  if (!vendor) return;
  const line = lineOf(f.text, /^\s*provider:/m);
  c.add([{ vendor }], { file: f.path, line, kind: "config", what: `provider ${provider[1]}` });
  simpleRegion(f, vendor.id, /^\s+region:\s*["']?([\w-]+)/m, c);
}
function terraform(f, index, c) {
  const lines = f.text.split("\n");
  lines.forEach((l, i) => {
    const m = /^\s*provider\s+"([\w-]+)"\s*\{/.exec(l);
    if (!m) return;
    const targets = index.lookup("terraform", m[1]);
    if (!targets.length) return;
    c.add(targets, { file: f.path, line: i + 1, kind: "terraform", what: `provider "${m[1]}"` });
    let depth = 0;
    for (let j = i; j < lines.length; j++) {
      const line = lines[j];
      depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
      const r = /^\s*region\s*=\s*"([\w-]+)"/.exec(line);
      if (r) for (const t of targets) c.region(t.vendor.id, r[1], f.path, j + 1);
      if (depth <= 0 && j > i) break;
    }
  });
}
function dockerfile(f, index, c) {
  f.text.split("\n").forEach((l, i) => {
    const m = /^\s*(ENV|ARG)\s+(.*)$/i.exec(l);
    if (!m) return;
    const rest = m[2];
    const names = rest.includes("=") ? [...rest.matchAll(/([A-Za-z_][A-Za-z0-9_]*)=/g)].map((x) => x[1]) : [/^([A-Za-z_][A-Za-z0-9_]*)/.exec(rest)?.[1]].filter((x) => !!x);
    for (const n of names) addEnv(f, i, n, index, c);
  });
}
function workflow(f, index, c) {
  f.text.split("\n").forEach((l, i) => {
    for (const m of l.matchAll(/\$\{\{\s*(?:secrets|vars)\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g))
      addEnv(f, i, m[1], index, c);
  });
}
function code(f, index, c) {
  const js = JS_FILE.test(f.path);
  const py = f.path.endsWith(".py");
  const go = f.path.endsWith(".go");
  f.text.split("\n").forEach((l, i) => {
    if (l.length > 2e3) return;
    const comment = COMMENT.test(l);
    if (js && !comment)
      for (const re of JS_IMPORTS)
        for (const m of l.matchAll(re)) {
          const spec = m[1];
          if (spec.startsWith(".") || spec.startsWith("/")) continue;
          const targets = [...index.lookup("npm", spec)];
          if (packageOf(spec) !== spec) targets.push(...index.lookup("npm", packageOf(spec)));
          if (targets.length)
            c.add(preferServices(targets), {
              file: f.path,
              line: i + 1,
              kind: "import",
              what: spec
            });
        }
    if (py && !comment) {
      const imp = /^\s*import\s+([\w.]+(?:\s*,\s*[\w.]+)*)/.exec(l);
      const from = /^\s*from\s+([\w.]+)\s+import\b/.exec(l);
      const mods = imp ? imp[1].split(/\s*,\s*/) : from ? [from[1]] : [];
      for (const mod of mods) {
        const targets = index.lookup("py", mod);
        if (targets.length)
          c.add(targets, { file: f.path, line: i + 1, kind: "import", what: mod });
      }
    }
    if (go && !comment)
      for (const m of l.matchAll(/"([a-z0-9.-]+\.[a-z]{2,}\/[^"\s]+)"/g)) {
        const targets = index.lookup("go", m[1]);
        if (targets.length)
          c.add(targets, { file: f.path, line: i + 1, kind: "import", what: m[1] });
      }
    for (const re of ENV_REFS) for (const m of l.matchAll(re)) addEnv(f, i, m[1], index, c);
    if (!comment && index.hostPattern)
      for (const m of l.matchAll(index.hostPattern)) {
        const inUrl = l.slice(Math.max(0, m.index - 2), m.index) === "//";
        c.add(index.hostTargetsOf(m[1]), {
          file: f.path,
          line: i + 1,
          kind: inUrl ? "host" : "mention",
          what: m[1]
        });
      }
  });
}

// src/version.ts
import { readFileSync } from "fs";
var cached;
function version() {
  if (cached !== void 0) return cached;
  try {
    cached = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
  } catch {
    cached = "0.0.0";
  }
  return cached;
}

// src/scan.ts
var DRAFT_NOTICE = "A draft to review, not legal advice. Each row is a vendor the code shows it uses; whether it is your sub-processor depends on the personal data you send it and on your contracts. Confirm every row before you publish the list.";
var OUTSIDE_CODE = "A list taken from code misses vendors outside it: your workspace (email, documents), support desk, CRM, payroll and anything your team uses by hand. Add those yourself.";
var STRONG = ["dependency", "import", "host", "config", "terraform"];
var KIND_ORDER = [
  "config",
  "terraform",
  "dependency",
  "import",
  "host",
  "dev-dependency",
  "env",
  "mention"
];
function rowsFrom(detection, catalog = CATALOG) {
  const rows = [];
  for (const vendor of catalog.vendors) {
    const hits = detection.hits.filter((h) => h.vendor === vendor.id);
    if (!hits.length) continue;
    const purposes = [];
    if (hits.some((h) => !h.purpose)) purposes.push(vendor.purpose);
    for (const h of hits) if (h.purpose && !purposes.includes(h.purpose)) purposes.push(h.purpose);
    const evidence = hits.map((h) => h.evidence).sort(
      (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) || a.line - b.line
    );
    const regions = detection.regions.filter((r) => r.vendor === vendor.id);
    const regionTexts = [...new Set(regions.map((r) => r.region))];
    rows.push({
      id: vendor.id,
      name: vendor.name,
      category: vendor.category,
      category_label: catalog.categories[vendor.category]?.label ?? vendor.category,
      kind: vendor.kind,
      purpose: purposes.join("; "),
      data: dataGuess(vendor, catalog),
      region: regionTexts.length ? regionTexts.join(", ") : null,
      region_from: regions[0] ? `${regions[0].file}:${regions[0].line}` : null,
      dpa: vendor.dpa,
      list: vendor.list,
      links_seen: vendor.seen,
      ...vendor.note ? { note: vendor.note } : {},
      confidence: evidence.some((e) => STRONG.includes(e.kind)) ? "high" : "medium",
      evidence
    });
  }
  return rows;
}
function reportFrom(walked, input) {
  const catalog = input.catalog ?? CATALOG;
  const rows = rowsFrom(detect(walked.files, new Index(catalog)), catalog);
  return {
    tool: "subprocessors",
    version: version(),
    root: input.shown,
    scanned_on: input.now.toISOString().slice(0, 10),
    draft: true,
    notice: DRAFT_NOTICE,
    subprocessors: rows.filter((r) => r.kind === "likely"),
    probably_not: rows.filter((r) => r.kind === "tooling"),
    not_read: {
      env_files: walked.skippedEnv,
      too_large: walked.skippedLarge,
      tests_skipped: walked.skippedTests,
      truncated: walked.truncated
    },
    files_read: walked.files.length,
    catalog: { updated: catalog.updated, vendors: catalog.vendors.length },
    outside_code: OUTSIDE_CODE,
    handoff: { line: HANDOFF_LINE, detail: HANDOFF_DETAIL, url: HANDOFF_URL }
  };
}
async function scanDir(dir, input) {
  const walked = await walk(dir, input);
  return reportFrom(walked, input);
}

// src/list.ts
var LIST_FILE = "subprocessors.json";
var DUTY = "Adding a sub-processor is a dated event: under GDPR Art. 28(2) your customers must be told before it processes their data, with the time to object their DPA gives (often 30 days, sometimes 14). Send the notice before this change is deployed, then add the vendor to subprocessors.json.";
var ID = /^[a-z0-9][a-z0-9-]*$/;
function regionText(r) {
  return r.region ?? `not in code: check your ${r.name} settings`;
}
function where(r) {
  return r.evidence.slice(0, 5).map((e) => e.line > 0 ? `${e.file}:${e.line}` : e.file);
}
function listFrom(report) {
  return {
    about: `Sub-processor list drafted by subprocessors ${version()} on ${report.scanned_on} from the code in ${report.root}. ${DRAFT_NOTICE} Set "status" to "confirmed" once a row is checked, and add vendors outside the code by hand.`,
    updated: report.scanned_on,
    subprocessors: report.subprocessors.map((r) => ({
      id: r.id,
      name: r.name,
      purpose: r.purpose,
      data: r.data,
      region: regionText(r),
      dpa: r.dpa,
      status: "draft",
      since: report.scanned_on,
      detected_from: where(r)
    })),
    not_subprocessors: report.probably_not.map((r) => ({
      id: r.id,
      name: r.name,
      reason: r.note ?? `${r.purpose}: usually not a sub-processor.`
    }))
  };
}
function invalid(file, cause) {
  return new CliError({
    code: "LIST_INVALID",
    cause: `${file}: ${cause}`,
    fix: `fix the file by hand, or move it aside and run \`subprocessors init\` to draft a new one`,
    retryable: false
  });
}
function parseList(text, file) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw invalid(file, `not JSON (${e instanceof Error ? e.message : String(e)})`);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw invalid(file, "not an object");
  const o = raw;
  if (!Array.isArray(o.subprocessors)) throw invalid(file, "`subprocessors` is not a list");
  const not = o.not_subprocessors ?? [];
  if (!Array.isArray(not)) throw invalid(file, "`not_subprocessors` is not a list");
  const ids = /* @__PURE__ */ new Set();
  for (const [i, e] of [...o.subprocessors, ...not].entries()) {
    const id = e?.id;
    if (typeof id !== "string" || !ID.test(id))
      throw invalid(file, `entry ${i + 1} has no lower-case-dashed \`id\``);
    if (ids.has(id)) throw invalid(file, `\`${id}\` is listed twice`);
    ids.add(id);
  }
  return {
    about: typeof o.about === "string" ? o.about : "",
    updated: typeof o.updated === "string" ? o.updated : "",
    subprocessors: o.subprocessors,
    not_subprocessors: not
  };
}
function checkAgainstList(report, list, file) {
  const known = new Set([...list.subprocessors, ...list.not_subprocessors].map((e) => e.id));
  const seen = new Set([...report.subprocessors, ...report.probably_not].map((r) => r.id));
  return result(
    report,
    { kind: "list", file },
    {
      added: report.subprocessors.filter((r) => !known.has(r.id)),
      addedNot: report.probably_not.filter((r) => !known.has(r.id)),
      removed: list.subprocessors.filter((e) => !seen.has(e.id) && vendorById(e.id) !== void 0).map((e) => ({ id: e.id, name: e.name }))
    }
  );
}
function checkAgainstBase(head, base, ref) {
  const before = new Set([...base.subprocessors, ...base.probably_not].map((r) => r.id));
  const now = new Set([...head.subprocessors, ...head.probably_not].map((r) => r.id));
  return result(
    head,
    { kind: "base", ref },
    {
      added: head.subprocessors.filter((r) => !before.has(r.id)),
      addedNot: head.probably_not.filter((r) => !before.has(r.id)),
      removed: [...base.subprocessors, ...base.probably_not].filter((r) => !now.has(r.id)).map((r) => ({ id: r.id, name: r.name }))
    }
  );
}
function result(report, against, d) {
  return {
    tool: "subprocessors",
    version: version(),
    root: report.root,
    checked_on: report.scanned_on,
    against,
    added: d.added.filter((r) => r.confidence === "high"),
    added_named: d.added.filter((r) => r.confidence !== "high"),
    added_probably_not: d.addedNot,
    removed: d.removed,
    notice: report.notice,
    duty: DUTY,
    handoff: report.handoff
  };
}

// src/mcp.ts
import { createInterface } from "readline";
var PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
var PATH = {
  type: "string",
  minLength: 1,
  maxLength: 1e3,
  description: "The directory holding the code (a repository or one app in a monorepo), absolute or relative to where the server was started. Omitted: the directory the server was started in."
};
var TOOLS = [
  {
    name: "subprocessors_scan",
    title: "Draft the sub-processor list from this code",
    description: `Reads a codebase on this machine and drafts its GDPR Art. 28 sub-processor list: every vendor the code shows it sends data to (hosting, databases, payments, email, LLM APIs, error monitoring, analytics, auth and more, from a catalog of ${CATALOG.vendors.length}), each with its purpose, a guess at the personal data it receives, the region where the code says it (vercel.json regions, Fly's primary region, a Terraform region), the vendor's DPA and its own sub-processor list, and the file and line each row was detected from. It reads package.json and other manifests, imports, API hosts in code, env variable names (never values; real .env files are never opened) and infrastructure files (vercel.json, wrangler.toml, Terraform, workflows). Vendors that are usually not sub-processors (GitHub for CI and sign-in) come apart in probably_not. Use it when someone needs a sub-processor list, a DPA annex or a trust-page table, or asks which third parties get their users' data. ${DRAFT_NOTICE} It cannot see vendors used outside the code (workspace, CRM, support desk, payroll). Makes no requests. Every result ends with a note that a hosted, dated list with customer notices is not built: "${HANDOFF_LINE}"`,
    inputSchema: {
      type: "object",
      properties: {
        path: PATH,
        include_tests: {
          type: "boolean",
          description: "true: also read tests, fixtures and examples below path (a mocked SDK there would show as a vendor). Omitted: false."
        }
      },
      additionalProperties: false
    },
    annotations: {
      title: "Draft the sub-processor list from this code",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  {
    name: "subprocessors_check",
    title: "Did this change add a sub-processor?",
    description: "Compares the vendors a codebase uses now with its committed list (subprocessors.json, or the file in `list`) or with the same code at a git ref (`base`, e.g. origin/main, read with git archive into a temporary directory). Returns `added`: vendors the code now uses that the list or the base did not have, each with the file and line that brought it in and its DPA; `added_named`: new vendors the code only names (env variable names, a dev dependency, a bare host), to confirm; `added_probably_not`: new vendors that are usually not sub-processors; `removed`: vendors no longer seen in the code. Adding a sub-processor means telling customers first (GDPR Art. 28(2); DPAs usually give 30 days to object, sometimes 14), so use it on a pull request or before a deploy that adds an SDK, an API call or a hosting provider. A draft to review, not legal advice. Makes no requests.",
    inputSchema: {
      type: "object",
      properties: {
        path: PATH,
        list: {
          type: "string",
          minLength: 1,
          maxLength: 1e3,
          description: "The committed list to compare with, relative to where the server was started. Give this or base, not both. Both omitted: subprocessors.json in path."
        },
        base: {
          type: "string",
          minLength: 1,
          maxLength: 200,
          pattern: "^[A-Za-z0-9_][A-Za-z0-9_./~^@{}-]*$",
          description: "A git ref to compare with: a branch, tag or commit (origin/main, HEAD~1, a sha). Give this or list, not both."
        }
      },
      additionalProperties: false
    },
    annotations: {
      title: "Did this change add a sub-processor?",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  }
];
function invalid2(cause, fix) {
  throw new CliError({ code: "INVALID_INPUT", cause, fix, retryable: false });
}
function checkArgs(tool, raw) {
  if (raw === void 0 || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw))
    invalid2(
      "arguments must be an object",
      `Pass { ${Object.keys(tool.inputSchema.properties).join("?, ")}? }.`
    );
  const props = tool.inputSchema.properties;
  const a = raw;
  for (const [k, v] of Object.entries(a)) {
    const p = props[k];
    if (!p) invalid2(`unknown argument \`${k}\``, `Use only: ${Object.keys(props).join(", ")}.`);
    if (v === void 0) continue;
    if (p.type === "boolean" && typeof v !== "boolean")
      invalid2(`\`${k}\` must be true or false`, "Omit it, or pass a boolean.");
    if (p.type === "string") {
      if (typeof v !== "string" || v.length < p.minLength || v.length > p.maxLength)
        invalid2(
          `\`${k}\` must be a string of ${String(p.minLength)} to ${String(p.maxLength)} characters`,
          "Omit it, or pass a string."
        );
      if (typeof p.pattern === "string" && !new RegExp(p.pattern).test(v))
        invalid2(`\`${k}\` does not match ${p.pattern}`, "Pass a git ref such as origin/main.");
    }
  }
  return a;
}
async function callTool(name, rawArgs, ctx = {}) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`unknown tool ${name}`);
  const now = ctx.now?.() ?? /* @__PURE__ */ new Date();
  const cwd = ctx.cwd ?? process.cwd();
  try {
    const args = checkArgs(tool, rawArgs);
    const shown = typeof args.path === "string" ? args.path : ".";
    if (name === "subprocessors_scan") {
      const report = await scan(shown, cwd, now, args.include_tests === true);
      return { structured: report, isError: false };
    }
    if (args.list !== void 0 && args.base !== void 0)
      invalid2("give list or base, not both", "Pass list for a committed file, or base for a ref.");
    const result2 = await check(shown, cwd, now, {
      list: args.list,
      base: args.base,
      exec: ctx.exec
    });
    return { structured: result2, isError: false };
  } catch (err) {
    const body = err instanceof CliError ? err.toJSON() : {
      code: "INTERNAL",
      cause: err instanceof Error ? err.message : String(err),
      fix: "Run subprocessors on the same directory in a terminal to see the error with its context, and report it at https://github.com/agentwares/subprocessors/issues.",
      retryable: false
    };
    return { structured: { ...body }, isError: true };
  }
}
var INSTRUCTIONS = "subprocessors drafts a GDPR Art. 28 sub-processor list from a codebase on this machine (vendors, purposes, data guesses, regions, DPA links, and the file and line each was detected from) and checks whether a change added a vendor, which means telling customers first. Read-only, no requests. A draft to review, not legal advice.";
async function handleMessage(msg, ctx) {
  if (Array.isArray(msg)) {
    const out = (await Promise.all(msg.map((m) => handleMessage(m, ctx)))).filter(
      (r) => r !== void 0
    );
    return out.length ? out : void 0;
  }
  const req = msg && typeof msg === "object" ? msg : {};
  const hasId = "id" in req && (typeof req.id === "string" || typeof req.id === "number");
  const id = hasId ? req.id : null;
  const error = (code2, message) => ({
    jsonrpc: "2.0",
    id,
    error: { code: code2, message }
  });
  if (!("method" in req) && ("result" in req || "error" in req)) return void 0;
  if (req.jsonrpc !== "2.0" || typeof req.method !== "string")
    return hasId || !("method" in req) ? error(-32600, "Invalid Request") : void 0;
  if (!hasId) return void 0;
  const params = req.params && typeof req.params === "object" ? req.params : {};
  switch (req.method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      const protocolVersion = PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0];
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "subprocessors", title: "subprocessors", version: version() },
          instructions: INSTRUCTIONS
        }
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
    case "tools/call": {
      const name = params.name;
      if (typeof name !== "string" || !TOOLS.some((t) => t.name === name))
        return error(
          -32602,
          `Unknown tool: ${String(name)}. Tools: ${TOOLS.map((t) => t.name).join(", ")}`
        );
      const { structured, isError } = await callTool(name, params.arguments, ctx);
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(structured) }],
          structuredContent: structured,
          isError
        }
      };
    }
    default:
      return error(-32601, `Method not found: ${req.method}`);
  }
}
async function serveStdio(ctx = {}) {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      process.stdout.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error" }
        }) + "\n"
      );
      continue;
    }
    try {
      const res = await handleMessage(msg, ctx);
      if (res !== void 0) process.stdout.write(JSON.stringify(res) + "\n");
    } catch (err) {
      process.stderr.write(
        `subprocessors mcp: ${err instanceof Error ? err.message : String(err)}
`
      );
    }
  }
}

// src/render.ts
var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortDate(day) {
  const [y, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]} ${y}`;
}
var KIND_WORDS = {
  dependency: "dependency",
  "dev-dependency": "dev dependency",
  import: "import",
  host: "API host",
  mention: "host named",
  env: "env name",
  config: "config",
  terraform: "Terraform"
};
function evidenceText(e) {
  const what = e.kind === "config" && e.file.endsWith(e.what) ? "" : ` ${e.what}`;
  return `${at(e)} (${KIND_WORDS[e.kind]}${what})`;
}
function at(e) {
  return e.line > 0 ? `${e.file}:${e.line}` : e.file;
}
var SHOWN = 5;
function detectedFrom(r, shown = SHOWN) {
  const head = r.evidence.slice(0, shown).map(evidenceText).join(", ");
  const more = r.evidence.length - shown;
  return more > 0 ? `${head}, and ${more} more` : head;
}
function regionText2(r) {
  return r.region ? `${r.region}, from ${r.region_from}` : `not in code: check your ${r.name} settings`;
}
function wrap(text, indent, width = 100) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    if (line && (indent + line + " " + w).length > width) {
      lines.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) lines.push(line);
  return lines.map((l, i) => i === 0 ? l : indent + l).join("\n");
}
function weakWhy(r) {
  const has = (k) => r.evidence.some((e) => e.kind === k);
  const what = [
    has("env") ? "env names" : "",
    has("dev-dependency") ? "a dev dependency" : "",
    has("mention") ? "a host named without a call" : ""
  ].filter(Boolean);
  const list = what.length > 1 ? `${what.slice(0, -1).join(", ")} and ${what.at(-1)}` : what[0];
  return `from ${list ?? "names"} only: confirm it is used in production`;
}
function rowText(r, extraNote) {
  const pad = "             ";
  const lines = [
    `  ${r.name} (${r.category_label})${r.confidence === "medium" ? `, ${weakWhy(r)}` : ""}`,
    `    purpose  ${wrap(r.purpose, pad)}`,
    `    data     ${wrap(`${r.data} (a guess)`, pad)}`,
    `    region   ${wrap(regionText2(r), pad)}`,
    `    DPA      ${r.dpa ?? "not found on 9 Oct 2026: look on the vendor's legal pages"}`,
    `    its list ${r.list ?? "not found"}`
  ];
  if (r.note && extraNote) lines.push(`    note     ${wrap(r.note, pad)}`);
  lines.push(`    detected from ${wrap(detectedFrom(r), pad)}`);
  return lines.join("\n");
}
function handoffText(h) {
  return `${h.line}
  ${wrap(`${h.detail} ${h.url}`, "  ")}
`;
}
function renderText(report) {
  const out = [];
  out.push(
    `subprocessors ${report.version}: a draft sub-processor list for ${report.root}, from its code (${shortDate(report.scanned_on)})`
  );
  out.push(wrap(report.notice, ""));
  out.push("");
  const sure = report.subprocessors.filter((r) => r.confidence === "high");
  const unsure = report.subprocessors.filter((r) => r.confidence === "medium");
  if (report.subprocessors.length) {
    if (sure.length) {
      out.push(`Likely sub-processors: ${sure.length}`);
      out.push("");
      for (const r of sure) out.push(rowText(r, true), "");
    }
    if (unsure.length) {
      out.push(`Named in the code, use not shown (confirm): ${unsure.length}`);
      out.push("");
      for (const r of unsure) out.push(rowText(r, true), "");
    }
  } else {
    out.push(
      `No vendor in the catalog (${report.catalog.vendors} vendors) was found in ${report.files_read} files.`,
      ""
    );
  }
  if (report.probably_not.length) {
    out.push(`Found, probably not sub-processors (confirm): ${report.probably_not.length}`);
    out.push("");
    for (const r of report.probably_not) out.push(rowText(r, true), "");
  }
  const notRead = [];
  if (report.not_read.env_files.length)
    notRead.push(
      `${report.not_read.env_files.join(", ")} (env files with real values are never opened; example env files were read for names only)`
    );
  if (report.not_read.tests_skipped)
    notRead.push(
      `${report.not_read.tests_skipped} test, fixture or example ${report.not_read.tests_skipped === 1 ? "file or folder" : "files and folders"} (--include-tests reads them)`
    );
  if (report.not_read.too_large.length)
    notRead.push(`${report.not_read.too_large.length} files over 1 MB`);
  if (report.not_read.truncated) notRead.push("the rest of the tree, past 50,000 files");
  if (notRead.length) out.push(wrap(`Not read: ${notRead.join("; ")}.`, ""));
  out.push(wrap(report.outside_code, ""));
  out.push("");
  out.push("Next");
  out.push(`  write ${LIST_FILE}, every row a draft, to confirm and commit:`);
  out.push(`    ${INSTALL} init`);
  out.push("  in CI, exit 1 when the code starts using a vendor the list does not have:");
  out.push(`    ${INSTALL} check`);
  out.push("");
  out.push(handoffText(report.handoff));
  return out.join("\n");
}
var cell = (s) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
function renderMarkdown(report) {
  const out = [];
  out.push(
    `<!-- Drafted by subprocessors ${report.version} on ${report.scanned_on} from the code in ${report.root}. ${report.notice} -->`,
    "",
    "| Sub-processor | Purpose | Personal data | Location | DPA |",
    "| --- | --- | --- | --- | --- |"
  );
  for (const r of report.subprocessors)
    out.push(
      `| ${cell(r.name)}${r.confidence === "medium" ? " (confirm)" : ""} | ${cell(r.purpose)} | ${cell(r.data)} | ${cell(r.region ?? "to confirm")} | ${r.dpa ? `[DPA](${r.dpa})` : "to find"} |`
    );
  out.push("", "Detected from (remove this part before publishing):", "");
  for (const r of [...report.subprocessors, ...report.probably_not])
    out.push(
      `- **${r.name}**${r.kind === "tooling" ? " (probably not a sub-processor)" : ""}: ${[
        ...new Set(r.evidence.map(at))
      ].slice(0, SHOWN).map((w) => `\`${w}\``).join(", ")}`
    );
  out.push("", `<!-- ${report.outside_code} -->`, "");
  return out.join("\n");
}
function renderJson(value) {
  return JSON.stringify(value, null, 2) + "\n";
}
function renderCheck(c) {
  const against = c.against.kind === "list" ? c.against.file : `the code at ${c.against.ref}`;
  const out = [];
  out.push(
    `subprocessors ${c.version} check: ${c.root} against ${against} (${shortDate(c.checked_on)})`
  );
  out.push("");
  if (c.added.length) {
    out.push(`New sub-processors: ${c.added.length}`);
    for (const r of c.added) {
      out.push(`  ${r.name} (${r.purpose})`);
      out.push(`    detected from ${wrap(detectedFrom(r, 3), "             ")}`);
      out.push(`    DPA ${r.dpa ?? "not found: look on the vendor's legal pages"}`);
    }
    out.push("");
    out.push(wrap(c.duty, ""));
  } else out.push("No new sub-processors.");
  if (c.added_named.length) {
    out.push("");
    out.push(
      wrap(
        `New, named in the code but not shown to be used (confirm; not counted): ${c.added_named.map((r) => `${r.name} (${detectedFrom(r, 1)})`).join("; ")}`,
        ""
      )
    );
  }
  if (c.added_probably_not.length) {
    out.push("");
    out.push(
      `New, probably not sub-processors (shown, not counted): ${c.added_probably_not.map((r) => `${r.name} (${detectedFrom(r, 1)})`).join("; ")}`
    );
  }
  if (c.removed.length) {
    out.push("");
    out.push(
      wrap(
        `No longer seen in the code: ${c.removed.map((r) => r.name).join(", ")}. Still used outside the code, or gone? If gone, update the list${c.against.kind === "list" ? "" : ` (${LIST_FILE})`} and your public page.`,
        ""
      )
    );
  }
  out.push("");
  out.push(wrap(c.notice, ""));
  out.push("");
  out.push(handoffText(c.handoff));
  return out.join("\n");
}
function renderVendors(catalog = CATALOG) {
  const out = [
    `subprocessors ${version()}: ${catalog.vendors.length} vendors in the catalog, links read ${shortDate(catalog.updated)}`,
    ""
  ];
  for (const [id, cat] of Object.entries(catalog.categories)) {
    const vs = catalog.vendors.filter((v) => v.category === id);
    if (!vs.length) continue;
    out.push(`${cat.label}`);
    for (const v of vs)
      out.push(
        `  ${v.name.padEnd(24)} ${v.kind === "tooling" ? "(usually not) " : ""}DPA ${v.dpa ?? "not found"}`
      );
    out.push("");
  }
  return out.join("\n");
}
function vendorsJson(catalog = CATALOG) {
  return {
    tool: "subprocessors",
    version: version(),
    updated: catalog.updated,
    about: catalog.about,
    vendors: catalog.vendors.map((v) => ({
      id: v.id,
      name: v.name,
      category: catalog.categories[v.category]?.label ?? v.category,
      kind: v.kind,
      purpose: v.purpose,
      data: dataGuess(v, catalog),
      dpa: v.dpa,
      list: v.list,
      links_seen: v.seen,
      ...v.note ? { note: v.note } : {}
    }))
  };
}
function renderError(e, json) {
  if (json) return JSON.stringify({ error: e }, null, 2) + "\n";
  return `subprocessors: ${e.code}: ${e.cause}
  fix: ${e.fix}
`;
}

// src/main.ts
var HELP = `subprocessors ${version()} \u2014 your sub-processor list, drafted from your code

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
var defaultDeps = {
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s)
};
async function main(argv, deps = defaultDeps) {
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
var COMMANDS = ["scan", "init", "check", "vendors", "demo", "mcp", "help"];
var PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));
var DEMO_DIR = "examples/demo-repo";
async function run(argv, deps) {
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
        version: { type: "boolean", short: "v" }
      }
    });
  } catch (e) {
    throw usage(
      e instanceof Error ? e.message : String(e),
      `run \`${INSTALL} --help\` for the options`
    );
  }
  const { values, positionals } = parsed;
  if (values.version) {
    deps.stdout(`${version()}
`);
    return 0;
  }
  let [command, ...rest] = positionals;
  if (values.help || command === "help") {
    deps.stdout(HELP);
    return 0;
  }
  if (command === void 0 || !COMMANDS.includes(command)) {
    rest = command === void 0 ? [] : [command, ...rest];
    command = "scan";
  }
  if (values.json && values.md) throw usage("--json and --md are one or the other", "drop one");
  if (values.list !== void 0 && values.base !== void 0)
    throw usage("--list and --base are one or the other", "compare with a list, or with a ref");
  if ((values.list !== void 0 || values.base !== void 0) && command !== "check")
    throw usage(`--list and --base belong to check`, `run \`${INSTALL} check --base <ref>\``);
  if (values.force && command !== "init")
    throw usage("--force belongs to init", `run \`${INSTALL} init --force\``);
  const now = deps.now?.() ?? /* @__PURE__ */ new Date();
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
      values.json ? renderJson(report) : values.md ? renderMarkdown(report) : renderText(report)
    );
    return 0;
  }
  const shown = rest[0] ?? ".";
  const dir = path3.resolve(cwd, shown);
  if (command === "scan") {
    const report = await scan(shown, cwd, now, !!values["include-tests"]);
    deps.stdout(
      values.json ? renderJson(report) : values.md ? renderMarkdown(report) : renderText(report)
    );
    return 0;
  }
  if (command === "init") {
    const target = path3.join(dir, LIST_FILE);
    if (existsSync(target) && !values.force)
      throw new CliError({
        code: "LIST_EXISTS",
        cause: `${path3.join(shown, LIST_FILE)} already exists`,
        fix: `compare with it instead (\`${INSTALL} check\`), or overwrite it with \`${INSTALL} init --force\``,
        retryable: false
      });
    const report = await scan(shown, cwd, now, !!values["include-tests"]);
    const list = listFrom(report);
    await writeFile(target, JSON.stringify(list, null, 2) + "\n");
    if (values.json) deps.stdout(renderJson({ wrote: path3.join(shown, LIST_FILE), list }));
    else
      deps.stdout(
        `Wrote ${path3.join(shown, LIST_FILE)}: ${list.subprocessors.length} sub-processors as drafts, ${list.not_subprocessors.length} set aside as probably not.
${report.notice}
Set "status" to "confirmed" on each row you have checked, add vendors outside the code by hand, and commit it. Then \`${INSTALL} check\` in CI flags a pull request that adds a vendor.
`
      );
    return 0;
  }
  const result2 = await check(shown, cwd, now, {
    list: values.list,
    base: values.base,
    includeTests: !!values["include-tests"],
    exec: deps.exec
  });
  deps.stdout(values.json ? renderJson(result2) : renderCheck(result2));
  return result2.added.length ? 1 : 0;
}
async function scan(shown, cwd, now, includeTests) {
  const dir = path3.resolve(cwd, shown);
  const isDir = await stat(dir).then(
    (s) => s.isDirectory(),
    () => false
  );
  if (!isDir)
    throw new CliError({
      code: "DIR_NOT_FOUND",
      cause: `no directory at ${shown}`,
      fix: `pass a checkout of your code: \`${INSTALL} .\``,
      retryable: false
    });
  return scanDir(dir, { shown, now, includeTests });
}
async function check(shown, cwd, now, opts) {
  const head = await scan(shown, cwd, now, !!opts.includeTests);
  const dir = path3.resolve(cwd, shown);
  if (opts.base !== void 0) {
    const snap = await snapshotAt(dir, opts.base, opts.exec ?? execQuiet);
    try {
      const base = await scanDir(snap.dir, { shown, now, includeTests: !!opts.includeTests });
      return checkAgainstBase(head, base, opts.base);
    } finally {
      await snap.cleanup();
    }
  }
  const file = opts.list ?? path3.join(shown, LIST_FILE);
  const full = path3.resolve(cwd, file);
  const text = await readFile2(full, "utf8").catch(() => null);
  if (text === null)
    throw new CliError({
      code: "LIST_MISSING",
      cause: `no list at ${file}`,
      fix: `draft one with \`${INSTALL} init\` and commit it, or compare with a git ref: \`${INSTALL} check --base origin/main\``,
      retryable: false
    });
  return checkAgainstList(head, parseList(text, file), file);
}

// src/cli.ts
main(process.argv.slice(2)).then(
  (code2) => {
    process.exitCode = code2;
  },
  (err) => {
    process.stderr.write(`subprocessors: ${err instanceof Error ? err.message : String(err)}
`);
    process.exitCode = 1;
  }
);
//# sourceMappingURL=cli.js.map