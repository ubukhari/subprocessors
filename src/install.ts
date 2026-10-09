/**
 * How to run subprocessors: the one constant behind every place the command is shown or printed
 * (`--help` and the CLI's own hints, the README, the plugin skill and marketplace, and agentcheck's
 * /subprocessors pages).
 *
 * npm does not serve `subprocessors` yet, so it runs from the public repo, whose committed dist/
 * needs no build (scripts/sync-oss-repos.sh). The day npm serves it, flip ON_NPM and rewrite the
 * rest:
 *
 *   SUBPROCESSORS_WRITE_INSTALL=1 pnpm --filter subprocessors exec vitest run src/distribution
 *
 * The GitHub form carries `--allow-git=root`: npm 12 refuses a git spec unless `--allow-git`
 * permits it (its default is `none`), `root` permits only the spec named on the command line, and
 * npm 10 and 11 accept the flag (the same form as REL-1, checked 8 Oct 2026).
 *
 * src/distribution.test.ts fails while any surface names another form of the command.
 */
export const ON_NPM: boolean = false;

/**
 * Whether the public repo agentwares/subprocessors is up, so that INSTALL and ACTION resolve.
 * Until it is, agentcheck's /subprocessors pages (which import a mirror of this file) show no
 * `npx` line and no `uses:` snippet, only the grep anyone can run today: a page never prints a
 * command that 404s. The README and the CLI live in that repo, so they name the command as they
 * are.
 *
 * Flip it to true the day the sync has pushed the repo, then rewrite the mirror:
 *
 *   SUBPROCESSORS_WRITE_INSTALL=1 pnpm --filter subprocessors exec vitest run src/distribution
 */
export const PUBLISHED: boolean = false;

export const NAME = "subprocessors";
export const REPO = `https://github.com/agentwares/${NAME}`;

/** What a person types. */
export const INSTALL = ON_NPM ? `npx ${NAME}` : `npx --allow-git=root github:agentwares/${NAME}`;

/** What an agent runs unattended: no install prompt, and on npm the newest version, not a cached one. */
export const RUN = ON_NPM
  ? `npx -y ${NAME}@latest`
  : `npx -y --allow-git=root github:agentwares/${NAME}`;

/** The GitHub Action, as a workflow names it. */
export const ACTION = "agentwares/subprocessors@main";
