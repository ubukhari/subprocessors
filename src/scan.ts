/**
 * From detections to the draft: one row per vendor, with every piece of evidence, the region where
 * the code says it, and the vendor's DPA and own list from the catalog. Vendors that are usually
 * not sub-processors (CI, sign-in providers) come apart, for the user to confirm either way.
 */
import { CATALOG, dataGuess, type Catalog, type Kind } from "./catalog.js";
import { Index, detect, type Detection, type Evidence, type EvidenceKind } from "./detect.js";
import { HANDOFF_DETAIL, HANDOFF_LINE, HANDOFF_URL } from "./handoff.js";
import { version } from "./version.js";
import { walk, type RepoFile, type WalkOptions, type WalkResult } from "./walk.js";

/** On every output: what this is, and what it is not. */
export const DRAFT_NOTICE =
  "A draft to review, not legal advice. Each row is a vendor the code shows it uses; whether it is your sub-processor depends on the personal data you send it and on your contracts. Confirm every row before you publish the list.";

/** Also on every output: what a list taken from code cannot see. */
export const OUTSIDE_CODE =
  "A list taken from code misses vendors outside it: your workspace (email, documents), support desk, CRM, payroll and anything your team uses by hand. Add those yourself.";

export type Confidence = "high" | "medium";

export interface Row {
  id: string;
  name: string;
  category: string;
  category_label: string;
  kind: Kind;
  purpose: string;
  /** A guess at the personal data it receives. */
  data: string;
  /** Where the code says the vendor runs, or null when it does not say. */
  region: string | null;
  region_from: string | null;
  dpa: string | null;
  list: string | null;
  /** The day the catalog's links were read. */
  links_seen: string;
  note?: string;
  /**
   * high: a dependency, import, API call or config file; medium: only env names, a dev dependency,
   * or a host named without a call.
   */
  confidence: Confidence;
  evidence: Evidence[];
}

export interface Report {
  tool: "subprocessors";
  version: string;
  root: string;
  scanned_on: string;
  draft: true;
  notice: string;
  subprocessors: Row[];
  probably_not: Row[];
  not_read: {
    /** Real env files, never opened. */
    env_files: string[];
    too_large: string[];
    tests_skipped: number;
    truncated: boolean;
  };
  files_read: number;
  catalog: { updated: string; vendors: number };
  outside_code: string;
  handoff: { line: string; detail: string; url: string };
}

const STRONG: readonly EvidenceKind[] = ["dependency", "import", "host", "config", "terraform"];
const KIND_ORDER: readonly EvidenceKind[] = [
  "config",
  "terraform",
  "dependency",
  "import",
  "host",
  "dev-dependency",
  "env",
  "mention",
];

export function rowsFrom(detection: Detection, catalog: Catalog = CATALOG): Row[] {
  const rows: Row[] = [];
  for (const vendor of catalog.vendors) {
    const hits = detection.hits.filter((h) => h.vendor === vendor.id);
    if (!hits.length) continue;
    const purposes: string[] = [];
    if (hits.some((h) => !h.purpose)) purposes.push(vendor.purpose);
    for (const h of hits) if (h.purpose && !purposes.includes(h.purpose)) purposes.push(h.purpose);
    const evidence = hits
      .map((h) => h.evidence)
      .sort(
        (a, b) =>
          KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
          (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) ||
          a.line - b.line,
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
      ...(vendor.note ? { note: vendor.note } : {}),
      confidence: evidence.some((e) => STRONG.includes(e.kind)) ? "high" : "medium",
      evidence,
    });
  }
  return rows;
}

export interface ScanInput {
  /** The directory scanned, as the user named it (shown in the report). */
  shown: string;
  now: Date;
  catalog?: Catalog;
}

/** The report for files already read: pure, for tests and for `check --base`. */
export function reportFrom(walked: WalkResult, input: ScanInput): Report {
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
      truncated: walked.truncated,
    },
    files_read: walked.files.length,
    catalog: { updated: catalog.updated, vendors: catalog.vendors.length },
    outside_code: OUTSIDE_CODE,
    handoff: { line: HANDOFF_LINE, detail: HANDOFF_DETAIL, url: HANDOFF_URL },
  };
}

/** Scan a directory on this machine. */
export async function scanDir(dir: string, input: ScanInput & WalkOptions): Promise<Report> {
  const walked = await walk(dir, input);
  return reportFrom(walked, input);
}

/** Scan files given in memory (the MCP tool's tests, the README sample). */
export function scanFiles(files: RepoFile[], input: ScanInput): Report {
  return reportFrom(
    { files, skippedEnv: [], skippedLarge: [], skippedTests: 0, truncated: false },
    input,
  );
}

/** Every vendor id in a report, sub-processors and the rest. */
export function vendorIds(r: Report): string[] {
  return [...r.subprocessors, ...r.probably_not].map((row) => row.id);
}
