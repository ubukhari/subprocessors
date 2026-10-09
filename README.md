# subprocessors

Your sub-processor list, drafted from your code.

```sh
npx --allow-git=root github:agentwares/subprocessors
```

It reads the repository on your machine and lists every vendor your code shows it sends data to:
hosting, databases, payments, email, LLM APIs, error monitoring, analytics, auth and more. Each row
has the vendor's purpose, a guess at the personal data it receives, the region where your code says
it runs, the vendor's DPA and its own sub-processor list, and **the file and line it was detected
from**, so you can check it.

**A draft to review, not legal advice.** Whether a vendor is your sub-processor depends on the
personal data you send it and on your contracts. A list taken from code also misses vendors outside
it (your workspace, support desk, CRM, payroll): add those by hand.

## Why a list, and why it has to stay current

Under GDPR Art. 28(2), a processor that uses other processors must tell its customers "of any
intended changes concerning the addition or replacement of other processors", giving them the
chance to object. DPAs usually give 30 days, sometimes 14. So adding a vendor's SDK to production is
a dated event: the notice has to go out before the change is deployed.

`subprocessors check` and the GitHub Action catch that change on the pull request that makes it.

## What it reads, and what it never does

- **Manifests:** every `package.json` (dependencies, dev, peer and optional), `requirements*.txt`,
  `pyproject.toml`, `go.mod` and `Gemfile`. Lockfiles are not read: an SDK that arrives only as a
  transitive dependency is not a vendor you engaged.
- **Code:** imports in JS, TS, Python and Go, and API hosts in string literals
  (`api.resend.com`, `hooks.slack.com`). A host inside a URL counts as a call; the same host as a
  bare string, as in a table of hosts, is only named, and its row is set apart to confirm. Comment
  lines are skipped.
- **Env variable names, never values:** `process.env.X`, `import.meta.env.X`, `env.X`,
  `os.environ`, `os.getenv`, `os.Getenv`, `Deno.env.get` and `ENV[...]`; example env files
  (`.env.example`, `.env.sample`), reduced to their names before anything else sees them;
  `vercel.json` env, `wrangler.toml` `[vars]`, Dockerfile `ENV` and `ARG`, workflow `secrets.X`.
  **A real `.env`, `.env.local` or `.dev.vars` is never opened**; the report lists it as not read.
- **Infrastructure:** `vercel.json` (and its `regions`), `wrangler.toml`, `netlify.toml`,
  `fly.toml` (`primary_region`), `render.yaml`, `railway.json`, `firebase.json`,
  `supabase/config.toml`, `serverless.yml`, `amplify.yml`, Terraform `provider` blocks (and a
  literal `region`), and `.github/workflows`.
- **Skipped:** `node_modules`, build output, dot-folders other than `.github`, and tests, fixtures,
  mocks and examples below the directory you scan, so a mocked SDK is not a vendor
  (`--include-tests` reads them).
- **Three groups:** likely sub-processors (a dependency, an import, an API call or a config file
  shows it); vendors only named (env variable names, a dev dependency or a bare host), to confirm;
  and vendors that are usually not sub-processors (GitHub for CI and sign-in), to decide.
- **No requests, no account, no telemetry, no LLM.** The vendor catalog is bundled: 70 vendors, with
  each DPA and sub-processor list link fetched on 9 October 2026; a link that could not be found is
  shown as not found, never guessed.

## Sample

