/** `likely`: usually a sub-processor when the code uses it. `tooling`: usually not (CI, sign-in). */
type Kind = "likely" | "tooling";
/**
 * What finds a vendor in a repository. Every list is optional.
 *
 * - `npm`: a package name, an import specifier (`next-auth/providers/github`), or a prefix ending
 *   in `/` (`@aws-sdk/`).
 * - `pypi`: a PyPI project name, compared normalised (lower case, `_` and `.` as `-`); a name
 *   ending in `-` is a prefix (`google-cloud-`).
 * - `py`: a Python module, matched on dot boundaries (`google.cloud` matches `google.cloud.storage`).
 * - `go`: a Go module path prefix.
 * - `gem`: a RubyGems name; a name ending in `-` is a prefix.
 * - `env`: an environment variable name, or a prefix ending in `_`. Matched after a framework's
 *   public prefix is removed (`NEXT_PUBLIC_STRIPE_KEY` is `STRIPE_KEY`).
 * - `hosts`: a host, or host and path, as written in a string literal (`hooks.slack.com`).
 * - `files`: an infrastructure file by name at any depth (`vercel.json`), a path suffix
 *   (`supabase/config.toml`), or a directory ending in `/` (`.github/workflows/`).
 * - `terraform`: a Terraform provider's local name (`provider "aws"`).
 */
interface Matchers {
    npm?: string[];
    pypi?: string[];
    py?: string[];
    go?: string[];
    gem?: string[];
    env?: string[];
    hosts?: string[];
    files?: string[];
    terraform?: string[];
}
/** A narrower use of a vendor, with its own purpose: S3 is storage, SES is email. */
interface Service extends Matchers {
    purpose: string;
}
interface Vendor {
    id: string;
    name: string;
    category: string;
    kind: Kind;
    /** What the vendor is usually engaged for. */
    purpose: string;
    /** Overrides the category's data guess. */
    data?: string;
    /** The vendor's data processing agreement, or null when none could be found. */
    dpa: string | null;
    /** The vendor's own sub-processor list, or null when none could be found. */
    list: string | null;
    /** The day both links were fetched and answered. */
    seen: string;
    note?: string;
    match: Matchers;
    services?: Service[];
}
interface Category {
    label: string;
    /** A guess at the personal data a vendor in this category receives. */
    data: string;
}
interface Catalog {
    updated: string;
    about: string;
    categories: Record<string, Category>;
    vendors: Vendor[];
}
declare const CATALOG: Catalog;
/** Every problem with a catalog, or none. The tests hold the bundled one to it. */
declare function catalogProblems(c: Catalog): string[];
declare function vendorById(id: string, c?: Catalog): Vendor | undefined;
/** The data guess for a vendor: its own, or its category's. */
declare function dataGuess(v: Vendor, c?: Catalog): string;

interface RepoFile {
    /** Relative to the scanned root, with `/` separators. */
    path: string;
    text: string;
}
interface WalkResult {
    files: RepoFile[];
    /** Real env files found and not opened. */
    skippedEnv: string[];
    /** Files over the size limit, not read. */
    skippedLarge: string[];
    /** Test, fixture and example files not read (a count). */
    skippedTests: number;
    /** true when the file limit stopped the walk early. */
    truncated: boolean;
}
interface WalkOptions {
    includeTests?: boolean;
    /** Bytes; a larger file is not read. */
    maxBytes?: number;
    /** Files read at most. */
    maxFiles?: number;
}
/** A file named like an env file: `.env`, `.env.local`, `env.example`, `.dev.vars`, `prod.env`. */
declare function isEnvFile(name: string): boolean;
/** An env file that holds example values: `.env.example`, `.env.local.sample`, `example.env`. */
declare function isExampleEnv(name: string): boolean;
/** Walk `root` and read the files the detectors use. Deterministic: sorted, depth first. */
declare function walk(root: string, opts?: WalkOptions): Promise<WalkResult>;
/**
 * An example env file reduced to its names, line for line: `NAME=` where the file had
 * `NAME=value`, and an empty line for anything else. Values are dropped here, before any detector
 * sees the text, so no later step can print or keep one.
 */
