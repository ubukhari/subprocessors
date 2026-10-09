/**
 * The committed list, `subprocessors.json`, and the check against it.
 *
 * `init` writes it from a draft, every row `"status": "draft"`, for the user to confirm, edit and
 * commit. `check` then compares what the code uses with it: a vendor the code uses and the list
 * does not have is a new sub-processor, which starts a customer-notice duty, so `check` exits 1.
 * A vendor on the list that the code no longer shows is reported and never fails: it may be used
 * outside the code. Entries the user adds by hand (a workspace, a CRM) can use any id.
 */
import { vendorById } from "./catalog.js";
import { CliError } from "./errors.js";
import { DRAFT_NOTICE, type Report, type Row } from "./scan.js";
import { version } from "./version.js";

export const LIST_FILE = "subprocessors.json";

/** What adding a vendor means, in every check's output. */
export const DUTY =
  "Adding a sub-processor is a dated event: under GDPR Art. 28(2) your customers must be told before it processes their data, with the time to object their DPA gives (often 30 days, sometimes 14). Send the notice before this change is deployed, then add the vendor to subprocessors.json.";

export type Status = "draft" | "confirmed";

export interface ListEntry {
  /** A catalog id, or any lower-case-dashed id for a vendor added by hand. */
  id: string;
  name: string;
  purpose: string;
  data: string;
  region: string;
  dpa: string | null;
  status: Status;
  /** The day the vendor was added to the list. */
  since: string;
  /** Where the code showed it, when the list was drafted. */
  detected_from?: string[];
}

export interface NotEntry {
  id: string;
  name: string;
  reason: string;
}

export interface ListFile {
  about: string;
  updated: string;
  subprocessors: ListEntry[];
  /** Vendors the code uses that the user decided are not sub-processors (CI, sign-in). */
  not_subprocessors: NotEntry[];
}

const ID = /^[a-z0-9][a-z0-9-]*$/;

function regionText(r: Row): string {
  return r.region ?? `not in code: check your ${r.name} settings`;
}

function where(r: Row): string[] {
  return r.evidence.slice(0, 5).map((e) => (e.line > 0 ? `${e.file}:${e.line}` : e.file));
}

/** The list `init` writes: the draft's sub-processors, and the rest set aside with a reason. */
export function listFrom(report: Report): ListFile {
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
      status: "draft" as const,
      since: report.scanned_on,
      detected_from: where(r),
    })),
    not_subprocessors: report.probably_not.map((r) => ({
      id: r.id,
      name: r.name,
      reason: r.note ?? `${r.purpose}: usually not a sub-processor.`,
    })),
  };
}

function invalid(file: string, cause: string): CliError {
  return new CliError({
    code: "LIST_INVALID",
    cause: `${file}: ${cause}`,
    fix: `fix the file by hand, or move it aside and run \`subprocessors init\` to draft a new one`,
    retryable: false,
  });
}

/** Parse and check a committed list; any shape problem is an error naming the file. */
export function parseList(text: string, file: string): ListFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw invalid(file, `not JSON (${e instanceof Error ? e.message : String(e)})`);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw invalid(file, "not an object");
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.subprocessors)) throw invalid(file, "`subprocessors` is not a list");
  const not = o.not_subprocessors ?? [];
  if (!Array.isArray(not)) throw invalid(file, "`not_subprocessors` is not a list");
  const ids = new Set<string>();
  for (const [i, e] of [...o.subprocessors, ...not].entries()) {
    const id = (e as { id?: unknown } | null)?.id;
    if (typeof id !== "string" || !ID.test(id))
      throw invalid(file, `entry ${i + 1} has no lower-case-dashed \`id\``);
    if (ids.has(id)) throw invalid(file, `\`${id}\` is listed twice`);
    ids.add(id);
  }
  return {
    about: typeof o.about === "string" ? o.about : "",
    updated: typeof o.updated === "string" ? o.updated : "",
    subprocessors: o.subprocessors as ListEntry[],
    not_subprocessors: not as NotEntry[],
  };
}

export type Against = { kind: "list"; file: string } | { kind: "base"; ref: string };

export interface CheckResult {
  tool: "subprocessors";
  version: string;
  root: string;
  checked_on: string;
  against: Against;
  /** New sub-processors: the duty applies. */
  added: Row[];
  /**
   * New vendors the code only names (env variable names, a dev dependency, a bare host): shown, to
   * confirm, never counted, so a table of hosts in a docs page does not fail a pull request.
   */
  added_named: Row[];
  /** New vendors that are usually not sub-processors: shown, never fail. */
  added_probably_not: Row[];
  /** On the list (or in the base) and no longer seen in the code. */
  removed: { id: string; name: string }[];
  notice: string;
  duty: string;
  handoff: Report["handoff"];
}

/** Compare a draft with a committed list. */
export function checkAgainstList(report: Report, list: ListFile, file: string): CheckResult {
  const known = new Set([...list.subprocessors, ...list.not_subprocessors].map((e) => e.id));
  const seen = new Set([...report.subprocessors, ...report.probably_not].map((r) => r.id));
  return result(
    report,
    { kind: "list", file },
    {
      added: report.subprocessors.filter((r) => !known.has(r.id)),
      addedNot: report.probably_not.filter((r) => !known.has(r.id)),
      removed: list.subprocessors
        // a vendor added by hand (not in the catalog) is outside the code: never "removed"
        .filter((e) => !seen.has(e.id) && vendorById(e.id) !== undefined)
        .map((e) => ({ id: e.id, name: e.name })),
    },
  );
}

/** Compare a draft with the draft of the same directory at a git ref. */
export function checkAgainstBase(head: Report, base: Report, ref: string): CheckResult {
  const before = new Set([...base.subprocessors, ...base.probably_not].map((r) => r.id));
  const now = new Set([...head.subprocessors, ...head.probably_not].map((r) => r.id));
  return result(
    head,
    { kind: "base", ref },
    {
      added: head.subprocessors.filter((r) => !before.has(r.id)),
      addedNot: head.probably_not.filter((r) => !before.has(r.id)),
      removed: [...base.subprocessors, ...base.probably_not]
        .filter((r) => !now.has(r.id))
        .map((r) => ({ id: r.id, name: r.name })),
    },
  );
}

function result(
  report: Report,
  against: Against,
  d: { added: Row[]; addedNot: Row[]; removed: { id: string; name: string }[] },
): CheckResult {
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
    handoff: report.handoff,
  };
}