The draft for the **synthetic** demo repo shipped with this package (`examples/demo-repo`, a
Next.js app written for the demo, not anyone's code), recorded on 9 October 2026:

```text
subprocessors 0.1.0: a draft sub-processor list for examples/demo-repo, from its code (9 Oct 2026)
A draft to review, not legal advice. Each row is a vendor the code shows it uses; whether it is your
sub-processor depends on the personal data you send it and on your contracts. Confirm every row
before you publish the list.

Likely sub-processors: 8

  Vercel (Hosting)
    purpose  Hosting and serverless functions; Web analytics (Vercel Analytics)
    data     Everything your app serves and handles while it runs there, including request logs with
             IP addresses (a guess)
    region   fra1 (Frankfurt), from vercel.json:3
    DPA      https://vercel.com/legal/dpa
    its list https://vercel.com/legal/sub-processors
    note     The list link redirects to Vercel's trust center.
    detected from vercel.json:1 (config), package.json:15 (dependency @vercel/analytics),
             src/app/layout.tsx:1 (import @vercel/analytics/react)

  Amazon Web Services (Cloud infrastructure)
    purpose  Cloud infrastructure; File storage (S3)
    data     Depends on the services you use: anything you store or process there (a guess)
    region   eu-central-1, from infra/main.tf:3
    DPA      https://d1.awsstatic.com/legal/aws-dpa/aws-dpa.pdf
    its list https://aws.amazon.com/compliance/sub-processors/
    detected from infra/main.tf:2 (Terraform provider "aws"), package.json:12 (dependency
             @aws-sdk/client-s3), src/lib/uploads.ts:1 (import @aws-sdk/client-s3)

  Neon (Database)
    purpose  Serverless Postgres database
    data     All personal data your app stores (a guess)
    region   not in code: check your Neon settings
    DPA      https://neon.com/dpa
    its list https://neon.com/subprocessors
    note     Neon is part of Databricks: the DPA link leads to Neon's platform terms under the
             Databricks agreement, and the list link to Databricks' sub-processor list.
    detected from package.json:13 (dependency @neondatabase/serverless), src/lib/db.ts:1 (import
             @neondatabase/serverless), src/lib/db.ts:2 (import drizzle-orm/neon-http)

  Stripe (Payments)
    purpose  Payments and billing
    data     Customers' names, email and billing addresses; card details, which the vendor holds (a
             guess)
    region   not in code: check your Stripe settings
    DPA      https://stripe.com/legal/dpa
    its list https://stripe.com/legal/service-providers
    note     Stripe's DPA gives 30 days to object to a new sub-processor, then deems it accepted
             (ConductAtlas, read 9 Oct 2026). Stripe is also an independent controller for some
             payment data.
    detected from package.json:22 (dependency stripe), src/lib/billing.ts:1 (import stripe),
             .env.example:6 (env name STRIPE_SECRET_KEY), .env.example:7 (env name
             STRIPE_WEBHOOK_SECRET), src/lib/billing.ts:3 (env name STRIPE_SECRET_KEY)

  Resend (Email delivery)
    purpose  Transactional email
    data     Recipients' names and email addresses, and message content (a guess)
    region   not in code: check your Resend settings
    DPA      https://resend.com/legal/dpa
    its list https://resend.com/legal/subprocessors
    detected from src/lib/email.ts:3 (API host api.resend.com), .env.example:8 (env name RESEND_API_KEY),
             src/lib/email.ts:6 (env name RESEND_API_KEY)

  Anthropic (LLM inference)
    purpose  LLM inference (Claude)
    data     Prompts and outputs, and any personal data users or your app put in them (a guess)
    region   not in code: check your Anthropic settings
    DPA      https://www.anthropic.com/legal/data-processing-addendum
    its list https://trust.anthropic.com/subprocessors
    detected from package.json:11 (dependency @anthropic-ai/sdk), src/lib/ai.ts:1 (import
             @anthropic-ai/sdk), .env.example:9 (env name ANTHROPIC_API_KEY)

  Sentry (Error monitoring)
    purpose  Error and performance monitoring
    data     IP addresses, user IDs or emails attached to errors, and request data in stack traces
             (a guess)
    region   not in code: check your Sentry settings
    DPA      https://sentry.io/legal/dpa/
    its list https://sentry.io/legal/subprocessors/
    detected from package.json:14 (dependency @sentry/nextjs), sentry.server.config.ts:1 (import
             @sentry/nextjs), .env.example:11 (env name NEXT_PUBLIC_SENTRY_DSN),
             sentry.server.config.ts:3 (env name NEXT_PUBLIC_SENTRY_DSN)

  PostHog (Product analytics)
    purpose  Product analytics and session replay
    data     Usage events, device and browser data, IP addresses and user IDs (a guess)
    region   not in code: check your PostHog settings
    DPA      https://posthog.com/dpa
    its list https://posthog.com/subprocessors
    detected from package.json:19 (dependency posthog-js), src/app/posthog.tsx:2 (import posthog-js),
             src/app/posthog.tsx:7 (API host eu.i.posthog.com), .env.example:10 (env name
             NEXT_PUBLIC_POSTHOG_KEY), src/app/posthog.tsx:7 (env name NEXT_PUBLIC_POSTHOG_KEY)

Named in the code, use not shown (confirm): 1

  Slack (Team messaging), from env names only: confirm it is used in production
    purpose  Alerts and notifications to Slack
    data     Whatever your alerts and notifications contain (a guess)
    region   not in code: check your Slack settings
    DPA      https://slack.com/terms-of-service/data-processing
    its list not found
    detected from .env.example:12 (env name SLACK_WEBHOOK_URL), src/lib/alerts.ts:3 (env name
             SLACK_WEBHOOK_URL)

Found, probably not sub-processors (confirm): 1

  GitHub (Code hosting and CI)
    purpose  Code hosting and CI; Sign in with GitHub
    data     Your code; customer data only if a job reads production data or a user signs in with it
             (a guess)
    region   not in code: check your GitHub settings
    DPA      https://github.com/customer-terms/github-data-protection-agreement
    its list https://docs.github.com/en/site-policy/privacy-policies/github-subprocessors
    note     Usually not a sub-processor: CI runs your code, not your customers' data, and with Sign
             in with GitHub, GitHub is the controller of its own users' accounts. List it if a job
             reads production data or you send customer data to its API.
    detected from .github/workflows (config), src/auth.ts:2 (import next-auth/providers/github),
             .env.example:4 (env name AUTH_GITHUB_ID), .env.example:5 (env name AUTH_GITHUB_SECRET)

Not read: 1 test, fixture or example file or folder (--include-tests reads them).
A list taken from code misses vendors outside it: your workspace (email, documents), support desk,
CRM, payroll and anything your team uses by hand. Add those yourself.

Next
  write subprocessors.json, every row a draft, to confirm and commit:
    npx --allow-git=root github:agentwares/subprocessors init
  in CI, exit 1 when the code starts using a vendor the list does not have:
    npx --allow-git=root github:agentwares/subprocessors check

A hosted, dated sub-processor page that emails your customers each change is not built.
  It would publish the list you approved at a public URL, keep every change with its date, email
  your subscribers the notice with the day their objection window closes, and record who was told
  when. agentcheck runs scheduled checks of endpoints today; this is not one of them. If you would
  pay for it, say so with one click:
  https://agentwares-agentcheck.vercel.app/subprocessors?ref=subprocessors#ledger
```

## Commands

```sh
npx --allow-git=root github:agentwares/subprocessors [dir]        # the draft, as text
npx --allow-git=root github:agentwares/subprocessors [dir] --md   # a Markdown table to paste
npx --allow-git=root github:agentwares/subprocessors init [dir]   # write subprocessors.json, every row a draft
npx --allow-git=root github:agentwares/subprocessors check [dir]  # exit 1 when the code uses a vendor the list lacks
npx --allow-git=root github:agentwares/subprocessors vendors      # the catalog, with each DPA
npx --allow-git=root github:agentwares/subprocessors demo         # the draft for the demo repo
npx --allow-git=root github:agentwares/subprocessors mcp          # a local MCP server over stdio
```

- `--json` on the draft, `check` and `vendors`.
- `check --list <file>` compares with another file; `check --base <ref>` compares with the same
  directory at a git ref (`origin/main`, `HEAD~1`), read with `git archive` into a temporary
  directory. A vendor on the list that the code no longer shows is reported and never fails: it may
  be used outside the code. A new vendor the code only names (env variable names, a dev dependency,
  a bare host) is shown to confirm and never fails either; only one a dependency, an import, an API
  call or a config file shows does.
- `subprocessors.json` is yours to edit: set `"status": "confirmed"` on each row you have checked,
  add vendors outside the code with any id, and move a vendor you decide is not a sub-processor to
  `not_subprocessors`.
- Errors carry `code`, `cause`, `fix` and `retryable`. Exit codes: 0 fine, 1 a new sub-processor
  or an error, 2 a usage mistake.

## In CI: flag the pull request that adds a vendor

```yaml
# .github/workflows/subprocessors.yml
on:
  pull_request:
permissions:
  contents: read
jobs:
  subprocessors:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0
      - uses: agentwares/subprocessors@main
        with:
          fail-on-new: false
```

The Action runs the committed `dist/` with no install. With a committed `subprocessors.json` it
compares with that; without one, with the pull request's base commit (fetched from your own origin
if the checkout lacks it). It writes the result to the step summary and puts a warning on the line
that brought each new vendor in; `fail-on-new: true` makes it an error that fails the job. Inputs:
`path`, `list`, `base`, `fail-on-new`. Outputs: `added`, `removed`, `report`. A fuller example is in
[`examples/github-workflow.yml`](examples/github-workflow.yml).

