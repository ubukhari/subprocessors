# Changelog

## 0.1.0 (2026-10-09)

First release.

- `subprocessors [dir]` drafts the GDPR Art. 28 sub-processor list from the code: every vendor it
  shows it sends data to, with its purpose, a guess at the personal data, the region where the code
  says it (Vercel regions, Fly's primary region, a Terraform or Serverless region), the vendor's
  DPA and its own sub-processor list, and the file and line of each piece of evidence. `--md` for a
  Markdown table, `--json` for the rest.
- It reads `package.json`, `requirements*.txt`, `pyproject.toml`, `go.mod` and `Gemfile`; imports
  in JS, TS, Python and Go; API hosts in string literals (a host in a URL is a call, a bare host
  only named); env variable names (never values) from
  code, example env files, `vercel.json`, `wrangler.toml`, Dockerfiles and workflows; and
  infrastructure files and Terraform providers. A real `.env` or `.env.local` is never opened.
  Tests, fixtures, mocks and examples are skipped unless `--include-tests`. Rows come in three
  groups: likely, named only (to confirm), and usually not sub-processors.
- 70 vendors in the catalog, links read on 9 October 2026: 50 DPAs and 32 sub-processor lists
  found; the rest say so.
- `subprocessors init` writes `subprocessors.json`, every row a draft. `subprocessors check`
  compares the code with it, or with the code at a git ref (`--base`), and exits 1 when the code
  uses a vendor the list does not have.
- A GitHub Action, `uses: agentwares/subprocessors@main`, warns (or with `fail-on-new: true` fails)
  on the line that brought a new vendor in.
- `subprocessors mcp` serves `subprocessors_scan` and `subprocessors_check` over stdio, read-only.
- No runtime dependencies, no requests, no account, no LLM calls. A draft to review, not legal
  advice.
