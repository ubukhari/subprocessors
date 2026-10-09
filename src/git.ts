/**
 * `check --base <ref>`: the same directory as it was at a git ref, read with `git archive` into a
 * temporary directory that is removed afterwards. Nothing is written to the work tree, the index or
 * the refs; the only commands run are `git rev-parse`, `git archive` and `tar -x`.
 */
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CliError } from "./errors.js";

export type Exec = (cmd: string, args: string[], cwd: string) => Promise<string>;

export const execQuiet: Exec = (cmd, args, cwd) =>
  new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(String(stderr).trim() || err.message));
      else resolve(String(stdout));
    });
  });

/** A ref as a user or the Action passes it: a branch, tag, sha, `HEAD~1`, `origin/main`. */
const REF = /^[A-Za-z0-9_][A-Za-z0-9_./~^@{}-]*$/;

function gitError(cause: string, fix: string): CliError {
  return new CliError({ code: "GIT_FAILED", cause, fix, retryable: false });
}

export interface Snapshot {
  dir: string;
  cleanup: () => Promise<void>;
}

/** Extract `dir` as it was at `ref` into a temporary directory. */
export async function snapshotAt(
  dir: string,
  ref: string,
  exec: Exec = execQuiet,
): Promise<Snapshot> {
  if (!REF.test(ref))
    throw gitError(
      `"${ref}" is not a git ref this command accepts`,
      "pass a branch, tag or commit, e.g. `--base origin/main` or `--base HEAD~1`",
    );
  try {
    await exec("git", ["rev-parse", "--show-prefix"], dir);
  } catch (e) {
    throw gitError(
      `${dir} is not inside a git repository (${e instanceof Error ? e.message : String(e)})`,
      "run `check --base` in a git checkout, or compare with a committed list instead (`check --list subprocessors.json`)",
    );
  }
  try {
    await exec("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], dir);
  } catch {
    throw gitError(
      `git does not know the ref "${ref}" here`,
      "fetch it first (in Actions, `actions/checkout` with `fetch-depth: 0`), or pass a commit sha",
    );
  }
  const tmp = await mkdtemp(path.join(tmpdir(), "subprocessors-base-"));
  const cleanup = () => rm(tmp, { recursive: true, force: true });
  try {
    const tar = path.join(tmp, "base.tar");
    const tree = path.join(tmp, "tree");
    await mkdir(tree);
    // run in a subdirectory, git archive takes that directory only, with paths relative to it
    await exec("git", ["archive", "--format=tar", "-o", tar, ref], dir);
    await exec("tar", ["-xf", tar, "-C", tree], dir);
    return { dir: tree, cleanup };
  } catch (e) {
    await cleanup();
    throw gitError(
      `could not read ${ref} with git archive (${e instanceof Error ? e.message : String(e)})`,
      "check that the directory existed at that ref, or compare with a committed list instead",
    );
  }
}
