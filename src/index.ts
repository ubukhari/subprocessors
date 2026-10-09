/**
 * The library behind the CLI: walk a repository, detect the vendors its code uses, draft the
 * sub-processor list, and check a change against the committed list or a git ref. The GitHub
 * Action (action.yml) imports `renderCheck` and `annotations` from here to render the JSON result
 * the CLI wrote.
 */
export {
  CATALOG,
  catalogProblems,
  dataGuess,
  vendorById,
  type Catalog,
  type Category,
  type Kind,
  type Matchers,
  type Service,
  type Vendor,
} from "./catalog.js";
export {
  Index,
  VERCEL_REGIONS,
  detect,
  envKey,
  normPypi,
  packageOf,
  type Detection,
  type Evidence,
  type EvidenceKind,
  type Hit,
  type RegionHint,
} from "./detect.js";
export { CliError, type Problem } from "./errors.js";
export { snapshotAt, type Exec, type Snapshot } from "./git.js";
export { HANDOFF_DETAIL, HANDOFF_LINE, HANDOFF_URL, PAGES_URL, REF } from "./handoff.js";
export {
  DUTY,
  LIST_FILE,
  checkAgainstBase,
  checkAgainstList,
  listFrom,
  parseList,
  type CheckResult,
  type ListEntry,
  type ListFile,
  type NotEntry,
} from "./list.js";
export { DEMO_DIR, check, main } from "./main.js";
export { TOOLS, callTool, handleMessage } from "./mcp.js";
export {
  annotations,
  detectedFrom,
  evidenceText,
  regionText,
  renderCheck,
  renderJson,
  renderMarkdown,
  renderText,
  renderVendors,
  shortDate,
  vendorsJson,
} from "./render.js";
export {
  DRAFT_NOTICE,
  OUTSIDE_CODE,
  reportFrom,
  rowsFrom,
  scanDir,
  scanFiles,
  vendorIds,
  type Report,
  type Row,
} from "./scan.js";
export {
  envNamesOnly,
  isEnvFile,
  isExampleEnv,
  walk,
  type RepoFile,
  type WalkResult,
} from "./walk.js";

/** The day the README sample was recorded on (scripts/sample.mjs). */
export const SAMPLE_DATE = "2026-10-09";
