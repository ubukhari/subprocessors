/**
 * Test helper: write a fixture repository into a fresh temporary directory. Tests only; it is not
 * exported from the package.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export function fixtureRepo(
  files: Record<string, string>,
  prefix = "subprocessors-fixture-",
): string {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  for (const [rel, text] of Object.entries(files)) {
    const full = path.join(root, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
  return root;
}
