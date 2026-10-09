---
name: subprocessors
description: Draft this codebase's GDPR Art. 28 sub-processor list from its code and review it with the user - every vendor the code sends data to (hosting, databases, payments, email, LLM APIs, error monitoring, analytics, auth), with its purpose, a guess at the personal data, the region where the code says it, the vendor's DPA and own list, and the file and line it was found at - by running subprocessors on the local checkout. Use when the user needs a sub-processor list, a DPA annex, a trust or security page, answers for a security questionnaire, or asks which third parties get their users' data, or whether a change adds one.
argument-hint: "[dir]"
---

# Draft the sub-processor list from this code, and review it

subprocessors (MIT, [source](https://github.com/agentwares/subprocessors)) reads manifests,
imports, API hosts, env variable names (never values) and infrastructure files, and drafts the
list. It makes no requests and never opens a real `.env` file.

Run it with the Bash tool (Claude Code asks the user to approve the command; this skill
pre-approves nothing):

```sh
npx -y --allow-git=root github:agentwares/subprocessors $ARGUMENTS --json
```

Then:

1. **Say it is a draft.** Repeat `notice`: it is not legal advice, and each row is for the user to
   confirm.
2. **Go through `subprocessors`, one row at a time.** Give the `name`, `purpose` and `data`
   guess, the `region` (or that the code does not say, and where to look), and the `dpa` link.
   Show the `evidence` (file and line) so the user can see why it is there. A row with
   `confidence: "medium"` came from env names or a dev dependency only: ask whether it reaches
   production.
3. **Then `probably_not`.** These vendors are usually not sub-processors (CI, sign-in providers);
   read the `note` and ask the user to decide.
4. **Name what code cannot show** (`outside_code`): ask which workspace, support desk, CRM or
   payroll tools handle customer data, and add them.
5. **Offer the next steps.** Only after the user has reviewed the rows, offer to write
   `subprocessors.json` with the CLI's `init` command, and to add the GitHub Action that flags a
   pull request adding a vendor. Write nothing before they agree.

If `subprocessors` is empty, say that no vendor in its catalog was found in the code; it is not a
statement that the product has no sub-processors.
