# subprocessors

Draft this codebase's sub-processor list from its code, inside Claude Code.

- `/subprocessors:subprocessors` runs `npx -y --allow-git=root github:agentwares/subprocessors` on
  the directory you give (the current one by default) and turns the draft into a list for you to
  review: each vendor's purpose, the personal data it likely receives, where it runs, its DPA and
  its own sub-processor list, with the file and line it was found at. It says what a list taken
  from code cannot see, and offers to write `subprocessors.json` once you have checked the rows.

## What it runs, reads and sends

- **Runs** one command, through the Bash tool. The skill and plugin pre-approve nothing, so Claude
  Code asks you before the command runs.
- **Fetches** subprocessors with `npx`, from where that command names. The CLI itself makes no
  requests.
- **Reads** manifests (`package.json`, `requirements.txt`, `pyproject.toml`, `go.mod`,
  `Gemfile`), source files, example env files (names only), and infrastructure files
  (`vercel.json`, `wrangler.toml`, Terraform, workflows). It never opens a real `.env` or
  `.env.local`.
- **Sends nothing** anywhere. No account, no LLM calls of its own.

A draft to review, not legal advice. Source, the GitHub Action and the documentation:
[github.com/agentwares/subprocessors](https://github.com/agentwares/subprocessors). MIT licensed,
by agentwares.