declare function envNamesOnly(text: string): string;

/**
 * The detectors: from the files a walk read, every place the code shows it uses a catalog vendor,
 * as file, line, kind and what was seen. Each one reads names only: package names, import
 * specifiers, API hosts, env variable names (never values), infrastructure file names, Terraform
 * providers, and the regions those files set.
 */

/**
 * `host` is an API host inside a URL (`https://api.resend.com/emails`): a call. `mention` is the
 * same host as a bare string (`"api.openai.com"` in a list of hosts): named, not shown to be called.
 */
type EvidenceKind = "dependency" | "dev-dependency" | "import" | "host" | "mention" | "env" | "config" | "terraform";
interface Evidence {
    file: string;
    line: number;
    kind: EvidenceKind;
    /** What was seen there: a package, an import, a host, an env variable name, a file. */
    what: string;
}
interface Hit {
    vendor: string;
    /** A service's own purpose, when the hit came from a service matcher. */
    purpose?: string;
    evidence: Evidence;
}
interface RegionHint {
    vendor: string;
    region: string;
    file: string;
    line: number;
}
interface Detection {
    hits: Hit[];
    regions: RegionHint[];
}
interface Target {
    vendor: Vendor;
    purpose?: string;
}
type MatchKey = keyof Matchers;
/** Lookup tables for one catalog, built once. */
declare class Index {
    readonly catalog: Catalog;
    private readonly exact;
    private readonly prefix;
    readonly hostPattern: RegExp | null;
    private readonly hostTargets;
    readonly files: {
        pattern: string;
        target: Target;
    }[];
    constructor(catalog?: Catalog);
    /** Every target a name of this kind hits; a service's hit replaces its vendor's plain one. */
    lookup(key: MatchKey, name: string): Target[];
    hostTargetsOf(host: string): Target[];
}
declare function normPypi(name: string): string;
declare function envKey(name: string): string;
/** The package an import specifier names: `@scope/pkg/sub` → `@scope/pkg`, `pkg/sub` → `pkg`. */
declare function packageOf(spec: string): string;
/** Vercel's region codes (vercel.com/docs/regions), as the region column shows them. */
declare const VERCEL_REGIONS: Record<string, string>;
declare function detect(files: readonly RepoFile[], index?: Index): Detection;

/** Every error and warning carries what went wrong, why, how to fix it, and whether a retry helps. */
interface Problem {
    code: string;
    cause: string;
    fix: string;
    retryable: boolean;
}
declare class CliError extends Error implements Problem {
    readonly code: string;
    readonly cause: string;
    readonly fix: string;
    readonly retryable: boolean;
    /** 2 for a usage mistake, 1 for anything else */
    readonly exitCode: number;
    constructor(p: Problem, exitCode?: number);
    toJSON(): Problem;
}

type Exec = (cmd: string, args: string[], cwd: string) => Promise<string>;
interface Snapshot {
    dir: string;
    cleanup: () => Promise<void>;
}
/** Extract `dir` as it was at `ref` into a temporary directory. */
declare function snapshotAt(dir: string, ref: string, exec?: Exec): Promise<Snapshot>;

/**
 * The hand-off, worded as not built (brief DOOR-18). A hosted list fits agentcheck's services, but
 * it needs a database migration and a brief of its own, so it is a waitlist first: every run and
 * every page ends with the same sentence and a link to the /subprocessors waitlist button, whose
 * click is the count. No price is named until one is decided and its checkout works.
 */
