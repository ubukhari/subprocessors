/**
 * What a run prints: the draft as text, as a Markdown table to paste, or as JSON; a check's result;
 * the GitHub Action's annotations; and the catalog. Every output says it is a draft to review, not
 * legal advice, and ends with the hand-off line.
 */
import { CATALOG, dataGuess, type Catalog } from "./catalog.js";
import type { Evidence, EvidenceKind } from "./detect.js";
import type { Problem } from "./errors.js";
import { INSTALL } from "./install.js";
import { LIST_FILE, type CheckResult } from "./list.js";
import type { Report, Row } from "./scan.js";
import { version } from "./version.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `2026-10-09` → `9 Oct 2026`. */
export function shortDate(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]} ${y}`;
}

const KIND_WORDS: Record<EvidenceKind, string> = {
  dependency: "dependency",
  "dev-dependency": "dev dependency",
  import: "import",
  host: "API host",
  mention: "host named",
  env: "env name",
  config: "config",
  terraform: "Terraform",
};

export function evidenceText(e: Evidence): string {
  const what = e.kind === "config" && e.file.endsWith(e.what) ? "" : ` ${e.what}`;
  return `${at(e)} (${KIND_WORDS[e.kind]}${what})`;
}

/** `file:line`, or the file alone for a directory (line 0). */
export function at(e: Evidence): string {
  return e.line > 0 ? `${e.file}:${e.line}` : e.file;
}

const SHOWN = 5;

export function detectedFrom(r: Row, shown = SHOWN): string {
  const head = r.evidence.slice(0, shown).map(evidenceText).join(", ");
  const more = r.evidence.length - shown;
  return more > 0 ? `${head}, and ${more} more` : head;
}

export function regionText(r: Row): string {
  return r.region
    ? `${r.region}, from ${r.region_from}`
    : `not in code: check your ${r.name} settings`;
}

function wrap(text: string, indent: string, width = 100): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if (line && (indent + line + " " + w).length > width) {
      lines.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) lines.push(line);
  return lines.map((l, i) => (i === 0 ? l : indent + l)).join("\n");
}

/** Why a row has only medium confidence, in words. */
export function weakWhy(r: Row): string {
  const has = (k: EvidenceKind) => r.evidence.some((e) => e.kind === k);
  const what = [
    has("env") ? "env names" : "",
    has("dev-dependency") ? "a dev dependency" : "",
    has("mention") ? "a host named without a call" : "",
  ].filter(Boolean);
  const list = what.length > 1 ? `${what.slice(0, -1).join(", ")} and ${what.at(-1)}` : what[0];
  return `from ${list ?? "names"} only: confirm it is used in production`;
}

function rowText(r: Row, extraNote: boolean): string {
  const pad = "             ";
  const lines = [
    `  ${r.name} (${r.category_label})${r.confidence === "medium" ? `, ${weakWhy(r)}` : ""}`,
    `    purpose  ${wrap(r.purpose, pad)}`,
    `    data     ${wrap(`${r.data} (a guess)`, pad)}`,
    `    region   ${wrap(regionText(r), pad)}`,
    `    DPA      ${r.dpa ?? "not found on 9 Oct 2026: look on the vendor's legal pages"}`,
    `    its list ${r.list ?? "not found"}`,
  ];
  if (r.note && extraNote) lines.push(`    note     ${wrap(r.note, pad)}`);
  lines.push(`    detected from ${wrap(detectedFrom(r), pad)}`);
  return lines.join("\n");
}

function handoffText(h: Report["handoff"]): string {
  return `${h.line}\n  ${wrap(`${h.detail} ${h.url}`, "  ")}\n`;
}

export function renderText(report: Report): string {
  const out: string[] = [];
  out.push(
    `subprocessors ${report.version}: a draft sub-processor list for ${report.root}, from its code (${shortDate(report.scanned_on)})`,
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
      "",
    );
  }
  if (report.probably_not.length) {
    out.push(`Found, probably not sub-processors (confirm): ${report.probably_not.length}`);
    out.push("");
    for (const r of report.probably_not) out.push(rowText(r, true), "");
  }
  const notRead: string[] = [];
  if (report.not_read.env_files.length)
    notRead.push(
      `${report.not_read.env_files.join(", ")} (env files with real values are never opened; example env files were read for names only)`,
    );
  if (report.not_read.tests_skipped)
    notRead.push(
      `${report.not_read.tests_skipped} test, fixture or example ${report.not_read.tests_skipped === 1 ? "file or folder" : "files and folders"} (--include-tests reads them)`,
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

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

/** The draft as a Markdown table, for a /subprocessors page or a DPA annex. */
export function renderMarkdown(report: Report): string {
  const out: string[] = [];
  out.push(
    `<!-- Drafted by subprocessors ${report.version} on ${report.scanned_on} from the code in ${report.root}. ${report.notice} -->`,
    "",
    "| Sub-processor | Purpose | Personal data | Location | DPA |",
    "| --- | --- | --- | --- | --- |",
  );
  for (const r of report.subprocessors)
    out.push(
      `| ${cell(r.name)}${r.confidence === "medium" ? " (confirm)" : ""} | ${cell(r.purpose)} | ${cell(r.data)} | ${cell(r.region ?? "to confirm")} | ${r.dpa ? `[DPA](${r.dpa})` : "to find"} |`,
    );
  out.push("", "Detected from (remove this part before publishing):", "");
  for (const r of [...report.subprocessors, ...report.probably_not])
    out.push(
      `- **${r.name}**${r.kind === "tooling" ? " (probably not a sub-processor)" : ""}: ${[
        ...new Set(r.evidence.map(at)),
      ]
        .slice(0, SHOWN)
        .map((w) => `\`${w}\``)
        .join(", ")}`,
    );
  out.push("", `<!-- ${report.outside_code} -->`, "");
  return out.join("\n");
}

export function renderJson(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}

export function renderCheck(c: CheckResult): string {
  const against = c.against.kind === "list" ? c.against.file : `the code at ${c.against.ref}`;
  const out: string[] = [];
  out.push(
    `subprocessors ${c.version} check: ${c.root} against ${against} (${shortDate(c.checked_on)})`,
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
        "",
      ),
    );
  }
  if (c.added_probably_not.length) {
    out.push("");
    out.push(
      `New, probably not sub-processors (shown, not counted): ${c.added_probably_not.map((r) => `${r.name} (${detectedFrom(r, 1)})`).join("; ")}`,
    );
  }
  if (c.removed.length) {
    out.push("");
    out.push(
      wrap(
        `No longer seen in the code: ${c.removed.map((r) => r.name).join(", ")}. Still used outside the code, or gone? If gone, update the list${c.against.kind === "list" ? "" : ` (${LIST_FILE})`} and your public page.`,
        "",
      ),
    );
  }
  out.push("");
  out.push(wrap(c.notice, ""));
  out.push("");
  out.push(handoffText(c.handoff));
  return out.join("\n");
}

const escData = (s: string) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const escProp = (s: string) => escData(s).replace(/:/g, "%3A").replace(/,/g, "%2C");

/**
 * The Action's annotations: a warning on the line that brought each new sub-processor in, or an
 * error when `fail` is set. `prefix` joins the scanned path to the workspace root.
 */
export function annotations(c: CheckResult, opts: { prefix: string; fail: boolean }): string[] {
  const level = opts.fail ? "error" : "warning";
  return c.added.map((r) => {
    const e = r.evidence[0]!;
    const file =
      opts.prefix && opts.prefix !== "." ? `${opts.prefix.replace(/\/$/, "")}/${e.file}` : e.file;
    const msg = `${r.name} (${r.purpose}) is a new sub-processor. Tell your customers before this is deployed, with the time to object their DPA gives (often 30 days), then add it to ${LIST_FILE}. DPA: ${r.dpa ?? "not found"}.`;
    const line = e.line > 0 ? `,line=${e.line}` : "";
    return `::${level} file=${escProp(file)}${line},title=${escProp(`New sub-processor: ${r.name}`)}::${escData(msg)}`;
  });
}

/** The catalog, for `subprocessors vendors`. */
export function renderVendors(catalog: Catalog = CATALOG): string {
  const out = [
    `subprocessors ${version()}: ${catalog.vendors.length} vendors in the catalog, links read ${shortDate(catalog.updated)}`,
    "",
  ];
  for (const [id, cat] of Object.entries(catalog.categories)) {
    const vs = catalog.vendors.filter((v) => v.category === id);
    if (!vs.length) continue;
    out.push(`${cat.label}`);
    for (const v of vs)
      out.push(
        `  ${v.name.padEnd(24)} ${v.kind === "tooling" ? "(usually not) " : ""}DPA ${v.dpa ?? "not found"}`,
      );
    out.push("");
  }
  return out.join("\n");
}

export function vendorsJson(catalog: Catalog = CATALOG) {
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
      ...(v.note ? { note: v.note } : {}),
    })),
  };
}

export function renderError(e: Problem, json: boolean): string {
  if (json) return JSON.stringify({ error: e }, null, 2) + "\n";
  return `subprocessors: ${e.code}: ${e.cause}\n  fix: ${e.fix}\n`;
}