## For agents: a local MCP server

`subprocessors mcp` serves two tools over stdio, with no dependencies:

- `subprocessors_scan`: a path in; the draft rows with their evidence out.
- `subprocessors_check`: a path, and a list or a git ref; the vendors added and removed.

Both are strict and read-only (`readOnlyHint: true`, `destructiveHint: false`,
`idempotentHint: true`, `openWorldHint: false`); they make no requests.

```json
{
  "mcpServers": {
    "subprocessors": {
      "command": "npx",
      "args": ["-y", "--allow-git=root", "github:agentwares/subprocessors", "mcp"]
    }
  }
}
```

A Claude Code plugin is in this repo too: `/plugin marketplace add agentwares/subprocessors`, then
`/plugin install subprocessors@subprocessors`.

## A hosted, dated sub-processor page that emails your customers each change is not built

It would publish the list you approved at a public URL, keep every change with its date, email your
subscribers the notice with the day their objection window closes, and record who was told when. If
you would pay for it, say so with one click on
[the subprocessors page](https://agentwares-agentcheck.vercel.app/subprocessors?ref=subprocessors#ledger).
It is from [agentcheck](https://agentwares-agentcheck.vercel.app/?ref=subprocessors), which runs
scheduled checks of endpoints today.

MIT licensed, by agentwares.