/** The pages, and where a run's links land. */
declare const PAGES_URL = "https://agentwares-agentcheck.vercel.app/subprocessors";
/** The `?ref=` value the pages record for links this CLI prints. */
declare const REF = "subprocessors";
/** Where a run's hand-off line points: the index's ledger section. */
declare const HANDOFF_URL = "https://agentwares-agentcheck.vercel.app/subprocessors?ref=subprocessors#ledger";
/** The hand-off, word for word, at the end of every run and in the ledger section of every page. */
declare const HANDOFF_LINE = "A hosted, dated sub-processor page that emails your customers each change is not built.";
/** What it would do, and what agentcheck serves today. */
declare const HANDOFF_DETAIL: string;

/**
 * From detections to the draft: one row per vendor, with every piece of evidence, the region where
 * the code says it, and the vendor's DPA and own list from the catalog. Vendors that are usually
 * not sub-processors (CI, sign-in providers) come apart, for the user to confirm either way.
 */

/** On every output: what this is, and what it is not. */
declare const DRAFT_NOTICE = "A draft to review, not legal advice. Each row is a vendor the code shows it uses; whether it is your sub-processor depends on the personal data you send it and on your contracts. Confirm every row before you publish the list.";
/** Also on every output: what a list taken from code cannot see. */
declare const OUTSIDE_CODE = "A list taken from code misses vendors outside it: your workspace (email, documents), support desk, CRM, payroll and anything your team uses by hand. Add those yourself.";
type Confidence = "high" | "medium";
interface Row {
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
interface Report {
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
    catalog: {
        updated: string;
        vendors: number;
    };
    outside_code: string;
    handoff: {
        line: string;
        detail: string;
        url: string;
    };
}
declare function rowsFrom(detection: Detection, catalog?: Catalog): Row[];
interface ScanInput {
    /** The directory scanned, as the user named it (shown in the report). */
    shown: string;
    now: Date;
    catalog?: Catalog;
}
/** The report for files already read: pure, for tests and for `check --base`. */
declare function reportFrom(walked: WalkResult, input: ScanInput): Report;
/** Scan a directory on this machine. */
declare function scanDir(dir: string, input: ScanInput & WalkOptions): Promise<Report>;
/** Scan files given in memory (the MCP tool's tests, the README sample). */
declare function scanFiles(files: RepoFile[], input: ScanInput): Report;
/** Every vendor id in a report, sub-processors and the rest. */
declare function vendorIds(r: Report): string[];

declare const LIST_FILE = "subprocessors.json";
/** What adding a vendor means, in every check's output. */
declare const DUTY = "Adding a sub-processor is a dated event: under GDPR Art. 28(2) your customers must be told before it processes their data, with the time to object their DPA gives (often 30 days, sometimes 14). Send the notice before this change is deployed, then add the vendor to subprocessors.json.";
type Status = "draft" | "confirmed";
interface ListEntry {
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
interface NotEntry {
    id: string;
    name: string;
    reason: string;
}
interface ListFile {
    about: string;
    updated: string;
    subprocessors: ListEntry[];
    /** Vendors the code uses that the user decided are not sub-processors (CI, sign-in). */
    not_subprocessors: NotEntry[];
}
/** The list `init` writes: the draft's sub-processors, and the rest set aside with a reason. */
declare function listFrom(report: Report): ListFile;
/** Parse and check a committed list; any shape problem is an error naming the file. */
declare function parseList(text: string, file: string): ListFile;
type Against = {
    kind: "list";
    file: string;
} | {
    kind: "base";
    ref: string;
};
interface CheckResult {
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
    removed: {
        id: string;
        name: string;
    }[];
    notice: string;
    duty: string;
    handoff: Report["handoff"];
}
/** Compare a draft with a committed list. */
declare function checkAgainstList(report: Report, list: ListFile, file: string): CheckResult;
/** Compare a draft with the draft of the same directory at a git ref. */
declare function checkAgainstBase(head: Report, base: Report, ref: string): CheckResult;

interface Deps {
    stdout: (s: string) => void;
    stderr: (s: string) => void;
    now?: () => Date;
    cwd?: string;
    exec?: Exec;
}
declare function main(argv: string[], deps?: Deps): Promise<number>;
declare const DEMO_DIR = "examples/demo-repo";
interface CheckOptions {
    list?: string;
    base?: string;
    includeTests?: boolean;
    exec?: Exec;
}
/** The whole check, for the CLI and the MCP tool alike. */
declare function check(shown: string, cwd: string, now: Date, opts: CheckOptions): Promise<CheckResult>;

interface ToolDefinition {
    name: string;
    title: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: Record<string, Record<string, unknown>>;
        required?: string[];
        additionalProperties: false;
    };
    annotations: {
        title: string;
        readOnlyHint: boolean;
        destructiveHint: boolean;
        idempotentHint: boolean;
        openWorldHint: boolean;
    };
}
declare const TOOLS: readonly ToolDefinition[];
interface McpContext {
    cwd?: string;
    exec?: Exec;
    now?: () => Date;
}
declare function callTool(name: string, rawArgs: unknown, ctx?: McpContext): Promise<{
    structured: Record<string, unknown>;
    isError: boolean;
}>;
declare function handleMessage(msg: unknown, ctx: McpContext): Promise<unknown>;

/** `2026-10-09` → `9 Oct 2026`. */
declare function shortDate(day: string): string;
declare function evidenceText(e: Evidence): string;
declare function detectedFrom(r: Row, shown?: number): string;
declare function regionText(r: Row): string;
declare function renderText(report: Report): string;
/** The draft as a Markdown table, for a /subprocessors page or a DPA annex. */
declare function renderMarkdown(report: Report): string;
declare function renderJson(value: unknown): string;
declare function renderCheck(c: CheckResult): string;
/**
 * The Action's annotations: a warning on the line that brought each new sub-processor in, or an
 * error when `fail` is set. `prefix` joins the scanned path to the workspace root.
 */
declare function annotations(c: CheckResult, opts: {
    prefix: string;
    fail: boolean;
}): string[];
/** The catalog, for `subprocessors vendors`. */
declare function renderVendors(catalog?: Catalog): string;
declare function vendorsJson(catalog?: Catalog): {
    tool: string;
    version: string;
    updated: string;
    about: string;
    vendors: {
        note?: string | undefined;
        id: string;
        name: string;
        category: string;
        kind: Kind;
        purpose: string;
        data: string;
        dpa: string | null;
        list: string | null;
        links_seen: string;
    }[];
};

/**
 * The library behind the CLI: walk a repository, detect the vendors its code uses, draft the
 * sub-processor list, and check a change against the committed list or a git ref. The GitHub
 * Action (action.yml) imports `renderCheck` and `annotations` from here to render the JSON result
 * the CLI wrote.
 */

/** The day the README sample was recorded on (scripts/sample.mjs). */
declare const SAMPLE_DATE = "2026-10-09";

export { CATALOG, type Catalog, type Category, type CheckResult, CliError, DEMO_DIR, DRAFT_NOTICE, DUTY, type Detection, type Evidence, type EvidenceKind, type Exec, HANDOFF_DETAIL, HANDOFF_LINE, HANDOFF_URL, type Hit, Index, type Kind, LIST_FILE, type ListEntry, type ListFile, type Matchers, type NotEntry, OUTSIDE_CODE, PAGES_URL, type Problem, REF, type RegionHint, type RepoFile, type Report, type Row, SAMPLE_DATE, type Service, type Snapshot, TOOLS, VERCEL_REGIONS, type Vendor, type WalkResult, annotations, callTool, catalogProblems, check, checkAgainstBase, checkAgainstList, dataGuess, detect, detectedFrom, envKey, envNamesOnly, evidenceText, handleMessage, isEnvFile, isExampleEnv, listFrom, main, normPypi, packageOf, parseList, regionText, renderCheck, renderJson, renderMarkdown, renderText, renderVendors, reportFrom, rowsFrom, scanDir, scanFiles, shortDate, snapshotAt, vendorById, vendorIds, vendorsJson, walk };
